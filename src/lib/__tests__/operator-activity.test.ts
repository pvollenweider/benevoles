// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import {
  activityRows,
  addDays,
  BUBBLE_CATEGORY_LABELS,
  BUBBLE_CATEGORY_SYMBOLS,
  bubbleChartData,
  bubbleDateTickLabel,
  bubbleRadius,
  busiestHour,
  busiestHourSentence,
  chartAxisCap,
  civilDate,
  civilDayOffset,
  comparePeriods,
  eventDatesLabel,
  eventWindowCategory,
  eventWindowCounts,
  fillRate,
  hourBucketLabel,
  registrationOpeningSoon,
  registrationsOpenNow,
  type ActivityCounts,
  type BubbleEventFacts,
  type EventWindowFacts,
} from "../operator-activity"

// Super-admin statistics (#1415): event windows in APP_TIME_ZONE, comparisons, busiest hour and
// the bubble chart data. No Prisma and no volunteer data here.

const at = (iso: string) => new Date(iso)
const day = (iso: string) => at(`${iso}T00:00:00Z`)

const event = (over: Partial<EventWindowFacts> = {}): EventWindowFacts => ({
  publicStatus: "published",
  isListed: true,
  startDate: day("2026-07-10"),
  endDate: day("2026-07-10"),
  ...over,
})

describe("event windows in the Zurich day", () => {
  const now = at("2026-07-10T09:00:00Z") // 11:00 in Zurich

  it("treats today, a multi-day event spanning today and unlisted events as happening now", () => {
    expect(eventWindowCategory(event(), now)).toBe("now")
    expect(eventWindowCategory(event({ startDate: day("2026-07-08"), endDate: day("2026-07-12") }), now)).toBe("now")
    expect(eventWindowCategory(event({ isListed: false }), now)).toBe("now")
  })

  it("puts an event starting in 3, 10 or 40 days in the right bucket", () => {
    expect(eventWindowCategory(event({ startDate: day("2026-07-13"), endDate: day("2026-07-13") }), now)).toBe("soon7")
    expect(eventWindowCategory(event({ startDate: day("2026-07-20"), endDate: day("2026-07-20") }), now)).toBe("soon30")
    expect(eventWindowCategory(event({ startDate: day("2026-08-19"), endDate: day("2026-08-19") }), now)).toBe("later")
  })

  it("excludes an event that ended yesterday, a draft and an archived event", () => {
    expect(eventWindowCategory(event({ startDate: day("2026-07-09"), endDate: day("2026-07-09") }), now)).toBe("past")
    expect(eventWindowCategory(event({ publicStatus: "draft" }), now)).toBe("not_published")
    expect(eventWindowCategory(event({ publicStatus: "archived" }), now)).toBe("not_published")
  })

  it("uses the Zurich civil day, not the UTC day, around midnight", () => {
    // 22:30 UTC on 10 July is already 00:30 on 11 July in Zurich (summer, UTC+2).
    const lateUtc = at("2026-07-10T22:30:00Z")
    expect(civilDate(lateUtc)).toBe("2026-07-11")
    expect(civilDate(lateUtc, "UTC")).toBe("2026-07-10")
    expect(eventWindowCategory(event({ startDate: day("2026-07-11"), endDate: day("2026-07-11") }), lateUtc)).toBe("now")
    expect(eventWindowCategory(event({ startDate: day("2026-07-10"), endDate: day("2026-07-10") }), lateUtc)).toBe("past")
  })

  it("counts the 7-day window inside the 30-day window", () => {
    const counts = eventWindowCounts(
      [
        event(),
        event({ startDate: day("2026-07-13"), endDate: day("2026-07-13") }),
        event({ startDate: day("2026-07-20"), endDate: day("2026-07-20") }),
        event({ startDate: day("2026-08-19"), endDate: day("2026-08-19") }),
        event({ publicStatus: "draft" }),
      ],
      now,
    )
    expect(counts).toEqual({ now: 1, startingWithin7: 1, startingWithin30: 2 })
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01")
  })
})

describe("registration periods", () => {
  const now = at("2026-07-10T09:00:00Z")
  const open = { publicStatus: "published", registrationsOpen: true }

  it("is open now by default and inside the scheduled window", () => {
    expect(registrationsOpenNow(open, now)).toBe(true)
    expect(registrationsOpenNow({ ...open, registrationOpensAt: at("2026-07-10T08:00:00Z"), registrationClosesAt: at("2026-07-11T08:00:00Z") }, now)).toBe(true)
  })

  it("is closed before the opening, after the closing, when disabled or unpublished", () => {
    expect(registrationsOpenNow({ ...open, registrationOpensAt: at("2026-07-12T08:00:00Z") }, now)).toBe(false)
    expect(registrationsOpenNow({ ...open, registrationClosesAt: at("2026-07-10T08:00:00Z") }, now)).toBe(false)
    expect(registrationsOpenNow({ ...open, registrationsOpen: false }, now)).toBe(false)
    expect(registrationsOpenNow({ publicStatus: "draft", registrationsOpen: true }, now)).toBe(false)
  })

  it("counts only the openings scheduled in the next 7 days", () => {
    expect(registrationOpeningSoon({ ...open, registrationOpensAt: at("2026-07-13T08:00:00Z") }, now)).toBe(true)
    expect(registrationOpeningSoon({ ...open, registrationOpensAt: at("2026-07-10T08:00:00Z") }, now)).toBe(false)
    expect(registrationOpeningSoon({ ...open, registrationOpensAt: at("2026-07-20T08:00:00Z") }, now)).toBe(false)
    expect(registrationOpeningSoon({ ...open, registrationsOpen: false, registrationOpensAt: at("2026-07-13T08:00:00Z") }, now)).toBe(false)
  })
})

describe("registration rhythm and comparisons", () => {
  it("compares each period with the previous one of the same length", () => {
    expect(comparePeriods(12, 10)).toMatchObject({ delta: 2, percent: 20, direction: "up", text: "en hausse de 20 % par rapport à la période précédente" })
    expect(comparePeriods(5, 10)).toMatchObject({ delta: -5, percent: -50, direction: "down", text: "en baisse de 50 % par rapport à la période précédente" })
    expect(comparePeriods(7, 7)).toMatchObject({ delta: 0, percent: 0, direction: "flat", text: "stable par rapport à la période précédente" })
    expect(comparePeriods(1001, 1000)).toMatchObject({ delta: 1, percent: 0, direction: "up", text: "+1 inscription par rapport à la période précédente" })
    expect(comparePeriods(3, 0)).toMatchObject({ percent: null, direction: "up", text: "aucune inscription sur la période précédente" })
    expect(comparePeriods(0, 0)).toMatchObject({ percent: null, direction: "flat", text: "aucune inscription sur les deux périodes" })
  })

  it("builds the three activity rows with their own comparison", () => {
    const counts: ActivityCounts = { lastHour: 4, previousHour: 2, last24h: 30, previous24h: 40, last7d: 200, previous7d: 160 }
    const rows = activityRows(counts)
    expect(rows.map((row) => row.label)).toEqual(["Dernière heure", "Dernières 24 heures", "7 derniers jours"])
    expect(rows.map((row) => row.comparison.direction)).toEqual(["up", "down", "up"])
  })

  it("finds the busiest hour, earliest first on a tie, and words it", () => {
    expect(busiestHour([])).toBeNull()
    expect(busiestHour([{ hour: "2026-07-09T18", count: 0 }])).toBeNull()
    expect(busiestHour([
      { hour: "2026-07-09T19", count: 12 },
      { hour: "2026-07-09T18", count: 12 },
      { hour: "2026-07-09T20", count: 5 },
    ])).toEqual({ hour: "2026-07-09T18", count: 12 })
    expect(hourBucketLabel("2026-07-09T18")).toBe("jeudi 9 juillet, de 18h à 19h")
    expect(busiestHourSentence({ hour: "2026-07-09T18", count: 12 })).toBe("jeudi 9 juillet, de 18h à 19h : 12 inscriptions")
    expect(busiestHourSentence(null)).toBe("Aucune inscription sur les 7 derniers jours.")
  })
})

describe("bubble chart data", () => {
  const now = at("2026-07-10T09:00:00Z")
  const bubbleEvent = (over: Partial<BubbleEventFacts> = {}): BubbleEventFacts => ({
    id: "e1",
    title: "Fête du village",
    organizationName: "Fête",
    publicStatus: "published",
    isListed: true,
    startDate: day("2026-07-10"),
    endDate: day("2026-07-10"),
    shifts: 2,
    registrations: 5,
    roles: 1,
    ...over,
  })

  it("keeps only published events happening now or starting within 30 days", () => {
    const data = bubbleChartData(
      [
        bubbleEvent({ id: "now" }),
        bubbleEvent({ id: "unlisted", isListed: false }),
        bubbleEvent({ id: "within7", startDate: day("2026-07-13"), endDate: day("2026-07-13") }),
        bubbleEvent({ id: "within30", startDate: day("2026-07-20"), endDate: day("2026-07-20") }),
        bubbleEvent({ id: "later", startDate: day("2026-08-19"), endDate: day("2026-08-19") }),
        bubbleEvent({ id: "past", startDate: day("2026-07-09"), endDate: day("2026-07-09") }),
        bubbleEvent({ id: "draft", publicStatus: "draft" }),
        bubbleEvent({ id: "archived", publicStatus: "archived" }),
      ],
      now,
    )
    expect(data.points.map((point) => point.id)).toEqual(["now", "unlisted", "within7", "within30"])
    expect(data.points.map((point) => point.category)).toEqual(["now", "now", "within7", "within30"])
  })

  it("places x at the start date in Zurich days from today, including a past start", () => {
    const data = bubbleChartData(
      [
        bubbleEvent({ id: "tomorrow", startDate: day("2026-07-11"), endDate: day("2026-07-11") }),
        bubbleEvent({ id: "ongoing", startDate: day("2026-07-08"), endDate: day("2026-07-10"), registrations: 7 }),
      ],
      now,
    )
    expect(data.today).toBe("2026-07-10")
    // The table order is by start date: the event that started two days ago comes first.
    expect(data.points.map((point) => [point.id, point.x])).toEqual([["ongoing", -2], ["tomorrow", 1]])
    expect(data.axis).toEqual({ xMin: -4, xMax: 32, yMax: null, capped: false })
    expect(civilDayOffset("2026-07-11", "2026-07-10")).toBe(1)
    expect(civilDayOffset("2026-07-08", "2026-07-10")).toBe(-2)
  })

  it("uses the Zurich civil day, not the UTC day, for x around midnight", () => {
    // 22:30 UTC on 10 July is already 00:30 on 11 July in Zurich (summer, UTC+2).
    const lateUtc = at("2026-07-10T22:30:00Z")
    const data = bubbleChartData(
      [
        bubbleEvent({ id: "zurich-today", startDate: day("2026-07-11"), endDate: day("2026-07-11") }),
        bubbleEvent({ id: "zurich-tomorrow", startDate: day("2026-07-12"), endDate: day("2026-07-12") }),
      ],
      lateUtc,
    )
    expect(data.today).toBe("2026-07-11")
    expect(data.points.map((point) => point.x)).toEqual([0, 1])
    expect(bubbleDateTickLabel(0, data.today)).toBe("Aujourd'hui")
  })

  it("gives the bubble a radius whose area follows the number of créneaux", () => {
    expect(bubbleRadius(1, 4)).toBe(13)
    expect(bubbleRadius(4, 4)).toBe(26)
    expect(bubbleRadius(4, 4) / bubbleRadius(1, 4)).toBeCloseTo(2) // area ratio 4
    expect(bubbleRadius(0, 4)).toBe(6)
    const data = bubbleChartData([
      bubbleEvent({ id: "a", shifts: 1, roles: 4 }),
      bubbleEvent({ id: "b", shifts: 4, roles: 1, registrations: 10 }),
    ], now)
    expect(data.points.find((point) => point.id === "b")!.radius).toBe(26)
    expect(data.points.find((point) => point.id === "a")!.radius).toBe(13)
    // Roles no longer drive the size: the same number of créneaux gives the same radius.
    const sameShifts = bubbleChartData([
      bubbleEvent({ id: "big", shifts: 8 }),
      bubbleEvent({ id: "few-roles", shifts: 2, roles: 0 }),
      bubbleEvent({ id: "many-roles", shifts: 2, roles: 9 }),
    ], now)
    expect(sameShifts.points.find((point) => point.id === "few-roles")!.radius).toBe(sameShifts.points.find((point) => point.id === "many-roles")!.radius)
  })

  it("caps only the registrations axis instead of using a log scale, which cannot place a zero", () => {
    const data = bubbleChartData([
      bubbleEvent({ id: "a", shifts: 2, registrations: 5 }),
      bubbleEvent({ id: "b", shifts: 3, registrations: 6 }),
      bubbleEvent({ id: "c", shifts: 4, registrations: 8 }),
      bubbleEvent({ id: "huge", title: "Festival géant", shifts: 1000, registrations: 2000, roles: 20 }),
    ], now)
    expect(chartAxisCap([5, 6, 8, 2000])).toBe(10)
    expect(chartAxisCap([0, 0, 3])).toBeNull() // less than 10 units apart: no cap
    expect(data.axis).toEqual({ xMin: -2, xMax: 32, yMax: 10, capped: true })
    const huge = data.points.find((point) => point.id === "huge")!
    expect(huge).toMatchObject({ x: 0, y: 10, shifts: 1000, registrations: 2000, radius: 26, clampedY: true })
    // The x axis is dates now: a huge number of créneaux never pushes it beyond today + 30 days.
    expect(huge.x).toBe(0)
    expect(huge).not.toHaveProperty("clampedX")
    expect(data.summary).toContain("« Festival géant »")
    expect(data.summary).toContain("l'axe des inscriptions est plafonné à 10 ; « Festival géant » le dépasse (2000)")
    expect(data.summary).not.toContain("l'axe des créneaux est plafonné")
    expect(data.summary).toContain("le tableau donne les valeurs réelles")
    // The labels name the exclusive 8–30-day bucket, and each category has its own shape symbol.
    expect(BUBBLE_CATEGORY_LABELS.within30).toBe("Début dans 8 à 30 jours")
    expect(BUBBLE_CATEGORY_SYMBOLS).toEqual({ now: "●", within7: "▲", within30: "■" })
  })

  it("summarises empty, one-event and several-event charts", () => {
    expect(bubbleChartData([], now)).toMatchObject({
      points: [],
      empty: true,
      today: "2026-07-10",
      summary: "Aucun événement en cours ou dans les 30 jours.",
      axis: { xMin: -2, xMax: 32, yMax: null, capped: false },
    })
    expect(bubbleChartData([bubbleEvent()], now).summary).toBe("1 événement ; le plus gros : « Fête du village » (2 créneaux, 5 inscriptions, 1 poste).")
    const several = bubbleChartData([
      bubbleEvent({ id: "a", title: "Petit", registrations: 2 }),
      bubbleEvent({ id: "b", title: "Grand", registrations: 40, shifts: 6, roles: 3 }),
      bubbleEvent({ id: "c", title: "Moyen", registrations: 12, shifts: 4, roles: 2 }),
    ], now)
    expect(several.summary).toContain("3 événements ; le plus gros : « Grand » (6 créneaux, 40 inscriptions, 3 postes)")
  })

  it("shows the real values in the table and the chart summary", () => {
    const data = bubbleChartData([bubbleEvent({ roles: 0, shifts: 0, registrations: 0 })], now)
    expect(data.points[0]).toMatchObject({ shifts: 0, registrations: 0, roles: 0, radius: 6, x: 0, clampedY: false })
  })

  it("formats date-axis ticks as short French dates, with « Aujourd'hui » at day 0", () => {
    expect(bubbleDateTickLabel(0, "2026-07-10")).toBe("Aujourd'hui")
    expect(bubbleDateTickLabel(1, "2026-07-10")).toBe("11 juil.")
    expect(bubbleDateTickLabel(-2, "2026-07-10")).toBe("8 juil.")
    expect(bubbleDateTickLabel(30, "2026-07-10")).toBe("9 août")
  })

  it("formats event dates and fill rates", () => {
    expect(eventDatesLabel(day("2026-07-10"), day("2026-07-10"))).toBe("10 juillet 2026")
    expect(eventDatesLabel(day("2026-07-10"), day("2026-07-12"))).toBe("10–12 juillet 2026")
    expect(eventDatesLabel(day("2026-06-30"), day("2026-07-02"))).toBe("30 juin 2026 – 2 juillet 2026")
    expect(fillRate(25, 100)).toBe(25)
    expect(fillRate(0, 0)).toBeNull()
    expect(fillRate(120, 100)).toBe(100)
  })
})
