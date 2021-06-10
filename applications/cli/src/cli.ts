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
    ? `\x1b[91m-${baseString}\x1b[39m`
    : baseString
}

const multichar = (char: string, num: number) => {
  let str = ""
  for(let i = 0; i < num; i++) str += char
  return str
}

const removeColorCodes = str => str.replace(/\x1b\[\d+m/g, '')

const pad = (str: string, length: number, spacer: string = ' ') => {
  return `${str}${multichar(spacer, length - removeColorCodes(str).length)}`
}

const leftpad = (str: string, length: number, spacer: string = ' ') => {
  return `${multichar(spacer, length - removeColorCodes(str).length)}${str}`
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

type Command = (...args: string[]) => Promise<any>
type CommandOrSubcommands = { [subcommand: string]: CommandOrSubcommands } | Command

export function Cli(
  out: (...strings: string[]) => any,
  commands: CommandOrSubcommands
) {
  function showHelp() {
    out("\nAvailable commands:\n")
    Object.keys(commands).forEach(key => out(key))
    out("")
  }

  async function execute(command: CommandOrSubcommands, args: string[]): Promise<any> {
    function pleaseHelp() {
      return args[0] === "help" || args[0] === "--help" || args[0] === "-h";
    }

    if(typeof command !== "function") {
      if(!args[0] || pleaseHelp()) {
        showHelp()
        return
      }

      if(!command[args[0]]) {
        out("Unknown command:", args[0])
        showHelp()
        return
      }

      await execute(command[args[0]], args.splice(1))
    } else {
      if (pleaseHelp()) {
        out("Usage:", command.toString().substr(0, command.toString().indexOf(")") + 1))
      } else {
        await command.apply({}, args)
      }
    }
  }

  return {
    async execute(args: string[]) {
      await execute(commands, args)
    }
  }
}

export function Commands(
  eventStream: EventStream,
  out: (...strings: string[]) => any,
  today = new Date().toISOString().substr(0,10)
): CommandOrSubcommands {
  const perform = (work: Promise<any>) => work.then(() => out("done!"))

  function printAsLedger<T>(title: string, data: {string: T}, valueFormatter: (value: T) => string = (value: T) => value.toString()) {
    const leftColumnWidth = Object.keys(data).reduce((max, next) => next.length > max ? next.length : max, 0) + 2
    const rightColumnWidth = Object.keys(data).reduce((max, next) => {
      const thisWidth = removeColorCodes(valueFormatter(data[next])).length;
      return thisWidth > max ? thisWidth : max
    }, 0)
    out(`\n${title}:`)
    Object.keys(data).forEach(item => {
      out(`  ${pad(item, leftColumnWidth, '.')}${leftpad(valueFormatter(data[item]), rightColumnWidth, '.')}`)
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
      return GetSpendingRate(eventStream)(today).then(result => out(formatAsDollars(Math.round(result))))
    },
    account: {
      create: (name: string) => {
        return perform(CreateAccount(eventStream)(name))
      },
      balances: () => {
        return GetBalances(eventStream)().then((balances: {string: number}) => {
          printAsLedger("Current balances", balances, formatAsDollars)
        })
      },
      transactions: (account) => {
        return GetTransactions(eventStream)(account).then((
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
            return perform(CreateWeeklyTarget(eventStream)(
              startDate || today,
              name,
              cents(amount),
              parseInt(priority || '5'),
              ""
            ))
          case "monthly":
            return perform(CreateMonthlyTarget(eventStream)(
              startDate || today,
              name,
              cents(amount),
              parseInt(priority || '5'),
              ""
            ))
          case "yearly":
            return perform(CreateYearlyTarget(eventStream)(
              startDate || today,
              name,
              cents(amount),
              parseInt(priority || '5'),
              ""
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
      return GetBudgets(eventStream)(today).then((budgets: {string: number}) => {
        printAsLedger("Current budgets", budgets, formatAsDollars)
      })
    },
    runway: () => {
      return GetRunway(eventStream)(today).then((runway: {string: string}) => {
        printAsLedger("Current runway", runway)
      })
    }
  }
}
