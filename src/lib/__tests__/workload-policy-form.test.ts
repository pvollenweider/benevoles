import { describe, it, expect } from "vitest"
import {
  benchmarkAnnouncement, checkPolicyForm, durationMinutes, emptyPolicyForm, offDayExample, policyFormFrom, policySummaryLines, policyValuesFromForm,
  mealDayOptions, shiftsWithoutPlaceText, withBenchmark, withMealWindow, withWarningSuggestions,
} from "../workload-policy-form"
import { WORKLOAD_BENCHMARKS, type WorkloadPolicyValues } from "../workload-policy"

// #1171: the organiser's form, hours and minutes, never a hidden default.
const VALUES: WorkloadPolicyValues = { serviceDayStart: "08:00", maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600, maxIdleGapMinutes: 120, offDay: { apply: false }, meal: { apply: false }, travel: { apply: false } }

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
    if (!r.ok) expect(r.problems).toHaveLength(10)
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

describe("meal (#1171, lot 2)", () => {
  const MEAL = { apply: true as const, minutes: 30, windows: [{ start: "11:30", end: "14:00" }, { start: "18:00", end: "21:00" }], days: ["2026-07-04"] }
  it("round-trips, keeps typed values under « do not apply », and sends them only with « apply »", () => {
    const form = policyFormFrom({ ...VALUES, meal: MEAL })
    expect(form.meal).toMatchObject({ apply: "yes", minutes: "30", days: "some", dates: ["2026-07-04"] })
    expect(form.meal.windows.map((w) => [w.start, w.end])).toEqual([["11:30", "14:00"], ["18:00", "21:00"]])
    expect(checkPolicyForm(form)).toEqual({ ok: true, values: { ...VALUES, meal: MEAL } })
    const no = { ...form, meal: { ...form.meal, apply: "no" as const } }
    expect(policyValuesFromForm(no).meal).toEqual({ apply: false })
    expect(no.meal.minutes).toBe("30")
    expect(policyFormFrom({ ...VALUES, meal: undefined }).meal.apply).toBe("")
  })

  it("adds up to three windows, never removes the last one, and keeps row keys stable", () => {
    const one = policyFormFrom(VALUES).meal
    const three = withMealWindow(withMealWindow(one, { add: true }), { add: true })
    expect(three.windows).toHaveLength(3)
    expect(withMealWindow(three, { add: true }).windows).toHaveLength(3)
    const removed = withMealWindow(three, { remove: 0 })
    expect(removed.windows.map((w) => w.key)).toEqual(three.windows.slice(1).map((w) => w.key))
    expect(withMealWindow(one, { remove: 0 }).windows).toHaveLength(1)
  })

  it("lists the event's days, says the rule in the summary, and the meal suggestion fills only the meal", () => {
    expect(mealDayOptions({ firstDay: "2026-07-04", lastDay: "2026-07-05" })).toEqual([{ date: "2026-07-04", label: "samedi 4 juillet" }, { date: "2026-07-05", label: "dimanche 5 juillet" }])
    expect(policySummaryLines(VALUES)).toContain("Aucune pause repas demandée.")
    expect(policySummaryLines({ ...VALUES, meal: { ...MEAL, days: "all" } })).toContain("Au moins 30 min de repas sans mission dans chaque plage qu'une mission touche (de 11 h 30 à 14 h, de 18 h à 21 h), tous les jours ; une mission où le repas sur le pouce est possible ne retire pas ce temps.")
    const b = WORKLOAD_BENCHMARKS.find((x) => x.id === "meal")!
    const filled = withBenchmark(emptyPolicyForm(), b)
    expect(filled.meal).toMatchObject({ apply: "yes", minutes: "30", days: "all" })
    expect(filled.maxDailyMinutes).toEqual({ hours: "", minutes: "" })
    expect(benchmarkAnnouncement(b)).toBe("Rempli : pause repas : règle appliquée, 30 min entre 11 h 30 et 14 h, puis entre 18 h et 21 h, tous les jours. Les autres champs n'ont pas changé.")
    expect(b.source).toContain("pas une règle du droit du travail")
  })
})

describe("travel (#1171, lot 2)", () => {
  it("round-trips, sends the margin only with « apply », and says the rule", () => {
    const form = policyFormFrom({ ...VALUES, travel: { apply: true, minutes: 15 } })
    expect(form.travel).toEqual({ apply: "yes", minutes: "15" })
    expect(checkPolicyForm(form)).toEqual({ ok: true, values: { ...VALUES, travel: { apply: true, minutes: 15 } } })
    expect(policyValuesFromForm({ ...form, travel: { apply: "no", minutes: "15" } }).travel).toEqual({ apply: false })
    expect(policySummaryLines(VALUES)).toContain("Aucune marge de trajet demandée entre deux lieux.")
    expect(policySummaryLines({ ...VALUES, travel: { apply: true, minutes: 15 } })).toContain("Au moins 15 min entre deux missions à des lieux différents, et jamais deux lieux à la fois ; le trajet d'une mission sans lieu n'est pas vérifié.")
    expect(policySummaryLines({ ...VALUES, travel: { apply: true, minutes: 0 } })[7]).toMatch(/^Jamais deux missions en même temps/)
  })

  it("says how many shifts have no place, in the singular too, nothing at 0, and when there is no place at all", () => {
    expect(shiftsWithoutPlaceText(12, 3)).toBe("12 créneaux n'ont pas de lieu : leur trajet n'est pas vérifié.")
    expect(shiftsWithoutPlaceText(1, 3)).toBe("1 créneau n'a pas de lieu : son trajet n'est pas vérifié.")
    expect(shiftsWithoutPlaceText(0, 3)).toBeNull()
    expect(shiftsWithoutPlaceText(5, 0)).toContain("aucun lieu")
  })

  it("the 15 min suggestion fills only the travel answer", () => {
    const b = WORKLOAD_BENCHMARKS.find((x) => x.id === "travel")!
    expect(withBenchmark(emptyPolicyForm(), b).travel).toEqual({ apply: "yes", minutes: "15" })
    expect(benchmarkAnnouncement(b)).toBe("Rempli : trajet entre deux lieux : règle appliquée, 15 min de marge. Les autres champs n'ont pas changé.")
  })
})
