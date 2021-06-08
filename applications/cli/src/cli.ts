import {
  CreateAccount,
  CreateMonthlyTarget,
  CreateWeeklyTarget,
  CreateYearlyTarget, CreditAccount, DebitAccount,
  EventStream, GetBalances, GetBudgets, GetRunway, TransferFunds
} from "@budgie/planning";

const cents = (str: string) => Math.round(parseFloat(str) * 100)

const formatAsDollars = (cents: number) => {
  const absoluteCents = Math.abs(cents)
  const baseString = `${Math.floor(absoluteCents / 100)}.${absoluteCents % 100 < 10 ? 0 : ''}${absoluteCents % 100}`
  return cents < 0
    ? `\x1b[31m(${baseString})\x1b[0m`
    : baseString
}

const multichar = (char: string, num: number) => {
  let str = ""
  for(let i = 0; i < num; i++) str += char
  return str
}

function parseAmount(amount: string) {
  if(amount.indexOf("=") === -1) return { "_": cents(amount) }
  return amount.split(",").reduce((itemizedAmounts, entry) => {
    const [target, subamount] = entry.split("=")
    return {
      ...itemizedAmounts,
      [target]: (itemizedAmounts[target] || 0) + cents(subamount)
    }
  }, {})
}

export function Commands(eventStream: EventStream, out: (...strings: string[]) => any) {
  const perform = (work: Promise<any>) => { work.then(() => out("done!")) }
  const today = new Date().toISOString().substr(0,10)

  function printAsLedger<T>(title: string, data: {string: T}, valueFormatter: (value: T) => string = (value: T) => value.toString()) {
    const leftColumnWidth = Object.keys(data).reduce((max, next) => next.length > max ? next.length : max, 0) + 3
    out(`\n${title}:`)
    Object.keys(data).forEach(item => {
      out(`  ${item}${multichar('.', leftColumnWidth - item.length)}${valueFormatter(data[item])}`)
    })
    out("")
  }

  return {
    account: {
      create: (name: string) => {
        perform(CreateAccount(eventStream)(name))
      },
      balances: () => {
        GetBalances(eventStream)().then((balances: {string: number}) => {
          printAsLedger("Current balances", balances, formatAsDollars)
        })
      }
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
    credit: (account: string, amount: string, memo: string, date: string) => {
      perform(CreditAccount(eventStream)(account, parseAmount(amount), date || today, memo))
    },
    debit: (account: string, amount: string, memo: string, date: string) => {
      perform(DebitAccount(eventStream)(account, parseAmount(amount), date || today, memo))
    },
    transfer: (from: string, to: string, amount: string, date: string) => {
      perform(TransferFunds(eventStream)(from, to, cents(amount), date || today))
    },
    budgets: () => {
      GetBudgets(eventStream)(today).then((budgets: {string: number}) => {
        printAsLedger("Current budgets", budgets, formatAsDollars)
      })
    },
    runway: () => {
      GetRunway(eventStream)(today).then((runway: {string: string}) => {
        printAsLedger("Current runway", runway)
      })
    }
  }
}
