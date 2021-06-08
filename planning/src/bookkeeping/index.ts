import {EventStream, StreamEvent} from "../event-stream";

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

export type Itemization = { [target: string]: number }

export class TransactEvent implements StreamEvent {
  public static type = "TRANSACT"

  public static is(e: StreamEvent): e is TransactEvent {
    return e.type === TransactEvent.type && e.version === 2
  }

  type = TransactEvent.type
  version = 2

  constructor(
    public accountName: string,
    public date: string,
    public itemizedAmounts: Itemization,
    public memo: string = ""
  ) {}
}

export class TransactEvent__V1 implements StreamEvent {
  public static type = "TRANSACT"

  public static is(e: StreamEvent): e is TransactEvent {
    return e.type === TransactEvent.type && e.version === 1
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

export const EVENT_MIGRATIONS = {
  [`${TransactEvent.type}__1`]: (v1: TransactEvent__V1): TransactEvent => new TransactEvent(
    v1.accountName,
    v1.date,
    {[v1.target || "_"]: v1.value},
    v1.memo
  )
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

export function CreateAccount(eventStream: EventStream) {
  return async (accountName: string) => {
    await eventStream.append(new CreateAccountEvent(accountName))
  }
}

export function CreditAccount(eventStream: EventStream) {
  return async (accountName: string, amount: number | Itemization, date: string, target?: string, memo?: string) => {
    const itemizedAmounts = (typeof amount === "number")
      ? { ["_" as string] : amount }
      : Object.keys(amount).reduce((result, nextKey) => ({...result, [nextKey]: amount[nextKey]}), {})
    await eventStream.append(new TransactEvent(accountName, date, itemizedAmounts, memo))
  }
}

export function DebitAccount(eventStream: EventStream) {
  return async (accountName: string, amount: number | Itemization, date: string, target?: string, memo?: string) => {
    const itemizedAmounts = (typeof amount === "number")
      ? { ["_" as string] : -amount }
      : Object.keys(amount).reduce((result, nextKey) => ({...result, [nextKey]: -amount[nextKey]}), {})
    await eventStream.append(new TransactEvent(accountName, date, itemizedAmounts, memo))
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
        [event.accountName]: result[event.accountName] + Object.keys(event.itemizedAmounts).reduce((sum, key) => sum + event.itemizedAmounts[key], 0),
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
