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
import {mapObject, reduceObject} from "@budgie/language-support";
import {Presenter} from "./presenter";
import {cents, formatAsDollars, parseAmount} from "./string-processing";
import {CommandOrSubcommands} from "./cli";
import {GetRunwayTrend, TargetWithAccruedBudget} from "../../../planning/dist/budgeting";

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
      },
      list: () => {
        return GetBudgets(eventStream)(today).then((budgets: { string: TargetWithAccruedBudget }) => {
          const cadenceStrings = {
            "WEEKLY": "wk",
            "MONTHLY": "mo",
            "YEARLY": "yr"
          }
          const entries = Object.keys(budgets).sort().map(targetName => ({
            rate: `${formatAsDollars(budgets[targetName].values[budgets[targetName].values.length-1][1])}/${cadenceStrings[budgets[targetName].cadence]}`,
            balance: formatAsDollars(budgets[targetName].accruedBudget),
            name: targetName
          }))

          return presenter.printAsTable("Savings targets", entries, [
            ["target", entry => entry.name],
            ["rate", entry => entry.rate],
            ["balance", entry => entry.balance]
          ])
        })
      },
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
      return GetBudgets(eventStream)(today).then((budgets: { string: TargetWithAccruedBudget }) => {
        presenter.printAsLedger(
          "Current budgets",
          budgets,
          value => formatAsDollars(value.accruedBudget),
          (a, b) => {
            const cadenceValues = {
              WEEKLY: 3,
              MONTHLY: 2,
              YEARLY: 1
            }

            if(a.cadence !== b.cadence) return cadenceValues[b.cadence] - cadenceValues[a.cadence]
            return b.values[b.values.length - 1][1] - a.values[a.values.length - 1][1]
          }
        )
      })
    },
    runway: {
      current: () => {
        return GetRunway(eventStream)(today).then((runway: { string: string }) => {
          const earliestDate = reduceObject(runway, (result: string, _, value) => value < result ? value : result, "9999-12-31")
          const weeks = Math.round((new Date(earliestDate).getTime() - new Date(today).getTime()) / (7 * 24 * 60 * 60 * 1000))
          presenter.printAsLedger(`Current runway (${weeks} weeks)`, runway)
        })
      },

      trend: () => {
        return eventStream
          .project((result: string | null, event) => {
            if(event.type === "TRANSACT") {
              if(result === null) return event["date"]
              return event["date"] < result ? event["date"] : result
            }
            return result
          }, null)
          .then(start => GetRunwayTrend(eventStream)(start, today))
          .then((runway: { string: number }) => {
            presenter.printAsLedger("Runway over time (in weeks)", runway)
          })
      }
    }
  }
}

function totalAmount(itemizedAmounts: {[target: string]: number}) {
  return reduceObject(itemizedAmounts, (sum, _, subamount) => sum + subamount, 0);
}
