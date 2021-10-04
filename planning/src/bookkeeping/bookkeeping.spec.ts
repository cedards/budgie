import {InMemoryEventStream} from "../event-stream";
import {
  CreateAccount,
  CreditAccount,
  DebitAccount,
  GetBalances,
  GetHistoricalExpenses,
  GetTransactions,
  TransferFunds
} from ".";

describe("bookkeeping", () => {
  test("basic workflow", async () => {
    const startDate = "2020-11-01" // This month started on a Sunday, which makes it a simple example since weekly targets trigger on Sunday
    const startDatePlus = (days: number) => {
      const newDate = new Date(startDate)
      newDate.setDate(newDate.getDate() + days)
      return newDate.toISOString().substr(0,10)
    }
    const eventStream = InMemoryEventStream()
    const createAccount = CreateAccount(eventStream)
    const creditAccount = CreditAccount(eventStream)
    const debitAccount = DebitAccount(eventStream)
    const transferFunds = TransferFunds(eventStream)
    const getBalances = GetBalances(eventStream)
    const getTransactions = GetTransactions(eventStream)

    await createAccount("Account A")
    await createAccount("Account B")

    await creditAccount("Account A", 1000, startDate)
    await debitAccount("Account B", 300, startDatePlus(1))
    await transferFunds("Account A", "Account B", 400, startDatePlus(2))
    // Itemized transactions are summed up when applied to balances:
    await debitAccount("Account A", { targetA: 100, targetB: 25, _: 50 }, startDatePlus(3), "some note")

    expect(await getBalances(startDate)).toEqual({
      "Account A": 1000,
      "Account B": 0,
    })

    // After debit:
    expect(await getBalances(startDatePlus(1))).toEqual({
      "Account A": 1000,
      "Account B": -300,
    })

    // After transfer:
    expect(await getBalances(startDatePlus(2))).toEqual({
      "Account A": 600,
      "Account B": 100,
    })

    // After itemized debit:
    expect(await getBalances(startDatePlus(3))).toEqual({
      "Account A": 425,
      "Account B": 100,
    })

    // When I add a backdated transaction to the log:
    await debitAccount("Account A", { _: 25 }, startDatePlus(1), "backdated")

    // Then getTransactions shows all transactions are shown in chronological order:
    expect(await getTransactions("Account A")).toEqual([
      {
        transaction: {
          date: startDate,
          amount: {
            _: 1000
          },
          memo: ""
        },
        balance: 1000
      }, {
        transaction: {
          date: startDatePlus(1),
          amount: {
            _: -25
          },
          memo: "backdated"
        },
        balance: 975
      }, {
        transaction: {
          date: startDatePlus(2),
          amount: {
            _: -400
          },
          memo: "transfer to Account B"
        },
        balance: 575
      }, {
        transaction: {
          date: startDatePlus(3),
          amount: {
            targetA: -100,
            targetB: -25,
            _: -50
          },
          memo: "some note"
        },
        balance: 400
      }
    ])
  })

  test("tracking expense rate", async () => {
    const startDate = "2020-11-01" // This month started on a Sunday, which makes it a simple example since weekly targets trigger on Sunday
    const startDatePlus = (days: number) => {
      const newDate = new Date(startDate)
      newDate.setDate(newDate.getDate() + days)
      return newDate.toISOString().substr(0,10)
    }
    const eventStream = InMemoryEventStream()
    const createAccount = CreateAccount(eventStream)
    const creditAccount = CreditAccount(eventStream)
    const debitAccount = DebitAccount(eventStream)
    const transferFunds = TransferFunds(eventStream)
    const getHistoricalExpenses = GetHistoricalExpenses(eventStream)

    await createAccount("Account A")
    await createAccount("Account B")

    // Unallocated credits don't matter for historical expenses
    await creditAccount("Account A", 1000, startDate)
    await creditAccount("Account B", 2000, startDate)

    // Unallocated and allocated debits are included in the total expenses
    await debitAccount("Account A", 100, startDatePlus(1))
    await debitAccount("Account B", 200, startDatePlus(2))
    await debitAccount("Account A", { targetA: 300 }, startDatePlus(3), "some note")

    // Allocated credits represent refunds or reimbursements;
    // effectively, the following credit means that $100
    // of earlier spending on targetA should not be counted.
    await creditAccount("Account A", { targetA: 100 }, startDatePlus(4), "partial refund for targetA spending")

    // Transfers do not matter for tracking total expenses.
    await transferFunds("Account B", "Account A", 200, startDatePlus(5))

    expect(await getHistoricalExpenses(startDate, startDatePlus(1))).toEqual({
      "_": 100
    })
    expect(await getHistoricalExpenses(startDate, startDatePlus(3))).toEqual({
      "_": 300,
      "targetA": 300
    })
    expect(await getHistoricalExpenses(startDate, startDatePlus(6))).toEqual({
      "_": 300,
      "targetA": 200,
    })
  })
})
