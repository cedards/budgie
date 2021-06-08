import {EventStream, InMemoryEventStream} from "../event-stream";
import {CreateMonthlyTarget, CreateWeeklyTarget, GetBudgets, GetRunway, GetTargets, Target} from "./index";
import {CreateAccount, CreditAccount, DebitAccount} from "../bookkeeping";

describe("budgeting", () => {
  let eventStream: EventStream;
  let createMonthlyTarget: (startDate: string, targetName: string, targetValue: number, priority: number, allocateFrom: string) => Promise<void>;
  let createWeeklyTarget: (startDate: string, targetName: string, targetValue: number, priority: number, allocateFrom: string) => Promise<void>;
  let getTargets: (date: string) => Promise<{[name: string]: Target}>;
  let getBudgets: (date: string) => Promise<{[name: string]: number}>;
  let getRunway: (date: string) => Promise<{[name: string]: string}>;
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
    createAccount = CreateAccount(eventStream)
  })

  test("grocery budget", async () => {
    await createAccount("Checking")
    await createWeeklyTarget(startDate, "groceries", 50, 1, "Checking")
    const creditAccount = CreditAccount(eventStream)
    const debitAccount = DebitAccount(eventStream)

    const availableGroceryMoneyOn = async (date: string) => {
      const budgets = await getBudgets(date)
      return budgets["groceries"]
    }

    await(creditAccount("Checking", 1000, startDate))

    expect(await availableGroceryMoneyOn(startDate)).toEqual(50)

    await debitAccount("Checking", 25, startDatePlus(2), "groceries")

    expect(await availableGroceryMoneyOn(startDatePlus(2))).toEqual(25)

    expect(await availableGroceryMoneyOn(startDatePlus(7))).toEqual(75)

    // large expense that is going to be split with friends:
    await debitAccount("Checking", 100, startDatePlus(8), "groceries")

    expect(await availableGroceryMoneyOn(startDatePlus(8))).toEqual(-25)

    // when friends pay me back for their half of the expense:
    await creditAccount("Checking", 50, startDatePlus(9), "groceries")

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

    await createWeeklyTarget(startDate, "groceries", 100, 2, "Account A")
    await createMonthlyTarget(startDatePlus(7*3), "rent", 500, 1, "Account A")

    expect(await rentRunwayAsOf(startDate)).toEqual(startDatePlus(7*3))
    expect(await groceryRunwayAsOf(startDate)).toEqual(startDatePlus(7*4))

    // make a grocery expenditure that's within budget:
    await debitAccount("Checking", 100, startDatePlus(1), "groceries")
    // runway doesn't change:
    expect(await groceryRunwayAsOf(startDatePlus(1))).toEqual(startDatePlus(7*4))

    // but if I overspend:
    await debitAccount("Checking", 100, startDatePlus(1), "groceries")
    // then runway decreases, because I've drawn money from the pool that allocation doesn't account for:
    expect(await groceryRunwayAsOf(startDatePlus(1))).toEqual(startDatePlus(7*3))
  })
})
