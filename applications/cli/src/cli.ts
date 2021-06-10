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
  GetTransactions,
  TransferFunds,
  GetSpendingRate,
} from "@budgie/planning";

const cents = (str: string) => Math.round(parseFloat(str) * 100)

const formatAsDollars = (cents: number) => {
  const absoluteCents = Math.abs(cents)
  const baseString = `${Math.floor(absoluteCents / 100)}.${absoluteCents % 100 < 10 ? 0 : ''}${absoluteCents % 100}`
  return cents < 0
    ? `\x1b[91m(${baseString})\x1b[39m`
    : baseString
}

const multichar = (char: string, num: number) => {
  let str = ""
  for(let i = 0; i < num; i++) str += char
  return str
}

const removeColorCodes = str => str.replace(/\x1b\[\d+m/g, '')

const pad = (str: string, length: number) => {
  return `${str}${multichar(' ', length - removeColorCodes(str).length)}`
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

  function printAsTable<T>(title: string, data: T[], columns: Array<[string, (record: T) => string]>) {
    const columnWidths = data.reduce((widths, record) => {
      return columns.reduce((newWidths, [heading, getter]) => {
        const cellContents = getter(record);
        const columnWidthForThisRow = cellContents !== null && cellContents !== undefined
          ? removeColorCodes(cellContents).length
          : 0

        return {
          ...newWidths,
          [heading]: columnWidthForThisRow > newWidths[heading] ? columnWidthForThisRow : newWidths[heading]
        }
      }, widths)
    }, columns.reduce((initialWidths, [heading, _]) => (
      {...initialWidths, [heading]: heading.length}
    ), {}))

    out(`${title}:\n`)
    out(columns.map(([heading, _]) => pad(heading, columnWidths[heading])).join(" | "))
    out(columns.map(([heading, _]) => multichar("-", columnWidths[heading])).join("-|-"))
    data.forEach(record => {
      out(columns.map(([heading, getter]) => pad(getter(record), columnWidths[heading])).join(" | "))
    })
  }

  return {
    rate: () => {
      GetSpendingRate(eventStream)(today).then(result => out(formatAsDollars(Math.round(result))))
    },
    account: {
      create: (name: string) => {
        perform(CreateAccount(eventStream)(name))
      },
      balances: () => {
        GetBalances(eventStream)().then((balances: {string: number}) => {
          printAsLedger("Current balances", balances, formatAsDollars)
        })
      },
      transactions: (account) => {
        GetTransactions(eventStream)(account).then((
          entries: {
            transaction: { date: string, memo: string, amount: { [target: string]: number } },
            balance: number
          }[]
        ) => {
          printAsTable(`Transactions for ${account}`, entries.reverse(), [
            ["date", record => record.transaction.date],
            ["balance", record => formatAsDollars(record.balance)],
            ["change", record => formatAsDollars(
              Object.keys(record.transaction.amount).reduce((sum, target) => sum + record.transaction.amount[target], 0)
            )],
            ["memo", record => record.transaction.memo]
          ])
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
