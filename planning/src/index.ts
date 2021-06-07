import {
  combinedSavingSchedule,
  monthlySavingSchedule,
  weeklySavingSchedule,
  yearlySavingSchedule
} from "./saving-schedules";

export interface StreamEvent {
  type: string
  version: number
}

class CreateAccountEvent implements StreamEvent {
  public static type = "CREATE_ACCOUNT"

  public static is(e: StreamEvent): e is CreateAccountEvent {
    return e.type === CreateAccountEvent.type
  }

  type = CreateAccountEvent.type
  version = 1

  accountName: string

  constructor(accountName: string) {
    this.accountName = accountName
  }
}

class TransactEvent implements StreamEvent {
  public static type = "TRANSACT"

  public static is(e: StreamEvent): e is TransactEvent {
    return e.type === TransactEvent.type
  }

  type = TransactEvent.type
  version = 1

  accountName: string
  date: string
  value: number
  target: string | null
  memo: string | null

  constructor(accountName: string, date: string, value: number, target?: string, memo?: string) {
    this.accountName = accountName
    this.date = date
    this.value = value
    this.target = target || null
    this.memo = memo || null
  }
}

class TransferEvent implements StreamEvent {
  public static type = "TRANSFER"

  public static is(e: StreamEvent): e is TransferEvent {
    return e.type === TransferEvent.type
  }

  type = TransferEvent.type
  version = 1

  sourceAccount: string
  destinationAccount: string
  value: number

  constructor(sourceAccount: string, destinationAccount: string, value: number) {
    this.sourceAccount = sourceAccount
    this.destinationAccount = destinationAccount
    this.value = value
  }
}

export interface EventStream {
  append(event: StreamEvent): Promise<void>
  project<T>(fold: (result: T, event: StreamEvent) => T, initialValue: T): Promise<T>
}

export function InMemoryEventStream(): EventStream & { events: StreamEvent[] } {
  const events: StreamEvent[] = []

  return {
    async append(event: StreamEvent) {
      events.push(event)
    },

    async project<T>(fold: (result: T, event: StreamEvent) => T, initialValue: T) {
      return events.reduce(fold, initialValue)
    },

    events
  }
}

export function CreateAccount(eventStream: EventStream) {
  return async (accountName: string) => {
    await eventStream.append(new CreateAccountEvent(accountName))
  }
}

export function CreditAccount(eventStream: EventStream) {
  return async (accountName: string, value: number, date: string, target?: string, memo?: string) => {
    await eventStream.append(new TransactEvent(accountName, date, value, target, memo))
  }
}

export function DebitAccount(eventStream: EventStream) {
  return async (accountName: string, value: number, date: string, target?: string, memo?: string) => {
    await eventStream.append(new TransactEvent(accountName, date, -value, target, memo))
  }
}

export function TransferFunds(eventStream: EventStream) {
  return async (sourceAccount: string, destinationAccount: string, value: number, date: string) => {
    await eventStream.append(new TransferEvent(sourceAccount, destinationAccount, value))
  }
}

export function GetBalances(eventStream: EventStream) {
  return async () => {
    return eventStream.project((result, event) => {
      if (CreateAccountEvent.is(event)) return {
        ...result,
        [event.accountName]: 0,
      }

      if (TransactEvent.is(event)) return {
        ...result,
        [event.accountName]: result[event.accountName] + event.value,
      }

      if (TransferEvent.is(event)) return {
        ...result,
        [event.sourceAccount]: result[event.sourceAccount] - event.value,
        [event.destinationAccount]: result[event.destinationAccount] + event.value,
      }

      return result
    }, {})
  }
}

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
  return async (date: string): Promise<{[targetName: string]: Target}> => {
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
  return async (date: string): Promise<{[targetName: string]: string}> => {
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

    for(let nextGoal = savingSchedule.next(); !nextGoal.done && totalAllocation < totalBalance; nextGoal = savingSchedule.next()) {
      let amountToAllocate = 0
      expendituresByTarget[nextGoal.value.target] = (expendituresByTarget[nextGoal.value.target] || 0) - nextGoal.value.amount
      if(expendituresByTarget[nextGoal.value.target] < 0) {
        amountToAllocate = -expendituresByTarget[nextGoal.value.target]
        expendituresByTarget[nextGoal.value.target] = 0
      }

      if(amountToAllocate + overspend[nextGoal.value.target] + totalAllocation <= totalBalance) {
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
  return async (date: string): Promise<{[targetName: string]: number}> => {
    const localDate = new LocalDate(date)
    return eventStream.project((result, event) => {
      if (CreateTargetEvent.is(event)) {
        const schedule = scheduleGenerators[event.cadence](event.targetName, [[event.startDate, event.targetValue]])

        let accruedBudget = 0
        for(let trigger = schedule.next(); !trigger.done && !(new LocalDate(trigger.value.date)).isAfter(localDate); trigger = schedule.next()) {
          accruedBudget += trigger.value.amount
        }

        return {
          ...result,
          [event.targetName]: accruedBudget
        }
      }

      if (TransactEvent.is(event)) {
        if(!event.target) return result

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

class LocalDate {
  private readonly datestring: string
  year: number
  month: number
  day: number

  constructor(datestring: string);
  constructor(year: number, month: number, day: number);
  constructor(yearOrDatestring: number | string, month?: number, day?: number) {
    if (typeof yearOrDatestring === "string") {
      const [year, month, day] = yearOrDatestring.split("-").map(s => parseInt(s))
      this.year = year
      this.month = month
      this.day = day
      this.datestring = yearOrDatestring
    } else {
      this.year = yearOrDatestring
      this.month = month
      this.day = day
      this.datestring = `${this.year}-${this.month}-${this.day}`
    }
  }

  isAfter(other: LocalDate): boolean {
    if (this.year > other.year) return true
    if (this.year === other.year && this.month > other.month) return true
    return this.year === other.year && this.month === other.month && this.day > other.day;
  }
}

export interface Target {
  priority: number,
  cadence: "WEEKLY" | "MONTHLY" | "YEARLY",
  values: Array<[string, number]>
}
