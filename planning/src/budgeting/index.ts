import {EventStream, StreamEvent} from "../event-stream";
import {
  combinedSavingSchedule,
  monthlySavingSchedule,
  weeklySavingSchedule,
  yearlySavingSchedule
} from "./saving-schedules";
import {GetBalances, TransactEvent} from "../bookkeeping";
import {LocalDate} from "../date-support";

export function CreateMonthlyTarget(eventStream: EventStream) {
  return async (startDate: string, targetName: string, targetValue: number, priority: number, allocateFrom: string) => {
    await eventStream.append(new CreateTargetEvent(
      startDate,
      targetName,
      targetValue,
      "MONTHLY",
      priority,
      allocateFrom,
    ))
  }
}

export function CreateWeeklyTarget(eventStream: EventStream) {
  return async (startDate: string, targetName: string, targetValue: number, priority: number, allocateFrom: string) => {
    await eventStream.append(new CreateTargetEvent(
      startDate,
      targetName,
      targetValue,
      "WEEKLY",
      priority,
      allocateFrom,
    ))
  }
}

export function CreateYearlyTarget(eventStream: EventStream) {
  return async (startDate: string, targetName: string, targetValue: number, priority: number, allocateFrom: string) => {
    await eventStream.append(new CreateTargetEvent(
      startDate,
      targetName,
      targetValue,
      "YEARLY",
      priority,
      allocateFrom,
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
      if (TransactEvent.is(event) && event.target && !(new LocalDate(event.date).isAfter(new LocalDate(date)))) return {
        ...result,
        [event.target]: (result[event.target] || 0) - event.value,
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

export function GetRunway(eventStream: EventStream) {
  return async (date: string): Promise<{ [targetName: string]: string }> => {
    const targets = await GetTargets(eventStream)(date)
    const balances = await GetBalances(eventStream)()
    const totalBalance = Object.keys(balances).reduce((total, account) => total + balances[account], 0)
    const expendituresByTarget = await GetExpendituresByTarget(eventStream)(date)
    const currentBudgets = await GetBudgets(eventStream)(date)
    const overspend = Object.keys(currentBudgets).reduce((result, target) => ({
      ...result,
      [target]: currentBudgets[target] < 0 ? -currentBudgets[target] : 0
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

export function GetBudgets(eventStream: EventStream) {
  return async (date: string): Promise<{ [targetName: string]: number }> => {
    const localDate = new LocalDate(date)
    return eventStream.project((result, event) => {
      if (CreateTargetEvent.is(event)) {
        const schedule = scheduleGenerators[event.cadence](event.targetName, [[event.startDate, event.targetValue]])

        let accruedBudget = 0
        for (let trigger = schedule.next(); !trigger.done && !(new LocalDate(trigger.value.date)).isAfter(localDate); trigger = schedule.next()) {
          accruedBudget += trigger.value.amount
        }

        return {
          ...result,
          [event.targetName]: accruedBudget
        }
      }

      if (TransactEvent.is(event)) {
        if (!event.target) return result

        return {
          ...result,
          [event.target]: result[event.target] + event.value
        }
      }

      return result
    }, {})
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
  allocateFrom: string

  constructor(
    startDate: string,
    targetName: string,
    targetValue: number,
    cadence: "WEEKLY" | "MONTHLY" | "YEARLY",
    priority: number,
    allocateFrom: string
  ) {
    this.startDate = startDate
    this.targetName = targetName
    this.targetValue = targetValue
    this.cadence = cadence
    this.targetName = targetName
    this.priority = priority
    this.allocateFrom = allocateFrom
  }
}

export interface Target {
  priority: number,
  cadence: "WEEKLY" | "MONTHLY" | "YEARLY",
  values: Array<[string, number]>
}