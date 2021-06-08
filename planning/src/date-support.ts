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
