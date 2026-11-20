// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import {
  activityRows,
  addDays,
  busiestHour,
  busiestHourSentence,
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
  UPCOMING_SITUATION_LABELS,
  upcomingSituation,
  type ActivityCounts,
  type EventWindowFacts,
} from "../operator-activity"

// Super-admin statistics (#1415): event windows in APP_TIME_ZONE, comparisons, busiest hour and
// the remaining date formatting. No Prisma and no volunteer data here.

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

  it("labels the situation of the next events, including « Plus tard » beyond 30 days", () => {
    expect(upcomingSituation(event(), now)).toBe("now")
    expect(upcomingSituation(event({ startDate: day("2026-07-13"), endDate: day("2026-07-13") }), now)).toBe("soon7")
    expect(upcomingSituation(event({ startDate: day("2026-07-20"), endDate: day("2026-07-20") }), now)).toBe("soon30")
    expect(upcomingSituation(event({ startDate: day("2026-08-19"), endDate: day("2026-08-19") }), now)).toBe("later")
    expect(UPCOMING_SITUATION_LABELS).toEqual({
      now: "En cours",
      soon7: "Début dans les 7 jours",
      soon30: "Début dans 8 à 30 jours",
      later: "Début dans plus de 30 jours",
    })
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

describe("calendar offsets and event formatting", () => {
  const day = (iso: string) => at(`${iso}T00:00:00Z`)

  it("counts civil days from today, positive in the future", () => {
    expect(civilDayOffset("2026-07-11", "2026-07-10")).toBe(1)
    expect(civilDayOffset("2026-07-10", "2026-07-10")).toBe(0)
    expect(civilDayOffset("2026-07-08", "2026-07-10")).toBe(-2)
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
