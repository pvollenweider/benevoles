// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import {
  DEFAULT_LOAD_RANGE,
  LOAD_RANGES,
  LOAD_RANGE_KEYS,
  axisFor,
  bucketCount,
  bucketIndexForDay,
  buildLoadRange,
  countLabel,
  detailHeadingFor,
  eventBand,
  eventDetail,
  formatAxisDay,
  formatDayWithYear,
  formatLoadNumber,
  formatLongDay,
  formatShortDay,
  loadAxes,
  loadDescription,
  niceStep,
  periodAriaLabel,
  periodEventRows,
  periodQualifier,
  periodTitle,
  periodWord,
  rangeAnnouncement,
  type LoadDay,
  type LoadEvent,
  type OperatorLoadData,
} from "../operator-load"

// The pure logic of « Charge par jour » (#1415): symmetric window, week buckets cut at today,
// distinct events, top five, event band clipping and the two round axes. No Prisma, no volunteer
// data: the loader only supplies plain facts.

const TODAY = "2026-07-10"

const event = (over: Partial<LoadEvent> = {}): LoadEvent => ({
  id: "e1",
  title: "Fête du village",
  organizationName: "Fête",
  organizationSlug: "fete",
  startDate: TODAY,
  endDate: TODAY,
  archived: false,
  shifts: 2,
  capacity: 10,
  registrations: 5,
  ...over,
})

const day = (over: Partial<LoadDay> = {}): LoadDay => ({
  day: TODAY,
  eventId: "e1",
  shifts: 2,
  capacity: 10,
  registrations: 5,
  ...over,
})

const data = (events: LoadEvent[], days: LoadDay[], today = TODAY): OperatorLoadData => ({ today, events, days })

describe("ranges", () => {
  it("describes the four ranges, with « Un mois » as the default", () => {
    expect(LOAD_RANGE_KEYS).toEqual(["week", "month", "half", "year"])
    expect(DEFAULT_LOAD_RANGE).toBe("month")
    expect(LOAD_RANGES.week).toMatchObject({ days: 7, unit: "day", buttonLabel: "Une semaine" })
    expect(LOAD_RANGES.month).toMatchObject({ days: 31, unit: "day", buttonLabel: "Un mois" })
    expect(LOAD_RANGES.half).toMatchObject({ days: 182, unit: "week", buttonLabel: "6 mois" })
    expect(LOAD_RANGES.year).toMatchObject({ days: 364, unit: "week", buttonLabel: "Un an" })
  })

  it("spans the same length before and after today, today opening the future side", () => {
    const week = buildLoadRange(data([], []), "week")
    expect(week.start).toBe("2026-07-03")
    expect(week.end).toBe("2026-07-16")
    expect(week.buckets).toHaveLength(14)
    expect(week.buckets[0]).toMatchObject({ from: "2026-07-03", to: "2026-07-03" })
    expect(week.buckets[13]).toMatchObject({ from: "2026-07-16", to: "2026-07-16" })
    expect(week.todayIndex).toBe(7)

    const month = buildLoadRange(data([], []), "month")
    expect(month.start).toBe("2026-06-09")
    expect(month.end).toBe("2026-08-09")
    expect(month.buckets).toHaveLength(62)
    expect(month.todayIndex).toBe(31)
    expect(month.buckets[31].from).toBe(TODAY)
  })

  it("cuts the weekly buckets so that one starts today", () => {
    const half = buildLoadRange(data([], []), "half")
    expect(half.buckets).toHaveLength(52)
    expect(half.todayIndex).toBe(26)
    expect(half.buckets[26]).toMatchObject({ from: TODAY, to: "2026-07-16" })
    expect(half.buckets[25].to).toBe("2026-07-09") // the previous week ends yesterday
    expect(bucketCount(LOAD_RANGES.half)).toBe(52)

    const year = buildLoadRange(data([], []), "year")
    // 364 days on each side, 52 whole weeks before and 52 weeks from today: 104 buckets.
    expect(year.buckets).toHaveLength(104)
    expect(bucketCount(LOAD_RANGES.year)).toBe(104)
    expect(year.todayIndex).toBe(52)
    expect(year.buckets[52].from).toBe(TODAY)
    expect(year.buckets[51].to).toBe("2026-07-09")
    expect(year.buckets[103].to).toBe("2027-07-08")
  })

  it("maps a day to its bucket and returns null outside the window", () => {
    const week = buildLoadRange(data([], []), "week")
    expect(bucketIndexForDay(week, TODAY)).toBe(7)
    expect(bucketIndexForDay(week, "2026-07-03")).toBe(0)
    expect(bucketIndexForDay(week, "2026-07-16")).toBe(13)
    expect(bucketIndexForDay(week, "2026-07-02")).toBeNull()
    expect(bucketIndexForDay(week, "2026-07-17")).toBeNull()
  })
})

describe("buckets", () => {
  it("sums shifts, capacity and registrations and counts distinct events per period", () => {
    const week = buildLoadRange(
      data(
        [event(), event({ id: "e2", title: "Festival", capacity: 4, registrations: 2 })],
        [
          day(),
          day({ eventId: "e2", shifts: 1, capacity: 4, registrations: 2 }),
          day({ day: "2026-07-11", shifts: 4, capacity: 20, registrations: 6 }),
          day({ day: "2026-07-09", eventId: "e2", shifts: 3, capacity: 6, registrations: 1 }),
          day({ day: "2026-07-17", shifts: 99, capacity: 99, registrations: 99 }), // outside the week
        ],
      ),
      "week",
    )
    const today = week.buckets[7]
    expect(today).toMatchObject({ from: TODAY, to: TODAY, shifts: 3, capacity: 14, registrations: 7, events: 2 })
    expect(today.byEvent.e1).toMatchObject({ shifts: 2, capacity: 10, registrations: 5 })
    expect(today.byEvent.e2).toMatchObject({ shifts: 1, capacity: 4, registrations: 2 })
    expect(week.buckets[8]).toMatchObject({ shifts: 4, capacity: 20, registrations: 6, events: 1 })
    expect(week.buckets[6]).toMatchObject({ shifts: 3, capacity: 6, registrations: 1, events: 1 })
    expect(week.buckets[9].shifts).toBe(0)
    // A row outside the window never leaks into the last bucket.
    expect(week.buckets[13].shifts).toBe(0)
  })

  it("keeps empty periods at zero, with no event", () => {
    const range = buildLoadRange(data([event()], []), "month")
    expect(range.buckets.every((bucket) => bucket.shifts === 0 && bucket.events === 0 && bucket.registrations === 0)).toBe(true)
    expect(range.topEvents).toEqual([])
    expect(range.buckets[range.todayIndex].from).toBe(TODAY)
  })

  it("counts an event once per bucket even with several days in a weekly bucket", () => {
    const range = buildLoadRange(
      data(
        [event()],
        [day({ day: "2026-07-10" }), day({ day: "2026-07-12", shifts: 1, capacity: 2, registrations: 0 })],
      ),
      "half",
    )
    expect(range.buckets[range.todayIndex].events).toBe(1)
    expect(range.buckets[range.todayIndex].shifts).toBe(3)
  })

  it("ranks the five biggest events of the range, ties stable by title then id", () => {
    const events = [
      event({ id: "foxtrot", title: "Foxtrot", shifts: 1 }),
      event({ id: "bravo", title: "Bravo", shifts: 5 }),
      event({ id: "alpha", title: "Alpha", shifts: 5 }),
      event({ id: "delta", title: "Delta", shifts: 4 }),
      event({ id: "echo", title: "Echo", shifts: 3 }),
      event({ id: "charlie", title: "Charlie", shifts: 2 }),
    ]
    const days = events.map((candidate) => day({ eventId: candidate.id, shifts: candidate.shifts, capacity: 0, registrations: 0 }))
    const first = buildLoadRange(data(events, days), "month")
    expect(first.topEvents.map((candidate) => candidate.title)).toEqual(["Alpha", "Bravo", "Delta", "Echo", "Charlie"])
    // Same inputs, same order: the legend never jumps between two renders.
    expect(buildLoadRange(data(events, days), "month").topEvents.map((candidate) => candidate.id)).toEqual(first.topEvents.map((candidate) => candidate.id))
  })

  it("lists a period's events most shifts first and marks their legend rank", () => {
    const events = [event({ id: "big", title: "Grand", shifts: 8 }), event({ id: "small", title: "Petit", shifts: 2 })]
    const range = buildLoadRange(
      data(events, [day({ eventId: "small", shifts: 2 }), day({ eventId: "big", shifts: 8 })]),
      "week",
    )
    const rows = periodEventRows(range, data(events, []), range.todayIndex)
    expect(rows.map((row) => [row.event.id, row.shifts, row.colorIndex])).toEqual([
      ["big", 8, 0],
      ["small", 2, 1],
    ])
  })
})

describe("event band and detail", () => {
  it("clips an event spanning both window edges to the first and last bucket", () => {
    const month = buildLoadRange(data([], []), "month")
    const band = eventBand(month, event({ startDate: "2026-01-01", endDate: "2026-12-31" }))
    expect(band).toEqual({ fromIndex: 0, toIndex: 61, startsBefore: true, endsAfter: true })

    const year = buildLoadRange(data([], []), "year")
    expect(eventBand(year, event({ startDate: "2020-01-01", endDate: "2030-12-31" }))).toMatchObject({
      fromIndex: 0,
      toIndex: 103,
      startsBefore: true,
      endsAfter: true,
    })
  })

  it("flags the sides it clips and returns null for an event outside the window", () => {
    const month = buildLoadRange(data([], []), "month")
    const beforeOnly = eventBand(month, event({ startDate: "2026-01-01", endDate: "2026-06-15" }))
    expect(beforeOnly).toMatchObject({ startsBefore: true, endsAfter: false })
    const afterOnly = eventBand(month, event({ startDate: "2026-08-01", endDate: "2026-12-31" }))
    expect(afterOnly).toMatchObject({ startsBefore: false, endsAfter: true })
    const inside = eventBand(month, event({ startDate: "2026-07-10", endDate: "2026-07-10" }))
    expect(inside).toEqual({ fromIndex: 31, toIndex: 31, startsBefore: false, endsAfter: false })
    expect(eventBand(month, event({ startDate: "2026-06-01", endDate: "2026-06-08" }))).toBeNull()
    expect(eventBand(month, event({ startDate: "2026-08-10", endDate: "2026-08-12" }))).toBeNull()
  })

  it("gives the event's days inside the range and its whole-event fill rate", () => {
    const eventFact = event({ shifts: 10, capacity: 20, registrations: 5 })
    const range = buildLoadRange(data([eventFact], []), "month")
    const detail = eventDetail(
      range,
      data(
        [eventFact],
        [
          day({ day: "2026-07-12", shifts: 3, capacity: 6, registrations: 2 }),
          day({ day: TODAY, shifts: 2, capacity: 4, registrations: 1 }),
          day({ day: "2026-01-01", shifts: 9, capacity: 9, registrations: 9 }), // outside the month
        ],
      ),
      "e1",
    )
    expect(detail).toMatchObject({ shifts: 5, capacity: 10, registrations: 3, fillPercent: 25 })
    expect(detail!.days.map((row) => row.day)).toEqual([TODAY, "2026-07-12"])
    expect(eventDetail(range, data([], []), "missing")).toBeNull()
  })
})

describe("axes", () => {
  it("rounds steps to 1, 2, 5 or 10 times a power of ten, never below 1", () => {
    expect(niceStep(1)).toBe(1)
    expect(niceStep(7, 5)).toBe(2)
    expect(niceStep(10, 5)).toBe(2)
    expect(niceStep(12, 5)).toBe(5)
    expect(niceStep(25, 5)).toBe(5)
    expect(niceStep(100, 5)).toBe(20)
  })

  it("keeps only the ticks the data needs and never an empty tick above it", () => {
    expect(axisFor(7)).toEqual({ step: 2, tickCount: 4, max: 8, ticks: [0, 2, 4, 6, 8] })
    expect(axisFor(3)).toEqual({ step: 1, tickCount: 3, max: 3, ticks: [0, 1, 2, 3] })
    expect(axisFor(0)).toEqual({ step: 1, tickCount: 1, max: 1, ticks: [0, 1] })
    expect(axisFor(12)).toEqual({ step: 5, tickCount: 3, max: 15, ticks: [0, 5, 10, 15] })
    expect(axisFor(100).ticks).toEqual([0, 20, 40, 60, 80, 100])
    for (const value of [0, 1, 7, 10, 12, 25, 100]) {
      const axis = axisFor(value)
      expect(axis.max).toBeGreaterThanOrEqual(Math.max(1, value))
      expect(axis.max - axis.step).toBeLessThan(Math.max(1, value))
      expect(axis.ticks).toHaveLength(axis.tickCount + 1)
      // Counts never get a decimal tick.
      expect(Number.isInteger(axis.step)).toBe(true)
    }
  })

  it("gives each axis its own step from the buckets", () => {
    const range = buildLoadRange(
      data(
        [event({ id: "e1", shifts: 7 }), event({ id: "e2", shifts: 1 }), event({ id: "e3", shifts: 1 })],
        [day({ eventId: "e1", shifts: 7 }), day({ eventId: "e2", shifts: 1 }), day({ eventId: "e3", shifts: 1 })],
      ),
      "week",
    )
    const axes = loadAxes(range.buckets)
    expect(axes.shifts).toMatchObject({ step: 2, max: 10 })
    expect(axes.events).toMatchObject({ step: 1, max: 3 })
  })
})

describe("titles", () => {
  const range = buildLoadRange(data([], []), "month")
  const bucket = (day: string) => ({
    from: day,
    to: day,
    index: 0,
    byEvent: {},
    events: 0,
    shifts: 0,
    capacity: 0,
    registrations: 0,
  })

  it("labels a day and a week, in French", () => {
    expect(periodTitle(bucket(TODAY), "day")).toBe("vendredi 10 juillet")
    expect(periodTitle({ from: "2026-07-10", to: "2026-07-16" }, "week")).toBe("Semaine du 10 juil. au 16 juil. 2026")
    expect(formatLongDay(TODAY)).toBe("vendredi 10 juillet")
    expect(formatShortDay(TODAY)).toBe("10 juil.")
    expect(formatLoadNumber(1234)).toBe("1 234")
    expect(periodWord("day")).toBe("ce jour")
    expect(periodWord("week")).toBe("cette semaine")
  })

  it("qualifies past, today and current-week periods", () => {
    expect(periodQualifier(bucket(TODAY), TODAY, "day")).toBe(" (aujourd'hui)")
    expect(periodQualifier(bucket("2026-07-09"), TODAY, "day")).toBe(" (passé)")
    expect(periodQualifier(bucket("2026-07-11"), TODAY, "day")).toBe("")
    expect(periodQualifier({ from: "2026-07-10", to: "2026-07-16" }, TODAY, "week")).toBe(" (semaine en cours)")
    expect(periodQualifier({ from: "2026-07-03", to: "2026-07-09" }, TODAY, "week")).toBe(" (passé)")
    expect(periodQualifier({ from: "2026-07-17", to: "2026-07-23" }, TODAY, "week")).toBe("")
    expect(range.todayIndex).toBe(31)
  })

  it("names the period with its qualifier and the figures in its button", () => {
    const button = { ...range.buckets[range.todayIndex], shifts: 3, events: 2, registrations: 4 }
    expect(periodAriaLabel(button, TODAY, "day")).toBe(
      "vendredi 10 juillet (aujourd'hui) : 3 créneaux, 2 événements, 4 inscrits. Afficher le détail.",
    )
    const past = { ...button, from: "2026-07-09", to: "2026-07-09" }
    expect(periodAriaLabel(past, TODAY, "day")).toBe(
      "jeudi 9 juillet (passé) : 3 créneaux, 2 événements, 4 inscrits. Afficher le détail.",
    )
    const week = { ...button, from: "2026-07-10", to: "2026-07-16" }
    expect(periodAriaLabel(week, TODAY, "week")).toBe(
      "Semaine du 10 juil. au 16 juil. 2026 (semaine en cours) : 3 créneaux, 2 événements, 4 inscrits. Afficher le détail.",
    )
    expect(detailHeadingFor(button, TODAY, "day")).toBe(
      "vendredi 10 juillet (aujourd'hui) : 2 événements, 3 créneaux, 4 inscrits",
    )
  })

  it("writes counts in words and dates with the right precision", () => {
    expect(countLabel(0, "événement", "événements")).toBe("0 événement")
    expect(countLabel(1, "créneau", "créneaux")).toBe("1 créneau")
    expect(countLabel(3, "inscrit", "inscrits")).toBe("3 inscrits")
    expect(formatAxisDay(TODAY, 31)).toBe("10 juil.")
    expect(formatAxisDay(TODAY, 32)).toBe("10 juil. 26")
    expect(formatDayWithYear(TODAY)).toBe("10 juillet 2026")
  })

  it("announces a range switch and describes the hidden axes and window", () => {
    expect(rangeAnnouncement(LOAD_RANGES.week)).toBe("Une semaine : 14 jours")
    expect(rangeAnnouncement(LOAD_RANGES.month)).toBe("Un mois : 62 jours")
    expect(rangeAnnouncement(LOAD_RANGES.half)).toBe("6 mois : 52 semaines")
    expect(rangeAnnouncement(LOAD_RANGES.year)).toBe("Un an : 104 semaines")
    expect(loadDescription(LOAD_RANGES.month, "2026-06-09", "2026-08-09")).toBe(
      "Les barres empilées donnent les créneaux par jour (axe de gauche, les cinq plus gros événements de la période en couleur) et la courbe le nombre d'événements avec au moins un créneau (axe de droite). Le passé est grisé (événements archivés compris) et une règle marque aujourd'hui. Période affichée : un mois de part et d'autre, du 9 juin 2026 au 9 août 2026.",
    )
    expect(loadDescription(LOAD_RANGES.year, "2025-07-11", "2027-07-08")).toContain("les créneaux par semaine")
  })
})
