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
} from "@budgie/planning";
import {cents, formatAsDollars, parseAmount} from "./string-processing";
import {Presenter} from "./presenter";

type Command = (...args: string[]) => Promise<any>
type CommandOrSubcommands = { [subcommand: string]: CommandOrSubcommands } | Command

export function Cli(
  out: (...strings: string[]) => any,
  commands: CommandOrSubcommands
) {
  async function execute(command: CommandOrSubcommands, args: string[]): Promise<any> {
    function help() {
      return args[0] === "help" || args[0] === "--help" || args[0] === "-h";
    }

    function showAvailableCommands() {
      out("\nAvailable commands:\n")
      Object.keys(command).forEach(key => out(key))
      out("")
    }

    function showUsage() {
      out("Usage:", command.toString().substr(0, command.toString().indexOf(")") + 1))
    }

    if(typeof command !== "function") {
      if(!args[0] || help()) {
        showAvailableCommands()
      } else if(!command[args[0]]) {
        out("Unknown command:", args[0])
        showAvailableCommands()
      } else {
        await execute(command[args[0]], args.splice(1))
      }
    } else {
      if (help()) {
        showUsage();
      } else {
        await command.apply({}, args)
      }
    }
  }

  return async (args: string[]) => {
    await execute(commands, args)
  }
}

export function Commands(
  eventStream: EventStream,
  out: (...strings: string[]) => any,
  today = new Date().toISOString().substr(0,10)
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
        return GetBalances(eventStream)().then((balances: {string: number}) => {
          presenter.printAsLedger("Current balances", balances, formatAsDollars)
        })
      },
      transactions: (account) => {
        return GetTransactions(eventStream)(account).then((
          entries: {
            transaction: { date: string, memo: string, amount: { [target: string]: number } },
            balance: number
          }[]
        ) => {
          presenter.printAsTable<{
            transaction: { date: string, memo: string, amount: { [target: string]: number } },
            balance: number
          }>(`Transactions for ${account}`, entries.reverse(), [
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
        presenter.printAsLedger("Current budgets", budgets, formatAsDollars)
      })
    },
    runway: () => {
      return GetRunway(eventStream)(today).then((runway: {string: string}) => {
        presenter.printAsLedger("Current runway", runway)
      })
    }
  }
}
