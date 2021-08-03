import {
  CreateAccount,
  CreateMonthlyTarget,
  CreateWeeklyTarget,
  CreateYearlyTarget,
  CreditAccount,
  DebitAccount,
  EventStream,
  GetBalances,
  GetBudgets,
  GetRunway,
  GetSpendingRate,
  GetTransactions,
  TransferFunds,
  TransactionEntry
} from "@budgie/planning";
import {reduceObject} from "@budgie/language-support";
import {Presenter} from "./presenter";
import {cents, formatAsDollars, parseAmount} from "./string-processing";
import {CommandOrSubcommands} from "./cli";

export function Commands(
  eventStream: EventStream,
  out: (...strings: string[]) => any,
  today = new Date().toISOString().substr(0, 10)
): CommandOrSubcommands {
  const perform = (work: Promise<any>) => work.then(() => out("done!"))
  const presenter = Presenter(out)

  return {
    rate: () => {
      return GetSpendingRate(eventStream)(today).then(result => out(formatAsDollars(Math.round(result))))
    },
    account: {
      create: (name: string) => {
        return perform(CreateAccount(eventStream)(name))
      },
      balances: () => {
        return GetBalances(eventStream)(today).then((balances: { string: number }) => {
          presenter.printAsLedger("Current balances", balances, formatAsDollars)
        })
      },
      transactions: (account) => {
        type TransactionAndBalance = { transaction: TransactionEntry, balance: number }
        return GetTransactions(eventStream)(account).then((entries: TransactionAndBalance[]) => {
          presenter.printAsTable<TransactionAndBalance>(`Transactions for ${account}`, entries.reverse(), [
            ["date", record => record.transaction.date],
            ["balance", record => formatAsDollars(record.balance), "right"],
            ["change", record => formatAsDollars(totalAmount(record.transaction.amount)), "right"],
            ["memo", record => record.transaction.memo]
          ])
        })
      }
    },
    target: {
      create: (name: string, cadence: string, startDate: string, amount: string, priority: string) => {
        switch (cadence) {
          case "weekly":
            return perform(CreateWeeklyTarget(eventStream)(
              startDate || today,
              name,
              cents(amount),
              parseInt(priority || '5'),
            ))
          case "monthly":
            return perform(CreateMonthlyTarget(eventStream)(
              startDate || today,
              name,
              cents(amount),
              parseInt(priority || '5'),
            ))
          case "yearly":
            return perform(CreateYearlyTarget(eventStream)(
              startDate || today,
              name,
              cents(amount),
              parseInt(priority || '5'),
            ))
          default:
            throw new Error(`Unknown target cadence: ${cadence}`)
        }
      }
    },
    credit: (account: string, amount: string, memo: string, date: string) => {
      return perform(CreditAccount(eventStream)(account, parseAmount(amount), date || today, memo))
    },
    debit: (account: string, amount: string, memo: string, date: string) => {
      return perform(DebitAccount(eventStream)(account, parseAmount(amount), date || today, memo))
    },
    transfer: (from: string, to: string, amount: string, date: string) => {
      return perform(TransferFunds(eventStream)(from, to, cents(amount), date || today))
    },
    budgets: () => {
      return GetBudgets(eventStream)(today).then((budgets: { string: number }) => {
        presenter.printAsLedger("Current budgets", budgets, formatAsDollars)
      })
    },
    runway: () => {
      return GetRunway(eventStream)(today).then((runway: { string: string }) => {
        presenter.printAsLedger("Current runway", runway)
      })
    }
  }
}

function totalAmount(itemizedAmounts: {[target: string]: number}) {
  return reduceObject(itemizedAmounts, (sum, _, subamount) => sum + subamount, 0);
}
