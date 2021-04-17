interface StreamEvent {
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
  value: number

  constructor(accountName: string, value: number) {
    this.accountName = accountName
    this.value = value
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

interface EventStream {
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
  return async (accountName: string, value: number) => {
    await eventStream.append(new TransactEvent(accountName, value))
  }
}

export function DebitAccount(eventStream: EventStream) {
  return async (accountName: string, value: number) => {
    await eventStream.append(new TransactEvent(accountName, -value))
  }
}

export function TransferFunds(eventStream: EventStream) {
  return async (sourceAccount: string, destinationAccount: string, value: number) => {
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

export function GetTargets(eventStream: EventStream) {
  return async (date: string): Promise<{[targetName: string]: Target}> => {
    return eventStream.project((result, event) => {
      if (CreateTargetEvent.is(event)) {
        return {
          ...result,
          [event.targetName]: {
            deltaToNextPayment: event.targetValue * triggersBetween(event.startDate, date, event.cadence),
            fundedUntil: event.startDate,
            priority: event.priority
          }
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
  cadence: "WEEKLY" | "MONTHLY"
  priority: number
  allocateFrom: string

  constructor(startDate: string, targetName: string, targetValue: number, cadence: "WEEKLY" | "MONTHLY", priority: number, allocateFrom: string) {
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

  plusDays(n: number): LocalDate {
    const newDate = new Date(this.datestring)
    newDate.setDate(newDate.getDate() + n)
    return new LocalDate(`${newDate.getFullYear()}-${newDate.getMonth() + 1}-${newDate.getDate() + 1}`)
  }

  plusMonths(n: number): LocalDate {
    if (this.month === 12) return new LocalDate(this.year + 1, 1, this.day);
    return new LocalDate(this.year, this.month + 1, this.day)
  }

  isAfter(other: LocalDate): boolean {
    if (this.year > other.year) return true
    if (this.year === other.year && this.month > other.month) return true
    return this.year === other.year && this.month === other.month && this.day > other.day;
  }
}

function triggersBetween(start: string, end: string, cadence: "WEEKLY" | "MONTHLY") {
  let startDate = new LocalDate(start)
  const endDate = new LocalDate(end)
  let triggers = 0

  while (!startDate.isAfter(endDate)) {
    switch (cadence) {
      case "WEEKLY":
        startDate = startDate.plusDays(7)
        break
      case "MONTHLY":
        startDate = startDate.plusMonths(1)
        break
      default:
        throw new Error(`Unsupported cadence string: ${cadence}`)
    }
    triggers++
  }

  return triggers
}

export interface Target {
  fundedUntil: string
  deltaToNextPayment: number
  priority: number
}
