export class LocalDate {
  private readonly datestring: string
  year: number
  month: number
  day: number

  constructor(datestring: string);
  constructor(year: number, month: number, day: number);
  constructor(yearOrDatestring: number | string, month?: number, day?: number) {
    if (typeof yearOrDatestring === "string") {
      const [year, month, day] = yearOrDatestring.split("-").map(s => parseInt(s))
      this.year = year
      this.month = month
      this.day = day
      this.datestring = yearOrDatestring
    } else {
      this.year = yearOrDatestring
      this.month = month
      this.day = day
      this.datestring = `${this.year}-${this.month}-${this.day}`
    }
  }

  isAfter(other: LocalDate): boolean {
    if (this.year > other.year) return true
    if (this.year === other.year && this.month > other.month) return true
    return this.year === other.year && this.month === other.month && this.day > other.day;
  }
}

export function sortBy<T>(...mappers: Array<(originalValue: T) => any>) {
  return function (list: Array<T>): Array<T> {
    const comparator: (a: T, b: T) => number = mappers
      .concat([])
      .reverse()
      .reduce((composedComparator: null | ((a: T, b: T) => number), mapper) => {
        return (a: T, b: T) => {
          const aValue = mapper(a)
          const bValue = mapper(b)

          if (aValue === bValue) {
            if (composedComparator === null) return 0
            return composedComparator(a, b)
          }

          return aValue < bValue ? -1 : 1
        }
      }, null)

    const newList = list.concat([])
    newList.sort(comparator)
    return newList
  }
}

export function reduceObject<V, R>(
  obj: Record<string, V>,
  fold: (result: R, key: string, value: V) => R,
  initialValue: R
) {
  return Object.keys(obj).reduce((result, key) => fold(result, key, obj[key]), initialValue)
}

export function mapObject<S, T>(
  obj: Record<string, S>,
  map: (key: string, value: S) => T
) {
  return reduceObject(obj, ((result, key, value) => ({
    ...result,
    [key]: map(key, value)
  })), {})
}
