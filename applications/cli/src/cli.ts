import {
  CreateAccount,
  CreateMonthlyTarget,
  CreateWeeklyTarget,
  CreateYearlyTarget, CreditAccount, DebitAccount,
  EventStream, GetBudgets, GetRunway, TransferFunds
} from "@budgie/planning";

const cents = (str: string) => Math.round(parseFloat(str) * 100)

const formatAsDollars = (cents: number) => `${Math.floor(cents / 100)}.${cents % 100 < 10 ? 0 : ''}${cents % 100}`

export function Commands(eventStream: EventStream, out: (...strings: string[]) => any) {
  const perform = (work: Promise<any>) => { work.then(() => out("done!")) }
  const today = new Date().toISOString().substr(0,10)

  return {
    account: {
      create: (name: string) => {
        perform(CreateAccount(eventStream)(name))
      },
    },
    target: {
      create: (name: string, cadence: string, startDate: string, amount: string, priority: string) => {
        switch(cadence) {
          case "weekly":
            perform(CreateWeeklyTarget(eventStream)(
              startDate || today,
              name,
              cents(amount),
              parseInt(priority || '5'),
              ""
            ))
            break
          case "monthly":
            perform(CreateMonthlyTarget(eventStream)(
              startDate || today,
              name,
              cents(amount),
              parseInt(priority || '5'),
              ""
            ))
            break
          case "yearly":
            perform(CreateYearlyTarget(eventStream)(
              startDate || today,
              name,
              cents(amount),
              parseInt(priority || '5'),
              ""
            ))
            break
          default:
            throw new Error(`Unknown target cadence: ${cadence}`)
        }
      }
    },
    credit: (account: string, amount: string, memo: string, target: string, date: string) => {
      perform(CreditAccount(eventStream)(account, cents(amount), date || today, target, memo))
    },
    debit: (account: string, amount: string, memo: string, target: string, date: string) => {
      perform(DebitAccount(eventStream)(account, cents(amount), date || today, target, memo))
    },
    transfer: (from: string, to: string, amount: string, date: string) => {
      perform(TransferFunds(eventStream)(from, to, cents(amount), date || today))
    },
    budgets: () => {
      GetBudgets(eventStream)(today).then(budgets => {
        out("\nCurrent budgets:")
        Object.keys(budgets).forEach(targetName => {
          out("  ", targetName, ":", formatAsDollars(budgets[targetName]))
        })
        out("")
      })
    },
    runway: () => {
      GetRunway(eventStream)(today).then(runway => {
        out("\nCurrent runway:")
        Object.keys(runway).forEach(targetName => {
          out("  ", targetName, ":", runway[targetName])
        })
        out("")
      })
    }
  }
}
