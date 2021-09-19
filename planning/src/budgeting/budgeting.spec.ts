import {EventStream, InMemoryEventStream} from "../event-stream";
import {
  CreateMonthlyTarget,
  CreateWeeklyTarget,
  GetBudgets,
  GetExpendituresByTarget,
  GetRunway,
  GetRunwayTrend,
  GetTargets,
  Target, TargetWithAccruedBudget
} from "./index";
import {CreateAccount, CreditAccount, DebitAccount} from "../bookkeeping";

describe("budgeting", () => {
  let eventStream: EventStream;
  let createMonthlyTarget: (startDate: string, targetName: string, targetValue: number, priority: number) => Promise<void>;
  let createWeeklyTarget: (startDate: string, targetName: string, targetValue: number, priority: number) => Promise<void>;
  let getTargets: (date: string) => Promise<{[name: string]: Target}>;
  let getBudgets: (date: string) => Promise<{[name: string]: TargetWithAccruedBudget}>;
  let getRunway: (date: string) => Promise<{[name: string]: string}>;
  let getRunwayTrend: (from: string, to: string) => Promise<{[date: string]: number}>;
  let createAccount: (name: string) => Promise<void>;
  const startDate = "2020-11-01" // This month started on a Sunday, which makes it a simple example since weekly targets trigger on Sunday
  const startDatePlus = (days: number) => {
    const newDate = new Date(startDate)
    newDate.setDate(newDate.getDate() + days)
    return newDate.toISOString().substr(0,10)
  }

  beforeEach(() => {
    eventStream = InMemoryEventStream()
    createMonthlyTarget = CreateMonthlyTarget(eventStream)
    createWeeklyTarget = CreateWeeklyTarget(eventStream)
    getTargets = GetTargets(eventStream)
    getBudgets = GetBudgets(eventStream)
    getRunway = GetRunway(eventStream)
    getRunwayTrend = GetRunwayTrend(eventStream)
    createAccount = CreateAccount(eventStream)
  })

  test("grocery budget", async () => {
    await createAccount("Checking")
    await createWeeklyTarget(startDate, "groceries", 50, 1)
    const creditAccount = CreditAccount(eventStream)
    const debitAccount = DebitAccount(eventStream)

    const availableGroceryMoneyOn = async (date: string) => {
      const budgets = await getBudgets(date)
      return budgets["groceries"].accruedBudget
    }

    await(creditAccount("Checking", 1000, startDate))

    expect(await availableGroceryMoneyOn(startDate)).toEqual(50)

    await debitAccount("Checking", { groceries: 25 }, startDatePlus(2))

    expect(await availableGroceryMoneyOn(startDatePlus(2))).toEqual(25)

    expect(await availableGroceryMoneyOn(startDatePlus(7))).toEqual(75)

    // large expense that is going to be split with friends:
    await debitAccount("Checking", { groceries: 100 }, startDatePlus(8))

    expect(await availableGroceryMoneyOn(startDatePlus(8))).toEqual(-25)

    // when friends pay me back for their half of the expense:
    await creditAccount("Checking", { groceries: 50 }, startDatePlus(9))

    expect(await availableGroceryMoneyOn(startDatePlus(9))).toEqual(25)
  })

  test("groceries and rent", async () => {
    const creditAccount = CreditAccount(eventStream)
    const debitAccount = DebitAccount(eventStream)

    const groceryRunwayAsOf = async (date: string) => {
      const targets = await getRunway(date)
      return targets["groceries"]
    }

    const rentRunwayAsOf = async (date: string) => {
      const targets = await getRunway(date)
      return targets["rent"]
    }

    await createAccount("Checking")
    await creditAccount("Checking", 300, startDate)

    await createAccount("Savings")
    await creditAccount("Savings", 900, startDate)

    await createAccount("Credit Card")
    await debitAccount("Credit Card", 200, startDate)

    await createWeeklyTarget(startDate, "groceries", 100, 2)
    await createMonthlyTarget(startDatePlus(7*3), "rent", 500, 1)

    expect(await rentRunwayAsOf(startDate)).toEqual(startDatePlus(7*3))
    expect(await groceryRunwayAsOf(startDate)).toEqual(startDatePlus(7*4))

    // make a grocery expenditure that's within budget:
    await debitAccount("Checking", { groceries: 100 }, startDatePlus(1))
    // runway doesn't change:
    expect(await groceryRunwayAsOf(startDatePlus(1))).toEqual(startDatePlus(7*4))

    // but if I overspend:
    await debitAccount("Checking", { groceries: 100 }, startDatePlus(1))
    // then runway decreases, because I've drawn money from the pool that allocation doesn't account for:
    expect(await groceryRunwayAsOf(startDatePlus(1))).toEqual(startDatePlus(7*3))
  })

  test("Paying rent and household expenses together", async () => {
    const creditAccount = CreditAccount(eventStream)
    const debitAccount = DebitAccount(eventStream)

    await createAccount("Checking")
    await creditAccount("Checking", 1000, startDate)

    await createMonthlyTarget(startDate, "rent", 800, 1)
    await createMonthlyTarget(startDate, "supplies", 100, 1)

    await debitAccount("Checking", { rent: 800, supplies: 50 }, startDatePlus(1))

    const expenditures = await GetExpendituresByTarget(eventStream)(startDatePlus(1))

    expect(expenditures["rent"]).toEqual(800)
    expect(expenditures["supplies"]).toEqual(50)
    expect((await getBudgets(startDatePlus(1)))["supplies"].accruedBudget).toEqual(50)
    expect((await getBudgets(startDatePlus(1)))["rent"].accruedBudget).toEqual(0)
  })

  test("Monitoring long-term trends", async () => {
    const creditAccount = CreditAccount(eventStream)

    await createAccount("Checking")
    await creditAccount("Checking", 10000, startDate)

    await createMonthlyTarget(startDate, "rent", 800, 2)
    await createMonthlyTarget(startDate, "food", 200, 1)

    await creditAccount("Checking", 1000, startDatePlus(30))
    await creditAccount("Checking", 1, startDatePlus(60))

    const trend = await getRunwayTrend(startDate, startDatePlus(61))

    expect(trend[startDate]).toEqual(39)
    expect(trend[startDatePlus(30)]).toEqual(39) // Income covered expenses, so runway stays the same
    expect(trend[startDatePlus(61)]).toEqual(35) // Income didn't cover expenses, so savings runway is used up
  })
})
