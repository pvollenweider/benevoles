import { describe, it, expect } from "vitest"
import {
  benchmarkAnnouncement, checkPolicyForm, durationMinutes, emptyPolicyForm, offDayExample, policyFormFrom, policySummaryLines, policyValuesFromForm,
  withBenchmark, withWarningSuggestions,
} from "../workload-policy-form"
import { WORKLOAD_BENCHMARKS, type WorkloadPolicyValues } from "../workload-policy"

// #1171: the organiser's form, hours and minutes, never a hidden default.
const VALUES: WorkloadPolicyValues = { serviceDayStart: "08:00", maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600, maxIdleGapMinutes: 120, offDay: { apply: false } }

describe("durations", () => {
  it("reads hours and minutes, empty as missing, nonsense as invalid", () => {
    expect(durationMinutes({ hours: "6", minutes: "" })).toBe(360)
    expect(durationMinutes({ hours: "", minutes: "30" })).toBe(30)
    expect(durationMinutes({ hours: " 1 ", minutes: "05" })).toBe(65)
    expect(durationMinutes({ hours: "", minutes: "" })).toBeUndefined()
    expect(Number.isNaN(durationMinutes({ hours: "1,5", minutes: "" }))).toBe(true)
    expect(Number.isNaN(durationMinutes({ hours: "1", minutes: "75" }))).toBe(true)
  })

  it("round-trips stored values", () => {
    const form = policyFormFrom(VALUES)
    expect(form.maxEventMinutes).toEqual({ hours: "40", minutes: "0" })
    expect(checkPolicyForm(form)).toEqual({ ok: true, values: VALUES })
  })
})

describe("checkPolicyForm", () => {
  it("an empty form is incomplete, field by field", () => {
    const r = checkPolicyForm(emptyPolicyForm())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems).toHaveLength(8)
    if (!r.ok) expect(r.problems.map((p) => p.field)).toContain("offDay")
    expect(policyValuesFromForm(emptyPolicyForm()).maxDailyMinutes).toBeUndefined()
  })

  it("says what is wrong with a typed duration", () => {
    const form = { ...policyFormFrom(VALUES), maxIdleGapMinutes: { hours: "2", minutes: "90" } }
    const r = checkPolicyForm(form)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems).toEqual([{ field: "maxIdleGapMinutes", message: expect.stringContaining("minutes de 0 à 59") }])
  })

  it("fills only the three existing warning settings", () => {
    const form = withWarningSuggestions(emptyPolicyForm())
    expect(form.maxContinuousMinutes).toEqual({ hours: "6", minutes: "0" })
    expect(form.minBreakMinutes).toEqual({ hours: "0", minutes: "30" })
    expect(form.maxDailyMinutes).toEqual({ hours: "8", minutes: "0" })
    expect(form.minRestMinutes).toEqual({ hours: "", minutes: "" })
    expect(form.serviceDayStart).toBe("")
  })
})

describe("policySummaryLines", () => {
  it("says the rules in plain words", () => {
    const lines = policySummaryLines(VALUES)
    expect(lines[0]).toBe("Une journée de service commence à 8 h.")
    expect(lines[1]).toBe("Personne n'enchaîne plus de 6 h de missions sans une pause d'au moins 30 min.")
    expect(lines[2]).toBe("Au plus 10 h de missions par journée de service, et 40 h sur tout l'événement.")
    expect(lines).toContain("Une mission de « standby » compte comme du travail, jamais comme une pause.")
    expect(policySummaryLines({ ...VALUES, minRestMinutes: 0, maxIdleGapMinutes: 0 }).slice(3, 5)).toEqual([
      "Aucun repos minimum entre deux journées de service.",
      "Aucune attente entre deux missions d'une même journée de service : elles doivent se suivre.",
    ])
  })
})

describe("days without mission (#1171, lot 2)", () => {
  it("round-trips the three answers, keeps the numbers typed under « do not apply », and sends them only with « apply »", () => {
    const legacy = policyFormFrom({ ...VALUES, offDay: undefined })
    expect(legacy.offDay).toEqual({ apply: "", minOffDays: "", windowDays: "" })
    const r = checkPolicyForm(legacy)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems).toEqual([{ field: "offDay", message: expect.stringContaining("Rien n'est choisi à votre place") }])
    const yes = policyFormFrom({ ...VALUES, offDay: { apply: true, minOffDays: 1, windowDays: 6 } })
    expect(yes.offDay).toEqual({ apply: "yes", minOffDays: "1", windowDays: "6" })
    expect(checkPolicyForm(yes)).toEqual({ ok: true, values: { ...VALUES, offDay: { apply: true, minOffDays: 1, windowDays: 6 } } })
    const no = { ...yes, offDay: { ...yes.offDay, apply: "no" as const } }
    expect(no.offDay.windowDays).toBe("6")
    expect(policyValuesFromForm(no).offDay).toEqual({ apply: false })
    const bad = { ...yes, offDay: { apply: "yes" as const, minOffDays: "un", windowDays: "" } }
    const rb = checkPolicyForm(bad)
    expect(rb.ok).toBe(false)
    if (!rb.ok) expect(rb.problems.map((p) => p.field).sort()).toEqual(["offDayMinOffDays", "offDayWindowDays"])
  })

  it("says the rule in the summary, and says when none is asked", () => {
    expect(policySummaryLines(VALUES)).toContain("Aucun jour sans mission demandé.")
    expect(policySummaryLines({ ...VALUES, offDay: { apply: true, minOffDays: 1, windowDays: 6 } })).toContain("Au moins 1 jour sans mission sur toute période de 6 journées de service d'affilée.")
  })

  it("warns when the period is longer than the event, from its dates", () => {
    const form = { ...policyFormFrom(VALUES), offDay: { apply: "yes" as const, minOffDays: "1", windowDays: "7" } }
    const festival = { firstDay: "2026-07-01", lastDay: "2026-07-06" }
    expect(offDayExample(form, festival)).toBe("Selon les dates de l'événement au chargement de la page, il compte 6 journées de service (du mercredi 1 juillet au lundi 6 juillet) : une période de 7 journées n'y tient jamais, la règle ne vérifierait rien. Choisissez 6 journées ou moins pour demander des jours sans mission.")
    expect(offDayExample({ ...form, offDay: { ...form.offDay, windowDays: "6" } }, festival)).toContain("chaque période de 6 journées d'affilée y est vérifiée")
    expect(offDayExample({ ...form, offDay: { ...form.offDay, apply: "no" } }, festival)).toBeNull()
  })
})

describe("benchmarks", () => {
  it("each fills only its own fields and says what it filled", () => {
    const byId = Object.fromEntries(WORKLOAD_BENCHMARKS.map((b) => [b.id, b]))
    const daily = withBenchmark(emptyPolicyForm(), byId.daily)
    expect(daily.maxDailyMinutes).toEqual({ hours: "10", minutes: "0" })
    expect(daily.maxContinuousMinutes).toEqual({ hours: "", minutes: "" })
    expect(daily.offDay.apply).toBe("")
    const brk = withBenchmark(emptyPolicyForm(), byId.break)
    expect([brk.maxContinuousMinutes, brk.minBreakMinutes]).toEqual([{ hours: "6", minutes: "0" }, { hours: "0", minutes: "20" }])
    expect(withBenchmark(emptyPolicyForm(), byId.rest).minRestMinutes).toEqual({ hours: "11", minutes: "0" })
    expect(withBenchmark(emptyPolicyForm(), byId.offDay).offDay).toEqual({ apply: "yes", minOffDays: "1", windowDays: "7" })
    expect(benchmarkAnnouncement(byId.daily)).toBe("Rempli : durée maximale de missions par journée de service 10 h. Les autres champs n'ont pas changé.")
    // Every benchmark names its source and never calls itself an obligation.
    for (const b of WORKLOAD_BENCHMARKS) {
      expect(b.source.length).toBeGreaterThan(10)
      expect(`${b.text} ${b.source}`).not.toMatch(/obligatoire|légal pour/i)
    }
  })
})
