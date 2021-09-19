import {
  mapObject,
  reduceObject,
  sortBy,
  filterObject,
  mergeObjects
} from "./index";

describe("language support", () => {
  type Person = {
    firstName: string,
    lastName: string
  }

  const people: Person[] = [
    { firstName: "Charlie", lastName: "Drew" },
    { firstName: "Elliot",  lastName: "Ali" },
    { firstName: "Alex",    lastName: "Drew" },
    { firstName: "Bailey",  lastName: "Ali" },
  ]

  test("sortBy", () => {

    expect(sortBy<Person>(
      obj => obj.lastName,
      obj => obj.firstName
    )(people)).toEqual([
      { firstName: "Bailey",  lastName: "Ali" },
      { firstName: "Elliot",  lastName: "Ali" },
      { firstName: "Alex",    lastName: "Drew" },
      { firstName: "Charlie", lastName: "Drew" },
    ])
  })

  test("reduceObject", () => {
    const foods = {
      banana: "fruit",
      carrot: "vegetable",
      mushroom: "fungus"
    }

    const numbers = {
      0: "even",
      1: "odd",
      2: "even"
    }

    expect(reduceObject(foods,(result, key, value) => {
      return result + `a ${key} is a ${value}; `
    }, "")).toEqual(
      "a banana is a fruit; a carrot is a vegetable; a mushroom is a fungus; "
    )

    expect(reduceObject(numbers,(result, key, value) => {
      return {
        "odd": value === "odd" ? result.odd.concat(key) : result.odd,
        "even": value === "even" ? result.even.concat(key) : result.even
      }
    }, { "odd": [], "even": [] })).toEqual({
      odd: ["1"], // numeric keys get converted to strings as a result of Object.keys
      even: ["0", "2"]
    })
  })

  test("mapObject", () => {
    const counts = {
      a: 1,
      b: 2,
      c: 3
    }

    expect(mapObject(counts, (key, value) => key !== 'c' ? -value : value)).toEqual({
      a: -1,
      b: -2,
      c: 3
    })
  })

  test("filterObject", () => {
    const obj = {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      x: 6
    }

    expect(filterObject(obj, (key, value) =>
      key === 'x' || value % 2 !== 0
    )).toEqual({
      a: 1,
      c: 3,
      x: 6
    })
  })

  test("mergeObjects", () => {
    const objA = {
      a: 1,
      b: 2,
      c: 3
    }

    const objB = {
      a: 4,
      b: 6,
      d: 7
    }

    expect(mergeObjects(objA, objB, (valueA, valueB, key) => {
      if(valueA === undefined) return `${key} (only in objB) ${valueB}`
      if(valueB === undefined) return `${key} (only in objA) ${valueA}`
      return `${key} ${valueA + valueB}`
    })).toEqual({
      a: "a 5",
      b: "b 8",
      c: "c (only in objA) 3",
      d: "d (only in objB) 7"
    })
  })
})
