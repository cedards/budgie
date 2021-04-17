import {
  CreateAccount,
  CreateMonthlyTarget,
  CreateWeeklyTarget,
  CreditAccount,
  DebitAccount,
  GetBalances,
  GetTargets,
  InMemoryEventStream,
  Target,
  TransferFunds
} from ".";

test("bookkeeping", async () => {
  const eventStream = InMemoryEventStream()
  const createAccount = CreateAccount(eventStream)
  const creditAccount = CreditAccount(eventStream)
  const debitAccount = DebitAccount(eventStream)
  const transferFunds = TransferFunds(eventStream)
  const getBalances = GetBalances(eventStream)

  await createAccount("Account A")
  await createAccount("Account B")

  await creditAccount("Account A", 1000)
  await debitAccount("Account B", 300)

  expect(await getBalances()).toEqual({
    "Account A": 1000,
    "Account B": -300,
  })

  await transferFunds("Account A", "Account B", 400)

  expect(await getBalances()).toEqual({
    "Account A": 600,
    "Account B": 100,
  })
})

describe("planning", () => {
  let createMonthlyTarget: (startDate: string, targetName: string, targetValue: number, priority: number, allocateFrom: string) => Promise<void>;
  let createWeeklyTarget: (startDate: string, targetName: string, targetValue: number, priority: number, allocateFrom: string) => Promise<void>;
  let getTargets: (date: string) => Promise<{[name: string]: Target}>;
  let createAccount: (name: string) => Promise<void>;
  const startDate = "2020-11-01" // This month started on a Sunday, which makes it a simple example since weekly targets trigger on Sunday
  const startDatePlus = (days: number) => {
    const newDate = new Date(startDate)
    newDate.setDate(newDate.getDate() + days)
    return newDate.toISOString().substr(0,10)
  }

  beforeEach(() => {
    const eventStream = InMemoryEventStream()
    createMonthlyTarget = CreateMonthlyTarget(eventStream)
    createWeeklyTarget = CreateWeeklyTarget(eventStream)
    getTargets = GetTargets(eventStream)
    createAccount = CreateAccount(eventStream)
  })

  describe("recurring saving targets", () => {
    beforeEach(async () => {
      await createAccount("Account A")
      await createMonthlyTarget(startDate, "big monthly target", 1000, 2, "Account A")
      await createWeeklyTarget(startDate, "low priority weekly target", 100, 3, "Account A")
      await createWeeklyTarget(startDate, "high priority weekly target", 100, 1, "Account A")
    })

    it("accrues over time", async () => {
      expect(await getTargets(startDate)).toEqual({
        "big monthly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 1000,
          priority: 2,
        },
        "low priority weekly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 100,
          priority: 3,
        },
        "high priority weekly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 100,
          priority: 1,
        },
      })

      expect(await getTargets(startDatePlus(6))).toEqual({
        "big monthly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 1000,
          priority: 2,
        },
        "low priority weekly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 100,
          priority: 3,
        },
        "high priority weekly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 100,
          priority: 1,
        },
      })

      expect(await getTargets(startDatePlus(7))).toEqual({
        "big monthly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 1000,
          priority: 2,
        },
        "low priority weekly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 200,
          priority: 3,
        },
        "high priority weekly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 200,
          priority: 1,
        },
      })

      expect(await getTargets(startDatePlus(29))).toEqual({
        "big monthly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 1000,
          priority: 2,
        },
        "low priority weekly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 500,
          priority: 3,
        },
        "high priority weekly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 500,
          priority: 1,
        },
      })

      expect(await getTargets(startDatePlus(30))).toEqual({
        "big monthly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 2000,
          priority: 2,
        },
        "low priority weekly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 500,
          priority: 3,
        },
        "high priority weekly target": {
          fundedUntil: startDate,
          deltaToNextPayment: 500,
          priority: 1,
        },
      })
    })
  })
})
