import {filterObject, LocalDate, mapObject, reduceObject} from "@budgie/language-support";
import {EventStream, StreamEvent} from "../event-stream";
import {
  combinedSavingSchedule,
  monthlySavingSchedule,
  shiftMonths,
  shiftYears,
  weeklySavingSchedule,
  yearlySavingSchedule
} from "./saving-schedules";
import {GetBalances, TransactEvent} from "../bookkeeping";

export function CreateMonthlyTarget(eventStream: EventStream) {
  return async (startDate: string, targetName: string, targetValue: number, priority: number) => {
    await eventStream.append(new CreateTargetEvent(
      startDate,
      targetName,
      targetValue,
      "MONTHLY",
      priority,
    ))
  }
}

export function CreateWeeklyTarget(eventStream: EventStream) {
  return async (startDate: string, targetName: string, targetValue: number, priority: number) => {
    await eventStream.append(new CreateTargetEvent(
      startDate,
      targetName,
      targetValue,
      "WEEKLY",
      priority,
    ))
  }
}

export function CreateYearlyTarget(eventStream: EventStream) {
  return async (startDate: string, targetName: string, targetValue: number, priority: number) => {
    await eventStream.append(new CreateTargetEvent(
      startDate,
      targetName,
      targetValue,
      "YEARLY",
      priority,
    ))
  }
}

export function GetTargets(eventStream: EventStream) {
  return async (date: string): Promise<{ [targetName: string]: Target }> => {
    return eventStream.project((result, event) => {
      if (CreateTargetEvent.is(event)) {
        return {
          ...result,
          [event.targetName]: {
            priority: event.priority,
            cadence: event.cadence,
            values: [[event.startDate, event.targetValue]]
          }
        }
      }
      return result
    }, {})
  }
}

export function GetExpendituresByTarget(eventStream: EventStream) {
  return async (date: string) => {
    return eventStream.project((result, event) => {
      if (TransactEvent.is(event) && !(new LocalDate(event.date).isAfter(new LocalDate(date)))) {
        const mergedTotals = Object.keys(event.itemizedAmounts).reduce((totals, nextTarget) => {
          if(nextTarget === "_") return totals
          return {
            ...totals,
            [nextTarget]: (result[nextTarget] || 0) - event.itemizedAmounts[nextTarget]
          }
        }, {})

        return {
          ...result,
          ...mergedTotals
        }
      }

      return result
    }, {})
  }
}

const scheduleGenerators = {
  "WEEKLY": weeklySavingSchedule,
  "MONTHLY": monthlySavingSchedule,
  "YEARLY": yearlySavingSchedule,
}

export function GetSpendingRate(eventStream: EventStream) {
  return async (date: string): Promise<number> => {
    const targets = await GetTargets(eventStream)(date)
    const savingSchedule = combinedSavingSchedule(
      Object.keys(targets).map(targetName => [
        scheduleGenerators[targets[targetName].cadence](targetName, targets[targetName].values),
        targets[targetName].priority
      ])
    )

    const stopDate = new LocalDate(shiftYears(1)(date));
    let expense = 0
    let next;
    for(next = savingSchedule.next(); !next.done && new LocalDate(date).isAfter(new LocalDate(next.value.date)); next = savingSchedule.next()){}
    for(next = savingSchedule.next(); !next.done && !(new LocalDate(next.value.date).isAfter(stopDate)); next = savingSchedule.next()) {
      expense += next.value.amount
    }

    return expense / 12
  }
}

export function GetRunway(eventStream: EventStream) {
  return async (date: string): Promise<{ [targetName: string]: string }> => {
    const targets = await GetTargets(eventStream)(date)
    const balances = await GetBalances(eventStream)(date)
    const totalBalance = Object.keys(balances).reduce((total, account) => total + balances[account], 0)
    const expendituresByTarget = await GetExpendituresByTarget(eventStream)(date)
    const currentBudgets = await GetBudgets(eventStream)(date)
    const overspend = Object.keys(currentBudgets).reduce((result, target) => ({
      ...result,
      [target]: currentBudgets[target].accruedBudget < 0 ? -currentBudgets[target].accruedBudget : 0
    }), {})

    const savingSchedule = combinedSavingSchedule(
      Object.keys(targets).map(targetName => [
        scheduleGenerators[targets[targetName].cadence](targetName, targets[targetName].values),
        targets[targetName].priority
      ])
    )

    const runway = Object.keys(targets).reduce((result, nextName) => ({
      ...result,
      [nextName]: null
    }), {})

    let totalAllocation = 0

    for (let nextGoal = savingSchedule.next(); !nextGoal.done && totalAllocation < totalBalance; nextGoal = savingSchedule.next()) {
      let amountToAllocate = 0
      expendituresByTarget[nextGoal.value.target] = (expendituresByTarget[nextGoal.value.target] || 0) - nextGoal.value.amount
      if (expendituresByTarget[nextGoal.value.target] < 0) {
        amountToAllocate = -expendituresByTarget[nextGoal.value.target]
        expendituresByTarget[nextGoal.value.target] = 0
      }

      if (amountToAllocate + overspend[nextGoal.value.target] + totalAllocation <= totalBalance) {
        totalAllocation += amountToAllocate
        runway[nextGoal.value.target] = nextGoal.value.date
      } else {
        break
      }
    }

    return runway
  }
}

const numberOfWeeksBetween = (from: string, to: string) => {
  return (new Date(to).getTime() - new Date(from).getTime()) / (7 * 24 * 60 * 60 * 1000)
}

export function GetRunwayTrend(eventStream: EventStream) {
  async function runwayWeeksAsOf(dateOfInterest: string): Promise<number> {
    const runway = await GetRunway(eventStream)(dateOfInterest)
    const earliestDate = reduceObject(runway, (earliest: string, _: string, date: string) => {
      return earliest < date ? earliest : date
    }, "9999-12-31")

    return numberOfWeeksBetween(dateOfInterest, earliestDate)
  }

  return async (from: string, to: string): Promise<{ [date: string]: number }> => {
    const trend = {}
    let dateOfInterest = from

    while(dateOfInterest <= to) {
      trend[dateOfInterest] = Math.round(await runwayWeeksAsOf(dateOfInterest))
      dateOfInterest = shiftMonths(1)(dateOfInterest)
    }

    return trend
  }
}

export interface TargetWithAccruedBudget extends Target {
  accruedBudget: number
}

function scheduleUtility(schedule: Generator<{ date: string; amount: number; target: string }, { date: string; amount: number; target: string }, unknown>) {
  function forEachEventUntil(date: string, work: (trigger: (IteratorYieldResult<{ date: string; amount: number; target: string }> | IteratorReturnResult<{ date: string; amount: number; target: string }>)) => void) {
    for (let trigger = schedule.next(); !trigger.done && trigger.value.date <= date; trigger = schedule.next()) {
      work(trigger);
    }
  }

  function reduceEventsUntil<T>(
    date: string,
    work: (resultSoFar: T, trigger: (IteratorYieldResult<{ date: string; amount: number; target: string }> | IteratorReturnResult<{ date: string; amount: number; target: string }>)) => T,
    initialValue: T
  ): T {
    let result = initialValue
    forEachEventUntil(date, trigger => result = work(result, trigger))
    return result
  }

  return {
    forEachEventUntil,
    reduceEventsUntil
  }
}

function scheduleFor(targetName: string, target: Target) {
  return scheduleUtility(scheduleGenerators[target.cadence](targetName, target.values));
}

export function GetBudgets(eventStream: EventStream) {
  return async (asOfDate: string): Promise<{ [targetName: string]: TargetWithAccruedBudget }> => {
    const targetsWithAccruedBudgets: {[name: string]: TargetWithAccruedBudget} =
      mapObject(
        await GetTargets(eventStream)(asOfDate),
        (targetName, target) => ({
          ...target,
          accruedBudget: scheduleFor(targetName, target)
            .reduceEventsUntil(
              asOfDate,
              (accruedBudget, trigger) =>
                accruedBudget + trigger.value.amount,
              0
            )
        })
      )

    const targetsWithNetBudgets = await eventStream.project((result, event) => {
      if (!TransactEvent.is(event)) return result;

      return reduceObject(
        filterObject(
          event.itemizedAmounts,
          targetName => targetName !== "_" && targetsWithAccruedBudgets[targetName] !== undefined
        ),
        (updatedTargets, targetName, amountForTarget) => ({
          ...updatedTargets,
          [targetName]: {
            ...updatedTargets[targetName],
            accruedBudget: updatedTargets[targetName].accruedBudget + amountForTarget
          }
        }),
        result
      )
    }, targetsWithAccruedBudgets)

    return targetsWithNetBudgets
  }
}

class CreateTargetEvent implements StreamEvent {
  public static type = "CREATE_TARGET"

  public static is(e: StreamEvent): e is CreateTargetEvent {
    return e.type === CreateTargetEvent.type
  }

  type = CreateTargetEvent.type
  version = 1

  startDate: string
  targetName: string
  targetValue: number
  cadence: "WEEKLY" | "MONTHLY" | "YEARLY"
  priority: number

  constructor(
    startDate: string,
    targetName: string,
    targetValue: number,
    cadence: "WEEKLY" | "MONTHLY" | "YEARLY",
    priority: number,
  ) {
    this.startDate = startDate
    this.targetName = targetName
    this.targetValue = targetValue
    this.cadence = cadence
    this.targetName = targetName
    this.priority = priority
  }
}

export interface Target {
  priority: number,
  cadence: "WEEKLY" | "MONTHLY" | "YEARLY",
  values: Array<[string, number]>
}
