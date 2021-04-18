const shiftDays = (days: number) => (date: string) => {
  const [year, month, day] = date.split("-").map(n => parseInt(n))
  return new Date(year, month - 1, day + days).toISOString().substr(0, 10)
}

const shiftMonths = (months: number) => (date: string) => {
  const [year, month, day] = date.split("-").map(n => parseInt(n))
  return new Date(year, month - 1 + months, day).toISOString().substr(0, 10)
}

const shiftYears = (years: number) => (date: string) => {
  const [year, month, day] = date.split("-").map(n => parseInt(n))
  return new Date(year + years, month - 1, day).toISOString().substr(0, 10)
}

function sortBy<T, R>(mapper: (originalValue: T) => R) {
  return function(list: Array<T>): Array<T> {
    const comparator = (a: T, b: T) => {
      const aValue = mapper(a)
      const bValue = mapper(b)

      if(aValue === bValue) return 0
      return aValue < bValue
        ? -1
        : 1
    }

    const newList = list.concat([])
    newList.sort(comparator)
    return newList
  }
}

const savingScheduleGenerator = (
  targetsPerDeadline: number,
  nextDeadline: (previousDeadline: string) => string,
) => function*(
  targetName: string,
  schedule: Array<[string, number]>,
) {
  const chronologicalSchedule = sortBy((scheduleItem => scheduleItem[0]))(schedule);
  const reverseChronologicalSchedule = chronologicalSchedule.concat([]).reverse()
  const scheduledAmountFor = (date: string) =>
    reverseChronologicalSchedule.find(([entryDate]) => entryDate <= date)[1]

  let date = chronologicalSchedule[0][0]

  while (scheduledAmountFor(date) != null) {
    const amount = scheduledAmountFor(date)
    const weeklyAmount = Math.round(amount / targetsPerDeadline)

    yield {
      target: targetName,
      date: shiftDays(-7 * (targetsPerDeadline - 1))(date),
      amount: amount - (weeklyAmount * (targetsPerDeadline - 1)),
    }

    for (let offset = (targetsPerDeadline - 2); offset >= 0; offset--) {
      yield {
        target: targetName,
        date: shiftDays(-7 * offset)(date),
        amount: weeklyAmount,
      }
    }
    date = nextDeadline(date)
  }

  // Explicitly returning a value at the end of the sequence
  // makes for more convenient typechecking, as Typescript
  // will assume the function never yields void. In practice,
  // consumers will likely never use the value when the .done
  // key is true (since the nicest way to empty a generator is
  // `while(!nextValue.done) doStuffWith(nextValue)`
  return {
    target: targetName,
    date: date,
    amount: 0,
  }
}

export const weeklySavingSchedule = savingScheduleGenerator(1, shiftDays(7))
export const monthlySavingSchedule = savingScheduleGenerator(4, shiftMonths(1))
export const yearlySavingSchedule = savingScheduleGenerator(52, shiftYears(1))
