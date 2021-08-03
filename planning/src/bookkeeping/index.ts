import {EventStream, StreamEvent} from "../event-stream";
import {reduceObject, sortBy, mapObject} from "@budgie/language-support";

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
  date: string

  constructor(sourceAccount: string, destinationAccount: string, value: number, date: string) {
    this.sourceAccount = sourceAccount
    this.destinationAccount = destinationAccount
    this.value = value
    this.date = date
  }
}

export function CreateAccount(eventStream: EventStream) {
  return async (accountName: string) => {
    await eventStream.append(new CreateAccountEvent(accountName))
  }
}

export function CreditAccount(eventStream: EventStream) {
  return async (accountName: string, amount: number | Itemization, date: string, memo?: string) => {
    const itemizedAmounts = (typeof amount === "number")
      ? { ["_" as string] : amount }
      : amount
    await eventStream.append(new TransactEvent(accountName, date, itemizedAmounts, memo))
  }
}

export function DebitAccount(eventStream: EventStream) {
  return async (accountName: string, amount: number | Itemization, date: string, memo?: string) => {
    const itemizedAmounts = (typeof amount === "number")
      ? { ["_" as string] : -amount }
      : mapObject(amount, (_, subamount) => -subamount)
    await eventStream.append(new TransactEvent(accountName, date, itemizedAmounts, memo))
  }
}

export function TransferFunds(eventStream: EventStream) {
  return async (sourceAccount: string, destinationAccount: string, value: number, date: string) => {
    await eventStream.append(new TransferEvent(sourceAccount, destinationAccount, value, date))
  }
}

export function GetBalances(eventStream: EventStream) {
  return async (date: string) => {
    return eventStream.project((result, event) => {
      if (CreateAccountEvent.is(event)) return {
        ...result,
        [event.accountName]: 0,
      }

      if (TransactEvent.is(event) && event.date <= date) return {
        ...result,
        [event.accountName]: result[event.accountName] + reduceObject(
          event.itemizedAmounts,
          (sum, _, subamount) => sum + subamount,
          0
        ),
      }

      if (TransferEvent.is(event) && event.date <= date) return {
        ...result,
        [event.sourceAccount]: result[event.sourceAccount] - event.value,
        [event.destinationAccount]: result[event.destinationAccount] + event.value,
      }

      return result
    }, {})
  }
}

export type TransactionEntry = {
  date: string,
  amount: { [target: string]: number },
  memo: string
}

export function GetTransactions(eventStream: EventStream) {

  return async (account) => {
    return eventStream.project<TransactionEntry[]>((result, event) => {
      if (TransactEvent.is(event) && event.accountName === account) return result.concat({
        date: event.date,
        amount: event.itemizedAmounts,
        memo: event.memo
      })

      if (TransferEvent.is(event) && event.sourceAccount === account) return result.concat({
        date: event.date,
        amount: {
          _: -event.value
        },
        memo: `transfer to ${event.destinationAccount}`
      })

      if (TransferEvent.is(event) && event.destinationAccount === account) return result.concat({
        date: event.date,
        amount: {
          _: event.value
        },
        memo: `transfer from ${event.sourceAccount}`
      })

      return result
    }, []).then(unsortedTransactions => {
      return sortBy((transaction: TransactionEntry) => transaction.date)(unsortedTransactions)
        .reduce((sortedEntriesWithBalances, transaction) => {
          const previousBalance = sortedEntriesWithBalances.length > 0
            ? sortedEntriesWithBalances[sortedEntriesWithBalances.length-1].balance
            : 0

          return sortedEntriesWithBalances.concat({
            transaction: transaction,
            balance: reduceObject(transaction.amount, (total, _, amount) => {
              return total + amount
            }, previousBalance)
          })
        }, [])
    })
  }
}
