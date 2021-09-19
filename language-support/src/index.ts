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
): R {
  let result = initialValue
  Object.keys(obj).forEach(key => {
    result = fold(result, key, obj[key])
  })
  return result
}

export function mapObject<S, T>(
  obj: Record<string, S>,
  map: (key: string, value: S) => T
) {
  return reduceObject(
    obj,
    (result, key, value) => ({...result, [key]: map(key, value)}),
    {}
  )
}

export function filterObject<T>(
  obj: {[key: string]: T},
  check: (key: string, value: T) => boolean
): {[key: string]: T} {
  return reduceObject(
    obj,
    (result, key, value) => check(key, value)
      ? {...result, [key]: value}
      : result,
    {}
  );
}

export function mergeObjects<A,B,R>(
  objA: {[key: string]: A},
  objB: {[key: string]: B},
  merge: (a: A | undefined, b: B | undefined, key: string) => R
): {[key: string]: R} {
  const objAOnlyRegion = mapObject(
    filterObject(objA, key => objB[key] === undefined),
    (key, value) => merge(value, undefined, key)
  )
  const objBRegion = mapObject(
    objB,
    (key, value) => merge(objA[key], value, key)
  )

  return {
    ...objAOnlyRegion,
    ...objBRegion,
  }
}
