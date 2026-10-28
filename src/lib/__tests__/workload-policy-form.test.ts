import { describe, it, expect } from "vitest"
import { checkPolicyForm, durationMinutes, emptyPolicyForm, policyFormFrom, policySummaryLines, policyValuesFromForm, withWarningSuggestions } from "../workload-policy-form"

// #1171: the organiser's form, hours and minutes, never a hidden default.
const VALUES = { serviceDayStart: "08:00", maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600, maxIdleGapMinutes: 120 }

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
    if (!r.ok) expect(r.problems).toHaveLength(7)
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
