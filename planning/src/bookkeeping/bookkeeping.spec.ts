import {InMemoryEventStream} from "../event-stream";
import {CreateAccount, CreditAccount, DebitAccount, GetBalances, TransferFunds} from ".";

test("bookkeeping", async () => {
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

  await createAccount("Account A")
  await createAccount("Account B")

  await creditAccount("Account A", 1000, startDate)
  await debitAccount("Account B", 300, startDatePlus(1))

  expect(await getBalances()).toEqual({
    "Account A": 1000,
    "Account B": -300,
  })

  await transferFunds("Account A", "Account B", 400, startDatePlus(2))

  expect(await getBalances()).toEqual({
    "Account A": 600,
    "Account B": 100,
  })

  // Itemized transactions are summed up when applied to balances:
  await debitAccount("Account A", { targetA: 100, targetB: 25, _: 50 }, startDatePlus(1))

  expect(await getBalances()).toEqual({
    "Account A": 425,
    "Account B": 100,
  })
})
