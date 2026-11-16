// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { addDays } from "../../../src/lib/shift-series"
import {
  activePolicy, buildPolicy, checkPolicyValues, evaluateWorkload, EXISTING_WARNING_SUGGESTIONS, WORKLOAD_BENCHMARKS, WRITE_SECTIONS,
  type DutyShift, type WorkloadPolicyValues,
} from "../../../src/lib/workload-policy"
import { WL_EVENT, WL_NEWCOMER, WL_OWNER, WL_PEOPLE, WL_PERSON_EMAIL, WL_POSTES, fridayAfter, wlShiftId, wlToken } from "../../../scripts/seed-video-workload"
import { WL_BENCHMARK_ACTIONS, WL_TYPED, WORKLOAD_OWNER_EMAIL } from "../record-workload-protection"

/**
 * The WORKLOAD_PROTECTION take judged before it is filmed: the seeded schedule
 * (scripts/seed-video-workload.ts) against the values the recorder types and the buttons it uses,
 * through the product's own evaluator. A change of the rules or of the fixture that would make the
 * preview, the refusal or the activation differ from the narration fails here, not mid-take.
 */

const root = path.resolve(__dirname, "../../..")
const recorder = readFileSync(path.join(root, "videos/lib/record-workload-protection.ts"), "utf8")
const seed = readFileSync(path.join(root, "scripts/seed-video-workload.ts"), "utf8")

const FRIDAY = fridayAfter("2026-10-29", 14)
const event = { startDate: FRIDAY, endDate: addDays(FRIDAY, 2) }
const benchmark = (action: string) => {
  const found = WORKLOAD_BENCHMARKS.find((b) => b.action === action)
  if (!found) throw new Error(`No benchmark « ${action} »`)
  return found
}

/** The values on the card once the take has filled it, with the days-off answer given. */
function takeValues(offDay: WorkloadPolicyValues["offDay"]): WorkloadPolicyValues {
  const [rest, meal, travel, minors] = WL_BENCHMARK_ACTIONS.map(benchmark)
  const h = (hours: string) => Number(hours) * 60
  return {
    serviceDayStart: WL_TYPED.serviceDayStart,
    maxContinuousMinutes: EXISTING_WARNING_SUGGESTIONS.maxContinuousMinutes!,
    minBreakMinutes: EXISTING_WARNING_SUGGESTIONS.minBreakMinutes!,
    maxDailyMinutes: EXISTING_WARNING_SUGGESTIONS.maxDailyMinutes!,
    maxEventMinutes: h(WL_TYPED.maxEventHours),
    minRestMinutes: rest.limits!.minRestMinutes!,
    maxIdleGapMinutes: h(WL_TYPED.maxIdleGapHours),
    offDay,
    meal: meal.meal!,
    travel: travel.travel!,
    minors: minors.minors!,
  }
}
const PREVIEW = takeValues({ apply: true, minOffDays: Number(WL_TYPED.offDayMin), windowDays: Number(WL_TYPED.offDayWindow) })
const FINAL = takeValues({ apply: false })
const policyOf = (values: WorkloadPolicyValues) => activePolicy(buildPolicy(values, "Europe/Zurich"), event)

type Options = { barMealOnTheGo?: boolean; without?: string[]; extra?: string[] }
/** One person's missions as the evaluator reads them, after the take's « Repas sur le pouce » unless said. */
function dutyOf(person: string, { barMealOnTheGo = true, without = [], extra = [] }: Options = {}): DutyShift[] {
  const out: DutyShift[] = []
  for (const poste of WL_POSTES) {
    for (const s of poste.shifts) {
      const mine = (s.people as string[]).includes(person) || extra.includes(s.key)
      if (!mine || without.includes(s.key)) continue
      out.push({ id: wlShiftId(s.key), date: addDays(FRIDAY, s.day), startTime: s.start, endTime: s.end, mealOnTheGo: poste.roleName === "Bar Grande Scène" && barMealOnTheGo, placeId: poste.place, placeName: poste.place })
    }
  }
  return out
}
const people = Object.keys(WL_PEOPLE)
const rulesOf = (shifts: DutyShift[], values: WorkloadPolicyValues, personal?: Record<string, number>) =>
  evaluateWorkload(shifts, policyOf(values), personal ? { personal } : null).map((f) => f.rule)

describe("workload protection video fixture (scripts/seed-video-workload.ts)", () => {
  test("the event runs Friday to Sunday, at least two weeks ahead, whatever the take's day", () => {
    for (const today of ["2026-10-29", "2026-10-30", "2026-11-01", "2026-12-26"]) {
      const friday = fridayAfter(today, 14)
      expect(new Date(`${friday}T00:00:00Z`).getUTCDay()).toBe(5)
      const days = (Date.parse(friday) - Date.parse(today)) / 86_400_000
      expect(days).toBeGreaterThanOrEqual(14)
      expect(days).toBeLessThan(21)
    }
  })

  test("the values the take types and fills are accepted as the server checks them", () => {
    expect(checkPolicyValues(PREVIEW, WRITE_SECTIONS).ok).toBe(true)
    expect(checkPolicyValues(FINAL, WRITE_SECTIONS).ok).toBe(true)
  })

  test("without « Repas sur le pouce » on the bar, its evening missions would break the meal rule", () => {
    for (const person of ["aline", "nicolas", "sarah", "lucas"]) expect(rulesOf(dutyOf(person, { barMealOnTheGo: false }), FINAL)).toContain("meal")
  })

  test("the preview finds Noah alone, for the days without mission", () => {
    const flagged = people.filter((p) => rulesOf(dutyOf(p), PREVIEW).length > 0)
    expect(flagged).toEqual(["noah"])
    expect(rulesOf(dutyOf("noah"), PREVIEW)).toEqual(["offday"])
  })

  test("once the days-off rule is not applied, nobody breaks the limits: activation goes through", () => {
    for (const person of people) expect(rulesOf(dutyOf(person), FINAL), person).toEqual([])
  })

  test("Camille's own limit of 6 h per service day is kept by her programme", () => {
    expect(rulesOf(dutyOf("camille"), FINAL, { maxDailyMinutes: Number(WL_TYPED.personalDailyHours) * 60 })).toEqual([])
  })

  test("Emma's two Saturday shifts are refused for continuous work and the travel margin", () => {
    const emma = dutyOf(WL_NEWCOMER.key, { extra: ["chap-sat", "bar-sat"] })
    expect(emma.map((s) => s.id)).toEqual([wlShiftId("chap-sat"), wlShiftId("bar-sat")])
    expect(rulesOf(emma, FINAL).sort()).toEqual(["continuous", "travel"])
  })

  test("Sarah's withdrawal from « Accueil Chapiteau » leaves her two other Sunday rows over the longest wait", () => {
    const findings = evaluateWorkload(dutyOf("sarah", { without: ["chap-sun"] }), policyOf(FINAL))
    expect(findings.map((f) => f.rule)).toEqual(["idle"])
    expect([...findings[0].shiftIds].sort()).toEqual([wlShiftId("bar-sun"), wlShiftId("lac-sun-am")])
  })

  test("Sarah's page is opened through the registration she keeps", () => {
    const first = WL_POSTES.flatMap((p) => p.shifts).find((s) => (s.people as string[]).includes("sarah"))
    expect(first?.key).toBe("lac-sun-am")
    expect(recorder).toContain("const token = (key: string) => `demo-workload-${key}-0001`")
    expect(wlToken("sarah")).toBe("demo-workload-sarah-0001")
  })

  test("the recorder signs in, opens and types what the seed created", () => {
    expect(WORKLOAD_OWNER_EMAIL).toBe(WL_OWNER.email)
    expect(recorder).toContain(`const EVENT_ID = "${WL_EVENT.id}"`)
    expect(recorder).toContain(`const EVENT_SLUG = "${WL_EVENT.slug}"`)
    expect(recorder).toContain(`const EVENT_TITLE = "${WL_EVENT.title}"`)
    expect(`video.workload.${WL_NEWCOMER.key}@example.org`).toMatch(WL_PERSON_EMAIL)
  })

  test("people are cast members on example.org, never « Exemple », and never the demo organisation", () => {
    for (const key of Object.keys(WL_PEOPLE)) expect(`video.workload.${key}@example.org`).toMatch(WL_PERSON_EMAIL)
    expect(WL_OWNER.email).toMatch(WL_PERSON_EMAIL)
    expect(seed).not.toMatch(/Exemple/)
    expect(seed).toContain("surnameOf(firstName)")
    expect(seed).not.toMatch(/organizationId: "default"|id: "default"/)
    expect(seed).toContain('open: ["workloadProtection"]')
  })
})
