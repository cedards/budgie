import {
  combinedSavingSchedule,
  monthlySavingSchedule,
  weeklySavingSchedule,
  yearlySavingSchedule
} from "./saving-schedules";

describe("saving schedules", () => {
  describe("weekly saving schedule", () => {
    it("generates a target on the given date and every 7 days after that", () => {
      const startDate = "2020-11-01"
      const schedule = weeklySavingSchedule("target name", [[startDate, 5000]])
      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 5000,
        date: "2020-11-01"
      })

      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 5000,
        date: "2020-11-08"
      })

      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 5000,
        date: "2020-11-15"
      })
    })
  })

  describe("when the schedule has an end date", () => {
    it("stops generating values when there are no more deadlines", () => {
      const schedule = weeklySavingSchedule("target name", [
        ["2020-11-01", 654321],
        ["2020-11-16", null], // 2020-11-15 will be the last deadline
      ])

      const targets = []
      let next = schedule.next()
      while(!next.done || targets.length > 10 /* safeguard */) {
        targets.push(next)
        next = schedule.next()
      }

      expect(targets.length).toEqual(3)
      expect(targets[targets.length - 1].value.date).toEqual("2020-11-15")
    })
  })

  describe("monthly saving schedule", () => {
    it("generates 4 targets each month, every seven days leading up to the monthly deadline", () => {
      const startDate = "2020-11-01"
      const schedule = monthlySavingSchedule("target name", [[startDate, 4000]])
      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 1000,
        date: "2020-10-11"
      })

      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 1000,
        date: "2020-10-18"
      })

      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 1000,
        date: "2020-10-25"
      })

      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 1000,
        date: "2020-11-01"
      })

      // The next target is more than 7 days from the last one,
      // because it is exactly 3 weeks before December 1.
      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 1000,
        date: "2020-11-10"
      })

      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 1000,
        date: "2020-11-17"
      })

      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 1000,
        date: "2020-11-24"
      })

      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 1000,
        date: "2020-12-01"
      })

      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 1000,
        date: "2020-12-11"
      })

      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 1000,
        date: "2020-12-18"
      })

      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 1000,
        date: "2020-12-25"
      })

      // It makes the year-jump correctly
      expect(schedule.next().value).toEqual({
        target: "target name",
        amount: 1000,
        date: "2021-01-01"
      })
    })

    it("does not make rounding errors when the amount is not divisible by 4", () => {
      const startDate = "2020-11-01"
      const schedule = monthlySavingSchedule("target name", [[startDate, 1111]])
      expect(
        [
          schedule.next(),
          schedule.next(),
          schedule.next(),
          schedule.next()
        ]
          .map(i => (i.value || {}).amount)
          .reduce((x,y) => x+y, 0)
      ).toEqual(1111)
    })

    describe("when the target amount changes", () => {
      it("modifies the weekly target amount so that deadlines on or after the change get the appropriate value", () => {
        const schedule = monthlySavingSchedule(
          "target name",
          [
            ["2020-11-01", 1111],
            ["2021-01-01", 4321],
          ]
        )

        const targetsForNov1 = [
          schedule.next().value,
          schedule.next().value,
          schedule.next().value,
          schedule.next().value,
        ]
        expect(targetsForNov1[targetsForNov1.length - 1].date).toEqual("2020-11-01")
        expect(targetsForNov1.map(t => t.amount).reduce((a,b) => a+b, 0)).toEqual(1111)

        const targetsForDec1 = [
          schedule.next().value,
          schedule.next().value,
          schedule.next().value,
          schedule.next().value,
        ]
        expect(targetsForDec1[targetsForDec1.length - 1].date).toEqual("2020-12-01")
        expect(targetsForDec1.map(t => t.amount).reduce((a,b) => a+b, 0)).toEqual(1111)

        const targetsForJan1 = [
          schedule.next().value,
          schedule.next().value,
          schedule.next().value,
          schedule.next().value,
        ]
        expect(targetsForJan1[targetsForJan1.length - 1].date).toEqual("2021-01-01")
        expect(targetsForJan1.map(t => t.amount).reduce((a,b) => a+b, 0)).toEqual(4321)
      })
    })
  })

  describe("yearly saving schedule", () => {
    it("generates 52 targets each year, every seven days leading up to the yearly deadline", () => {
      const startDate = "2020-11-01"
      const schedule = yearlySavingSchedule("target name", [[startDate, 654321]])

      const targets = []
      let nextTarget = schedule.next().value || { date: "" }
      while(nextTarget.date <= "2020-11-01" && targets.length < 100 /* safeguard */) {
        targets.push(nextTarget)
        nextTarget = schedule.next().value || { date: "" }
      }

      expect(targets.length).toEqual(52)
      expect(targets[targets.length - 1].date).toEqual(startDate)
      expect(
        targets
          .map(t => t.amount)
          .reduce((a,b) => a+b, 0)
      ).toEqual(654321)
    })
  })

  describe("combined saving schedule", () => {
    it("merges all the supplied schedules, ordering targets on the same day by priority", () => {
      // all these schedules have their first trigger on 2021-02-08.
      const highPriority = monthlySavingSchedule("high priority monthly", [["2021-03-01", 1000]])
      const midPriority = yearlySavingSchedule("mid priority yearly", [["2022-01-31", 52000]])
      const lowPriority = weeklySavingSchedule("low priority weekly", [["2021-02-08", 300]])

      const combined = combinedSavingSchedule([
        [lowPriority, 3],
        [highPriority, 1],
        [midPriority, 2],
      ])

      expect([
        combined.next().value,
        combined.next().value,
        combined.next().value,
        combined.next().value,
        combined.next().value,
        combined.next().value,
        combined.next().value,
        combined.next().value,
        combined.next().value,
        combined.next().value,
        combined.next().value,
        combined.next().value,
        combined.next().value,
        combined.next().value,
        combined.next().value,
      ]).toEqual([
        { target: "high priority monthly", date: "2021-02-08", amount: 250 },
        { target: "mid priority yearly", date: "2021-02-08", amount: 1000 },
        { target: "low priority weekly", date: "2021-02-08", amount: 300 },
        { target: "high priority monthly", date: "2021-02-15", amount: 250 },
        { target: "mid priority yearly", date: "2021-02-15", amount: 1000 },
        { target: "low priority weekly", date: "2021-02-15", amount: 300 },
        { target: "high priority monthly", date: "2021-02-22", amount: 250 },
        { target: "mid priority yearly", date: "2021-02-22", amount: 1000 },
        { target: "low priority weekly", date: "2021-02-22", amount: 300 },
        { target: "high priority monthly", date: "2021-03-01", amount: 250 },
        { target: "mid priority yearly", date: "2021-03-01", amount: 1000 },
        { target: "low priority weekly", date: "2021-03-01", amount: 300 },
        { target: "mid priority yearly", date: "2021-03-08", amount: 1000 },
        { target: "low priority weekly", date: "2021-03-08", amount: 300 },
        { target: "high priority monthly", date: "2021-03-11", amount: 250 },
      ])
    })
  })
})
