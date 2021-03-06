import {InMemoryEventStream} from "@budgie/planning";
import {Cli} from "./cli";
import {Commands} from "./commands";
import {formatAsDollars} from "./string-processing";

function FakeTerminal() {
  let output = ""

  return {
    log: (...things: any[]) => {
      output += things.map(thing => thing.toString()).join(" ") + "\n"
    },
    output: () => output,
    reset: () => output = ""
  }
}

describe("CLI", () => {
  let eventStream;
  let terminal;
  let today;
  let cli;

  beforeEach(() => {
    eventStream = InMemoryEventStream()
    terminal = FakeTerminal()
    today = "2020-11-05"
    cli = Cli(terminal.log, Commands(eventStream, terminal.log, today))
  })

  function expectOutput(output: string) {
    /*
    expectOutput(` // <- need to ignore this new line
      some         // <- first line sets the indent within the code; dedent everything so this line starts at index 0
        output     // <- don't dedent everything to zero. This line should still be indented to position 2
    `)             // <- Trim surrounding whitespace after dedenting, otherwise it's EXTREMELY hard to figure out failures
     */
    if(output[0] === '\n') output = output.substr(1)
    const indent = output.search(/[^ ]/)
    output = output.split('\n').map(line => line.substr(indent)).join('\n')
    if(output[output.length-1]==='\n') output = output.substr(0, output.length - 1)

    expect(terminal.output().trim()).toEqual(output.trim())
    terminal.reset()
  }

  function expectOutputContaining(...lines: RegExp[]) {
    lines.forEach(line => {
      expect(terminal.output()).toEqual(expect.stringMatching(line))
    })
    terminal.reset()
  }

  test("basic workflow", async () => {
    await cli([""])
    expectOutput(`
      Available commands:
      
      rate
      account
      target
      credit
      debit
      transfer
      budgets
      runway
    `)

    await cli(["account"])
    expectOutput(`
      Available commands:
      
      create
      balances
      transactions
    `)

    await cli(["account", "create", "-h"])
    expectOutput(`
      Usage: (name)
    `)

    await cli(["account", "create", "checking"])
    await cli(["account", "create", "savings"])
    await cli(["credit", "checking", "500", "initial balance", "2020-10-31"])
    await cli(["credit", "savings", "5500", "another initial balance", "2020-11-01"])
    await cli(["transfer", "savings", "checking", "500", "2020-11-02"])
    await cli(["target", "create", "food", "weekly", "2020-11-02", 100, 1])
    await cli(["target", "create", "supplies", "weekly", "2020-11-02", 50, 1])

    await cli(["credit", "checking", "200", "payday" /* no date given, should default to today */])
    await cli(["debit", "checking", "food=12,supplies=8", "supermarket", "2020-11-02"])
    await cli(["debit", "checking", "food=5", "bodega" /* no date given, should default to today */])
    terminal.reset()

    await cli(["account", "balances"])
    expectOutput(`
      Current balances:
        checking..1175.00
        savings...5000.00
    `)

    await cli(["account", "transactions", "checking"])
    expectOutput(`
      Transactions for checking:
      
      date       | balance | change | memo                 
      -----------|---------|--------|----------------------
      2020-11-05 | 1175.00 |  \x1b[91m-5.00\x1b[39m | bodega               
      2020-11-05 | 1180.00 | 200.00 | payday               
      2020-11-02 |  980.00 | \x1b[91m-20.00\x1b[39m | supermarket          
      2020-11-02 | 1000.00 | 500.00 | transfer from savings
      2020-10-31 |  500.00 | 500.00 | initial balance
    `)

    await cli(["budgets"])
    expectOutput(`
      Current budgets:
        food......83.00
        supplies..42.00
    `)

    await cli(["target", "list"])
    expectOutput(`
      Savings targets:
      
      target   | rate      | balance
      ---------|-----------|--------
      food     | 100.00/wk | 83.00  
      supplies | 50.00/wk  | 42.00  
    `)

    await cli(["runway", "current"])
    expectOutputContaining(
      /Current runway \(\d+ weeks\):/,
      /food......\d{4}-\d{2}-\d{2}/,
      /supplies..\d{4}-\d{2}-\d{2}/,
    )

    await cli(["runway", "trend"])
    expectOutputContaining(
      /Runway over time \(in weeks\):/,
      /2020-10-31..\d+/
    )
  })

  test("expense rates", async () => {
    today = "2021-04-01"
    cli = Cli(terminal.log, Commands(eventStream, terminal.log, today))

    await cli(["account", "create", "cc"])
    await cli(["target", "create", "food", "weekly", "2020-11-02", 50, 1])
    await cli(["target", "create", "supplies", "weekly", "2020-11-02", 50, 1])

    await cli(["debit", "cc", "food=100", "supermarket", "2020-11-03"])
    await cli(["debit", "cc", "food=100", "supermarket", "2020-11-13"])
    await cli(["debit", "cc", "food=1000", "supermarket", "2020-12-03"])
    await cli(["debit", "cc", "food=1000", "supermarket", "2020-12-13"])
    await cli(["debit", "cc", "food=300", "supermarket", "2021-01-03"])
    await cli(["debit", "cc", "food=300", "supermarket", "2021-01-13"])
    await cli(["debit", "cc", "food=400", "supermarket", "2021-02-03"])
    await cli(["debit", "cc", "food=400", "supermarket", "2021-02-13"])
    await cli(["debit", "cc", "food=200", "supermarket", "2021-03-03"])
    await cli(["debit", "cc", "food=200", "supermarket", "2021-03-13"])
    terminal.reset()

    await cli(["rate", "projected"])
    expectOutputContaining(
      /\d+\.\d+/
    )

    await cli(["rate", "historical"]) // default to average over last three months
    let expenseRate = (300+300+400+400+200+200)/3
    expectOutput(
      `${formatAsDollars(Math.round(expenseRate*100))}`
    )

    await cli(["rate", "historical", "2020-11-01", "2021-01-30"])
    expenseRate = (100+100+1000+1000+300+300)/3
    expectOutput(
      `${formatAsDollars(Math.round(expenseRate*100))}`
    )

    await cli(["rate", "historical", "2020-11-01", "2021-03-01"])
    expenseRate = (100+100+1000+1000+300+300+400+400)/4
    expectOutput(
      `${formatAsDollars(Math.round(expenseRate*100))}`
    )
  })
})
