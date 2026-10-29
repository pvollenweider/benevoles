import { describe, it, expect } from "vitest"
import {
  activePolicy, buildPolicy, checkPolicyValues, evaluateWorkload, findingOnlyAbout, newFindings, parseWorkloadPolicy, policyChangeNeedsScan,
  serviceDayExamples, serviceDayOf, workloadChange, workloadFindingMessage, type ActivePolicy, type DutyShift, type WorkloadPolicyValues,
} from "../workload-policy"

// #1171 lot 1. The values below illustrate the rules; they are not proposed defaults.
const VALUES: WorkloadPolicyValues = {
  serviceDayStart: "08:00",
  maxContinuousMinutes: 6 * 60,
  minBreakMinutes: 30,
  maxDailyMinutes: 10 * 60,
  maxEventMinutes: 40 * 60,
  minRestMinutes: 10 * 60,
  maxIdleGapMinutes: 2 * 60,
}
const TZ = "Europe/Zurich"
const HORIZON = { startDate: "2026-01-01", endDate: "2026-12-31" }
const POLICY: ActivePolicy = activePolicy(buildPolicy(VALUES, TZ), HORIZON)
const policy = (over: Partial<ActivePolicy> = {}): ActivePolicy => ({ ...POLICY, ...over })

let n = 0
const s = (date: string, startTime: string, endTime: string, id = `s${++n}`): DutyShift => ({ id, date, startTime, endTime })
const rules = (shifts: DutyShift[], p = POLICY) => evaluateWorkload(shifts, p).map((f) => f.rule)

describe("evaluateWorkload: the four pilot patterns", () => {
  it("a 14h-20h mission then a night task at 01h00 leaves a 5 h wait inside the same service day", () => {
    const day = s("2026-07-04", "14:00", "20:00")
    const night = s("2026-07-05", "01:00", "03:00")
    const findings = evaluateWorkload([day, night], POLICY)
    expect(findings).toEqual([expect.objectContaining({ rule: "idle", serviceDay: "2026-07-04", minutes: 300, limit: 120, shiftIds: [day.id, night.id] })])
    expect(workloadFindingMessage(findings[0], POLICY)).toBe("Journée de service du samedi 4 juillet : ces deux missions laissent 5 h entre elles, de 20 h à 1 h. La limite de cet événement est de 2 h.")
  })

  it("an evening chained into a night task with only a short break is continuous duty", () => {
    const evening = s("2026-07-04", "20:00", "02:00")
    const night = s("2026-07-05", "02:15", "05:00")
    const findings = evaluateWorkload([evening, night], POLICY)
    expect(findings).toEqual([expect.objectContaining({ rule: "continuous", serviceDay: "2026-07-04", minutes: 540, limit: 360 })])
    expect(workloadFindingMessage(findings[0], POLICY)).toBe("Journée de service du samedi 4 juillet : 9 h de missions d'affilée, de 20 h à 5 h, sans vraie pause. La limite de cet événement est de 6 h.")
  })

  it("a night task then the next morning's 08h slot is checked as rest between two service days", () => {
    const night = s("2026-07-05", "01:00", "03:00")
    const morning = s("2026-07-05", "08:00", "14:00")
    const findings = evaluateWorkload([night, morning], POLICY)
    expect(findings).toEqual([expect.objectContaining({ rule: "rest", serviceDay: "2026-07-04", minutes: 300, limit: 600 })])
    expect(workloadFindingMessage(findings[0], POLICY)).toContain("seulement 5 h de repos")
  })

  it("parallel duty counts once", () => {
    // 10-14 and 12-16 (a cumulable poste): 6 h of duty, not 8, and no continuous finding at the limit.
    expect(evaluateWorkload([s("2026-07-04", "10:00", "14:00"), s("2026-07-04", "12:00", "16:00")], POLICY)).toEqual([])
    expect(rules([s("2026-07-04", "10:00", "14:00"), s("2026-07-04", "12:00", "16:00")], policy({ maxDailyMinutes: 300, maxContinuousMinutes: 300 })))
      .toEqual(["continuous", "daily"])
  })
})

describe("evaluateWorkload: time", () => {
  it("a night shift crossing midnight is one block of its service day", () => {
    const f = evaluateWorkload([s("2026-07-04", "22:00", "06:00")], policy({ maxContinuousMinutes: 420, maxDailyMinutes: 420 }))
    expect(f.map((x) => [x.rule, x.serviceDay, x.minutes])).toEqual([["continuous", "2026-07-04", 480], ["daily", "2026-07-04", 480]])
  })

  it("measures real time across daylight saving changes", () => {
    // 28-29 March 2026: the clocks jump from 02:00 to 03:00, the night lasts 7 h.
    expect(evaluateWorkload([s("2026-03-28", "22:00", "06:00")], policy({ maxContinuousMinutes: 420, maxDailyMinutes: 420 }))).toEqual([])
    expect(evaluateWorkload([s("2026-03-28", "22:00", "06:00")], policy({ maxContinuousMinutes: 400, maxDailyMinutes: 420 }))[0]).toMatchObject({ rule: "continuous", minutes: 420 })
    // 24-25 October 2026: back from 03:00 to 02:00, the night lasts 9 h.
    expect(evaluateWorkload([s("2026-10-24", "22:00", "06:00")], policy({ maxContinuousMinutes: 540, maxDailyMinutes: 540 }))).toEqual([])
    expect(evaluateWorkload([s("2026-10-24", "22:00", "06:00")], policy({ maxContinuousMinutes: 500, maxDailyMinutes: 540 }))[0]).toMatchObject({ rule: "continuous", minutes: 540 })
  })

  it("never cuts a gap at midnight: the wait from 22h to 1h is 3 h", () => {
    const f = evaluateWorkload([s("2026-07-04", "18:00", "22:00"), s("2026-07-05", "01:00", "02:00")], POLICY)
    expect(f).toEqual([expect.objectContaining({ rule: "idle", minutes: 180 })])
  })

  it("the boundary decides between waiting and rest", () => {
    const day = s("2026-07-04", "14:00", "20:00"), night = s("2026-07-05", "01:00", "03:00")
    expect(rules([day, night], policy({ serviceDayStart: "08:00" }))).toEqual(["idle"])
    // With service days starting at midnight, the same gap is the rest before the next day.
    expect(rules([day, night], policy({ serviceDayStart: "00:00" }))).toEqual(["rest"])
  })

  it("a mission ending exactly at the boundary closes the day before", () => {
    const p = policy({ serviceDayStart: "08:00" })
    const night = s("2026-07-05", "02:00", "08:00")
    expect(serviceDayOf(Date.parse("2026-07-05T06:00:00Z"), p)).toBe("2026-07-05") // 08:00 local starts the next day
    // Rest from 08:00 to 12:00 between the night (day of the 4th) and the 12:00 mission (day of the 5th).
    expect(evaluateWorkload([night, s("2026-07-05", "12:00", "14:00")], p)).toEqual([expect.objectContaining({ rule: "rest", serviceDay: "2026-07-04", minutes: 240 })])
  })

  it("splits the daily total of a block at the boundary", () => {
    // 06:00-10:00 with an 08:00 boundary: 2 h in each service day.
    const p = policy({ maxDailyMinutes: 119, maxContinuousMinutes: 300 })
    const f = evaluateWorkload([s("2026-07-05", "06:00", "10:00")], p)
    expect(f.map((x) => [x.rule, x.serviceDay, x.minutes])).toEqual([["daily", "2026-07-04", 120], ["daily", "2026-07-05", 120]])
  })

  it("a block spanning several service days counts in each", () => {
    const p = policy({ maxContinuousMinutes: 24 * 60, maxDailyMinutes: 12 * 60, maxEventMinutes: 48 * 60 })
    const chain = [s("2026-07-04", "20:00", "08:00"), s("2026-07-05", "08:00", "20:00"), s("2026-07-05", "20:00", "08:00")]
    // 12 h in the service day of the 4th (20:00-08:00), the whole 24 h of the 5th: one daily finding.
    const f = evaluateWorkload(chain, p)
    expect(f.map((x) => [x.rule, x.serviceDay, x.minutes])).toEqual([["continuous", "2026-07-04", 36 * 60], ["daily", "2026-07-05", 24 * 60]])
    // The short gap counts in the continuous run, never in the daily total.
    const gapped = evaluateWorkload([s("2026-07-04", "08:00", "12:00"), s("2026-07-04", "12:20", "16:00")], policy({ maxContinuousMinutes: 480 }))
    expect(gapped).toEqual([])
    expect(evaluateWorkload([s("2026-07-04", "08:00", "12:00"), s("2026-07-04", "12:20", "16:00")], policy({ maxContinuousMinutes: 479, maxDailyMinutes: 480 })))
      .toEqual([expect.objectContaining({ rule: "continuous", minutes: 480 })])
  })

  it("a gap equal to the limits passes", () => {
    expect(evaluateWorkload([s("2026-07-04", "08:00", "10:00"), s("2026-07-04", "12:00", "14:00")], POLICY)).toEqual([]) // idle = 2 h
    expect(evaluateWorkload([s("2026-07-04", "16:00", "22:00"), s("2026-07-05", "08:00", "12:00")], POLICY)).toEqual([]) // rest = 10 h
    // A break of exactly the minimum ends continuous duty: 4 h + 30 min + 4 h is not 8 h 30 d'affilée.
    expect(evaluateWorkload([s("2026-07-04", "08:00", "12:00"), s("2026-07-04", "12:30", "16:30")], POLICY)).toEqual([])
  })

  it("counts an explicit standby as work, never as a break", () => {
    const standby = s("2026-07-04", "14:00", "18:00")
    const mission = s("2026-07-04", "18:00", "21:00")
    expect(evaluateWorkload([standby, mission], POLICY)).toEqual([expect.objectContaining({ rule: "continuous", minutes: 420 })])
    // Without the standby, the same afternoon is a 3 h mission and nothing to report.
    expect(evaluateWorkload([mission], POLICY)).toEqual([])
  })

  it("caps the whole event", () => {
    const days = ["2026-07-04", "2026-07-05", "2026-07-06", "2026-07-07"].map((d) => s(d, "09:00", "15:00"))
    expect(rules(days, policy({ maxEventMinutes: 23 * 60 }))).toEqual(["event"])
    expect(workloadFindingMessage(evaluateWorkload(days, policy({ maxEventMinutes: 23 * 60 }))[0], POLICY)).toBe("Sur tout l'événement : 24 h de missions. La limite de cet événement est de 23 h.")
  })
})

describe("newFindings and workloadChange", () => {
  it("lets a finding already there through, and refuses a new or worsened one", () => {
    const morning = s("2026-07-04", "08:00", "10:00"), evening = s("2026-07-04", "16:00", "18:00")
    const before = [morning, evening] // 6 h wait, left by a cancellation
    // An unrelated addition on another day: the old finding stays as it was, nothing new.
    expect(workloadChange(before, [...before, s("2026-07-06", "10:00", "12:00")], POLICY)).toEqual([])
    // Filling the gap removes the finding: welcome.
    expect(workloadChange(before, [...before, s("2026-07-04", "10:00", "16:00")], policy({ maxContinuousMinutes: 600 }))).toEqual([])
    // Half filling it leaves a 4 h wait: a new finding.
    expect(workloadChange(before, [...before, s("2026-07-04", "10:00", "12:00")], POLICY)).toEqual([expect.objectContaining({ rule: "idle", minutes: 240 })])
  })

  it("compares exact findings", () => {
    const a = evaluateWorkload([s("2026-07-04", "08:00", "20:00")], POLICY)
    expect(newFindings(a, a)).toEqual([])
    expect(newFindings([], a).length).toBe(a.length)
  })

  it("tells a finding about the submission alone apart", () => {
    const own = s("2026-07-04", "08:00", "16:00", "own")
    const held = s("2026-07-04", "16:00", "20:00", "held")
    const [f] = evaluateWorkload([own, held], POLICY)
    expect(findingOnlyAbout(f, new Set(["own"]))).toBe(false)
  })
})

describe("policy values", () => {
  it("requires every value: empty is incomplete, never no limit", () => {
    const r = checkPolicyValues({ ...VALUES, minRestMinutes: undefined, serviceDayStart: "" })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.problems.map((p) => p.field).sort()).toEqual(["minRestMinutes", "serviceDayStart"])
      expect(r.problems.find((p) => p.field === "minRestMinutes")!.message).toContain("ne veut pas dire « sans limite »")
    }
  })

  it("refuses values out of range, not whole, or inconsistent", () => {
    expect(checkPolicyValues({ ...VALUES, minBreakMinutes: 2 }).ok).toBe(false)
    expect(checkPolicyValues({ ...VALUES, maxDailyMinutes: 61.5 }).ok).toBe(false)
    expect(checkPolicyValues({ ...VALUES, maxDailyMinutes: "600" }).ok).toBe(false)
    expect(checkPolicyValues({ ...VALUES, serviceDayStart: "8:00" }).ok).toBe(false)
    expect(checkPolicyValues({ ...VALUES, serviceDayStart: "24:00" }).ok).toBe(false)
    expect(checkPolicyValues({ ...VALUES, maxContinuousMinutes: 700 }).ok).toBe(false) // above the daily cap
    expect(checkPolicyValues({ ...VALUES, maxEventMinutes: 500 }).ok).toBe(false) // below the daily cap
    expect(checkPolicyValues(VALUES).ok).toBe(true)
  })

  it("reads a stored policy strictly", () => {
    const stored = buildPolicy(VALUES, TZ)
    expect(parseWorkloadPolicy(stored)).toEqual({ ok: true, policy: stored })
    // Version 2 needs the days-off answer; version 1 must not have one.
    expect(parseWorkloadPolicy({ ...stored, version: 2 }).ok).toBe(false)
    expect(parseWorkloadPolicy({ ...stored, offDay: { apply: false } }).ok).toBe(false)
    expect(parseWorkloadPolicy({ ...stored, version: 3 }).ok).toBe(false)
    expect(parseWorkloadPolicy({ ...stored, timeZone: "Mars/Olympus" }).ok).toBe(false)
    expect(parseWorkloadPolicy({ ...stored, mealMinutes: 30 }).ok).toBe(false)
    // The horizon is never stored: an evaluated policy is not a stored one.
    expect(parseWorkloadPolicy(POLICY).ok).toBe(false)
    expect(parseWorkloadPolicy(null).ok).toBe(false)
    expect(parseWorkloadPolicy({ version: 1, timeZone: TZ }).ok).toBe(false)
  })

  it("scans again for anything stricter or a new boundary, not for a loosening", () => {
    expect(policyChangeNeedsScan(null, POLICY)).toBe(true)
    expect(policyChangeNeedsScan(POLICY, POLICY)).toBe(false)
    expect(policyChangeNeedsScan(POLICY, policy({ maxDailyMinutes: 660, minRestMinutes: 540 }))).toBe(false)
    expect(policyChangeNeedsScan(POLICY, policy({ maxIdleGapMinutes: 60 }))).toBe(true)
    expect(policyChangeNeedsScan(POLICY, policy({ minBreakMinutes: 45 }))).toBe(true)
    expect(policyChangeNeedsScan(POLICY, policy({ serviceDayStart: "06:00" }))).toBe(true)
    expect(policyChangeNeedsScan(POLICY, policy({ timeZone: "Europe/Paris" }))).toBe(true)
  })

  it("explains the boundary with examples", () => {
    expect(serviceDayExamples("08:00")[0]).toBe("Une journée de service va de 8 h à 8 h le lendemain.")
    expect(serviceDayExamples("08:00")[1]).toContain("commence à 1 h compte dans la journée de service de la veille")
    expect(serviceDayExamples("00:00")).toHaveLength(2)
    expect(serviceDayExamples("bad")).toEqual([])
  })
})

// ── #1171 lot 2: days without mission ───────────────────────────────────────

describe("policy version 2: the days-off answer", () => {
  const ONE_IN_SIX = { apply: true as const, minOffDays: 1, windowDays: 6 }

  it("writes version 2 with an answer, keeps version 1 without one, and reads both", () => {
    const v2 = buildPolicy({ ...VALUES, offDay: ONE_IN_SIX }, TZ)
    expect(v2.version).toBe(2)
    expect(parseWorkloadPolicy(v2)).toEqual({ ok: true, policy: v2 })
    const no = buildPolicy({ ...VALUES, offDay: { apply: false } }, TZ)
    expect(parseWorkloadPolicy(no)).toEqual({ ok: true, policy: no })
    const v1 = buildPolicy(VALUES, TZ)
    expect(v1.version).toBe(1)
    expect("offDay" in v1).toBe(false)
    expect(parseWorkloadPolicy(v1).ok).toBe(true)
  })

  it("requires the answer on every write, never a blank read as « no rule »", () => {
    const missing = checkPolicyValues(VALUES, { requireOffDay: true })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.problems).toEqual([{ field: "offDay", message: expect.stringContaining("choisissez d'appliquer ou non") }])
    expect(checkPolicyValues({ ...VALUES, offDay: { apply: false } }, { requireOffDay: true }).ok).toBe(true)
    expect(checkPolicyValues({ ...VALUES, offDay: ONE_IN_SIX }, { requireOffDay: true }).ok).toBe(true)
  })

  it("refuses incomplete, out-of-range or impossible numbers", () => {
    const fields = (offDay: unknown) => { const r = checkPolicyValues({ ...VALUES, offDay }, { requireOffDay: true }); return r.ok ? [] : r.problems.map((p) => p.field) }
    expect(fields({ apply: true })).toEqual(["offDayWindowDays", "offDayMinOffDays"])
    expect(fields({ apply: true, minOffDays: 1, windowDays: 1 })).toEqual(["offDayWindowDays"])
    expect(fields({ apply: true, minOffDays: 1, windowDays: 32 })).toEqual(["offDayWindowDays"])
    expect(fields({ apply: true, minOffDays: 0, windowDays: 7 })).toEqual(["offDayMinOffDays"])
    expect(fields({ apply: true, minOffDays: 7, windowDays: 7 })).toEqual(["offDayMinOffDays"])
    expect(fields({ apply: true, minOffDays: 1.5, windowDays: 7 })).toEqual(["offDayMinOffDays"])
    expect(fields({ apply: "yes" })).toEqual(["offDay"])
    expect(fields({ apply: false, windowDays: 7 })).toEqual(["offDay"])
    expect(fields({ apply: true, minOffDays: 1, windowDays: 7, extra: 1 })).toEqual(["offDay"])
  })

  it("scans again when the rule gets stricter, not when it is looser or not applied", () => {
    const base = activePolicy(buildPolicy({ ...VALUES, offDay: { apply: true, minOffDays: 1, windowDays: 7 } }, TZ), HORIZON)
    const with_ = (offDay: ActivePolicy["offDay"]) => ({ ...base, offDay })
    expect(policyChangeNeedsScan(POLICY, base)).toBe(true) // a version-1 policy getting the rule
    expect(policyChangeNeedsScan(base, base)).toBe(false)
    expect(policyChangeNeedsScan(base, with_({ apply: false }))).toBe(false)
    expect(policyChangeNeedsScan(POLICY, with_({ apply: false }))).toBe(false)
    expect(policyChangeNeedsScan(base, with_({ apply: true, minOffDays: 1, windowDays: 8 }))).toBe(false)
    expect(policyChangeNeedsScan(base, with_({ apply: true, minOffDays: 1, windowDays: 6 }))).toBe(true)
    expect(policyChangeNeedsScan(base, with_({ apply: true, minOffDays: 2, windowDays: 7 }))).toBe(true)
    expect(policyChangeNeedsScan(with_({ apply: false }), base)).toBe(true)
  })
})

describe("evaluateWorkload: days without mission", () => {
  // The pilot: 6 festival days, one main mission a day. 08:00 boundary.
  const festival = { startDate: "2026-07-01", endDate: "2026-07-06" }
  const rule = (minOffDays: number, windowDays: number, dates = festival) =>
    activePolicy(buildPolicy({ ...VALUES, maxEventMinutes: 100 * 60, offDay: { apply: true, minOffDays, windowDays } }, TZ), dates)
  const days = (from: number, to: number, start = "14:00", end = "20:00") =>
    Array.from({ length: to - from + 1 }, (_, i) => s(`2026-07-${String(from + i).padStart(2, "0")}`, start, end, `d${from + i}`))
  const offday = (shifts: DutyShift[], p: ActivePolicy) => evaluateWorkload(shifts, p).filter((f) => f.rule === "offday")

  it("1 in 6 over a 6-day festival: every day worked is caught, one day off passes", () => {
    const all = offday(days(1, 6), rule(1, 6))
    expect(all).toEqual([expect.objectContaining({ rule: "offday", serviceDay: "2026-07-01", minutes: 0, limit: 1 })])
    expect(workloadFindingMessage(all[0], rule(1, 6))).toBe("Du mercredi 1 juillet au lundi 6 juillet : 6 journées de service d'affilée, toutes avec une mission. Cet événement demande au moins 1 jour sans mission sur 6 journées de service.")
    expect(offday([...days(1, 3), ...days(5, 6)], rule(1, 6))).toEqual([])
  })

  it("1 in 7 over a 6-day festival checks nothing: no complete period fits", () => {
    expect(offday(days(1, 6), rule(1, 7))).toEqual([])
  })

  it("periods that fail and overlap are one finding, from first to last day", () => {
    const tenDays = { startDate: "2026-07-01", endDate: "2026-07-10" }
    const f = offday(days(1, 8), rule(1, 7, tenDays))
    expect(f).toHaveLength(1)
    expect(f[0]).toEqual(expect.objectContaining({ serviceDay: "2026-07-01", minutes: 0 }))
    expect(workloadFindingMessage(f[0], rule(1, 7, tenDays))).toMatch(/^Du mercredi 1 juillet au mercredi 8 juillet : 8 journées de service d'affilée/)
  })

  it("counts empty days of the event as days off, and says how many were found when some", () => {
    const p = rule(2, 7, { startDate: "2026-07-01", endDate: "2026-07-07" })
    const f = offday([...days(1, 3), ...days(5, 7)], p)
    expect(f).toEqual([expect.objectContaining({ minutes: 1, limit: 2 })])
    expect(workloadFindingMessage(f[0], p)).toContain(": seulement 1 jour sans mission sur 7 journées de service d'affilée. Cet événement demande au moins 2 jours sans mission sur 7 journées de service.")
  })

  it("a night task and a standby make the day worked; a mission ending at the boundary does not work the next day", () => {
    const p = rule(1, 3, { startDate: "2026-07-01", endDate: "2026-07-03" })
    // Day 1 evening, a night task at 01h on the 3rd (service day of the 2nd), a standby on the 3rd.
    const shifts = [s("2026-07-01", "18:00", "22:00"), s("2026-07-03", "01:00", "03:00"), s("2026-07-03", "10:00", "12:00")]
    expect(offday(shifts, p)).toHaveLength(1)
    // 2nd: only a mission from 02:00 to 08:00 on the 3rd belongs to the 2nd; nothing touches the 3rd.
    expect(offday([s("2026-07-01", "18:00", "22:00"), s("2026-07-03", "02:00", "08:00")], p)).toEqual([])
    // A night 22:00-10:00 crosses the boundary: it works both service days.
    expect(offday([s("2026-07-01", "18:00", "22:00"), s("2026-07-02", "22:00", "10:00")], p)).toHaveLength(1)
  })

  it("is not applied when the answer is « do not apply » or missing (version 1)", () => {
    const no = activePolicy(buildPolicy({ ...VALUES, maxEventMinutes: 100 * 60, offDay: { apply: false } }, TZ), festival)
    expect(offday(days(1, 6), no)).toEqual([])
    expect(offday(days(1, 6), { ...POLICY, maxEventMinutes: 100 * 60 })).toEqual([])
  })

  it("only a change that creates or extends a run of worked days is new", () => {
    const p = rule(1, 6)
    expect(workloadChange(days(1, 5), days(1, 6), p).map((f) => f.rule)).toEqual(["offday"])
    expect(workloadChange([...days(1, 3), ...days(5, 6)], [...days(1, 3), ...days(5, 6), s("2026-07-05", "15:00", "16:00")], p)).toEqual([])
  })
})

// ── #1171 lot 2: meals ──────────────────────────────────────────────────────

describe("policy version 3: the meal answer", () => {
  const MEAL = { apply: true as const, minutes: 30, windows: [{ start: "11:30", end: "14:00" }, { start: "18:00", end: "21:00" }], days: "all" as const }
  const OFF = { apply: false as const }

  it("writes version 3 with both answers, reads 1, 2 and 3, and requires the meal answer on writes", () => {
    const v3 = buildPolicy({ ...VALUES, offDay: OFF, meal: MEAL }, TZ)
    expect(v3.version).toBe(3)
    expect(parseWorkloadPolicy(v3)).toEqual({ ok: true, policy: v3 })
    expect(parseWorkloadPolicy({ ...v3, version: 2 }).ok).toBe(false) // a version-2 policy has no meal
    const { meal: _m, ...noMeal } = v3
    void _m
    expect(parseWorkloadPolicy(noMeal).ok).toBe(false) // version 3 needs it
    const r = checkPolicyValues({ ...VALUES, offDay: OFF }, { requireOffDay: true, requireMeal: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems).toEqual([{ field: "meal", message: expect.stringContaining("Rien n'est choisi à votre place") }])
  })

  it("refuses incomplete or impossible windows", () => {
    const fields = (meal: unknown, start = "08:00") => { const r = checkPolicyValues({ ...VALUES, serviceDayStart: start, offDay: OFF, meal }, { requireOffDay: true, requireMeal: true }); return r.ok ? [] : r.problems.map((p) => p.field) }
    expect(fields(MEAL)).toEqual([])
    expect(fields({ apply: true })).toEqual(["mealMinutes", "mealWindows", "mealDays"])
    expect(fields({ ...MEAL, minutes: 5 })).toEqual(["mealMinutes"])
    expect(fields({ ...MEAL, windows: [] })).toEqual(["mealWindows"])
    expect(fields({ ...MEAL, windows: [{ start: "11:30" }] })).toEqual(["mealWindow0"])
    expect(fields({ ...MEAL, windows: [{ start: "11:30", end: "11:50" }] })).toEqual(["mealWindow0"]) // shorter than the meal
    // Overlap: on the later row, naming the other one.
    const overlap = checkPolicyValues({ ...VALUES, offDay: OFF, meal: { ...MEAL, windows: [{ start: "11:30", end: "14:00" }, { start: "13:00", end: "15:00" }] } }, { requireOffDay: true, requireMeal: true })
    expect(overlap.ok ? [] : overlap.problems).toEqual([{ field: "mealWindow1", message: "La plage 2 chevauche la plage 1." }])
    expect(fields(MEAL, "12:00")).toEqual(["mealWindow0"]) // 11:30-14:00 crosses a 12:00 service-day start
    expect(fields({ ...MEAL, windows: [{ start: "23:30", end: "01:00" }] }, "08:00")).toEqual([]) // midnight inside one service day
    expect(fields({ ...MEAL, days: [] })).toEqual(["mealDays"])
    expect(fields({ ...MEAL, days: ["2026-07-04", "2026-07-04"] })).toEqual(["mealDays"])
    expect(fields({ apply: false, minutes: 30 })).toEqual(["meal"])
  })

  it("scans again on any change of an applied meal rule, turning it off included", () => {
    const withMeal = activePolicy(buildPolicy({ ...VALUES, offDay: OFF, meal: MEAL }, TZ), HORIZON)
    const noMeal = { ...withMeal, meal: { apply: false as const } }
    expect(policyChangeNeedsScan(withMeal, withMeal)).toBe(false)
    expect(policyChangeNeedsScan(withMeal, noMeal)).toBe(true)
    expect(policyChangeNeedsScan(noMeal, withMeal)).toBe(true)
    expect(policyChangeNeedsScan(noMeal, { ...noMeal })).toBe(false)
    expect(policyChangeNeedsScan(withMeal, { ...withMeal, meal: { ...MEAL, minutes: 20 } })).toBe(true)
  })
})

describe("evaluateWorkload: meals", () => {
  const MEAL = { apply: true as const, minutes: 30, windows: [{ start: "11:30", end: "14:00" }, { start: "18:00", end: "21:00" }], days: "all" as const }
  const meal = (over: Partial<WorkloadPolicyValues> = {}, rule: typeof MEAL | { apply: true; minutes: number; windows: { start: string; end: string }[]; days: "all" | string[] } = MEAL) =>
    activePolicy(buildPolicy({ ...VALUES, maxContinuousMinutes: 10 * 60, maxDailyMinutes: 14 * 60, maxEventMinutes: 100 * 60, offDay: { apply: false }, meal: rule, ...over }, TZ), HORIZON)
  const m = (date: string, start: string, end: string, onTheGo = false, id = `m${++n}`): DutyShift => ({ id, date, startTime: start, endTime: end, mealOnTheGo: onTheGo })
  const of = (shifts: DutyShift[], p = meal()) => evaluateWorkload(shifts, p).filter((f) => f.rule === "meal")

  it("a mission covering the whole lunch window leaves no meal, with a specific message", () => {
    const f = of([m("2026-07-04", "10:00", "15:00")])
    expect(f).toEqual([expect.objectContaining({ rule: "meal", serviceDay: "2026-07-04", minutes: 0, limit: 30 })])
    expect(workloadFindingMessage(f[0], meal())).toBe("Journée de service du samedi 4 juillet : pas de pause repas de 30 min entre 11 h 30 et 14 h (aucun moment sans mission dans cette plage). Cet événement demande 30 min de repas dans cette plage, ou une mission où le repas sur le pouce est possible.")
  })

  it("free time before or after the mission inside the window holds the meal; touching an end does not trigger", () => {
    expect(of([m("2026-07-04", "08:00", "12:00")])).toEqual([]) // 12:00-14:00 free
    expect(of([m("2026-07-04", "12:00", "13:00")])).toEqual([]) // 11:30-12:00 free: exactly 30 min
    expect(of([m("2026-07-04", "08:00", "11:30"), m("2026-07-04", "14:00", "18:00")])).toEqual([]) // touches both ends only
    const short = of([m("2026-07-04", "08:00", "11:45"), m("2026-07-04", "12:00", "14:00")])
    expect(short).toEqual([expect.objectContaining({ minutes: 15 })]) // 11:45-12:00 is only 15 min
  })

  it("a mission marked « repas sur le pouce possible » holds the meal but stays work", () => {
    const flagged = [m("2026-07-04", "10:00", "15:00", true)]
    expect(of(flagged)).toEqual([])
    // Still 5 h of work: a 4 h daily cap catches it.
    expect(evaluateWorkload(flagged, meal({ maxDailyMinutes: 4 * 60, maxContinuousMinutes: 4 * 60 })).map((f) => f.rule)).toEqual(["continuous", "daily"])
    // An unflagged mission at the same time takes the time back.
    expect(of([...flagged, m("2026-07-04", "11:00", "14:30")])).toEqual([expect.objectContaining({ minutes: 0 })])
  })

  it("applies only on the chosen days, and checks every window the duty touches", () => {
    const some = meal({}, { ...MEAL, days: ["2026-07-05"] })
    expect(of([m("2026-07-04", "10:00", "15:00")], some)).toEqual([])
    expect(of([m("2026-07-05", "10:00", "15:00")], some)).toHaveLength(1)
    expect(of([m("2026-07-04", "10:00", "22:00")]).map((f) => f.start)).toHaveLength(2)
  })

  it("a night window past midnight belongs to the service day it sits in", () => {
    const night = meal({}, { ...MEAL, windows: [{ start: "23:30", end: "01:00" }] })
    const f = of([m("2026-07-04", "22:00", "02:00")], night)
    expect(f).toEqual([expect.objectContaining({ serviceDay: "2026-07-04" })])
  })

  it("a wait that holds the meal may be longer by the meal's length, once per window", () => {
    // 2 h idle limit. 09-11:30 then 14:00-16: a 2 h 30 gap holding lunch is fine.
    const lunch = [m("2026-07-04", "09:00", "11:30"), m("2026-07-04", "14:00", "16:00")]
    expect(evaluateWorkload(lunch, meal()).filter((f) => f.rule === "idle")).toEqual([])
    // Without the meal rule the same gap breaks the 2 h limit.
    expect(evaluateWorkload(lunch, activePolicy(buildPolicy({ ...VALUES, maxEventMinutes: 100 * 60 }, TZ), HORIZON)).map((f) => f.rule)).toEqual(["idle"])
    // 2 h 31 is over 2 h + 30 min: refused, and the message says the meal was counted.
    const longer = evaluateWorkload([m("2026-07-04", "09:00", "11:29"), m("2026-07-04", "14:00", "16:00")], meal()).filter((f) => f.rule === "idle")
    expect(longer).toEqual([expect.objectContaining({ minutes: 151, limit: 150 })])
    expect(workloadFindingMessage(longer[0], meal())).toContain("La limite de cet événement est de 2 h 30, pause repas comprise.")
    // A gap outside any window gets no credit.
    expect(evaluateWorkload([m("2026-07-04", "14:00", "15:00"), m("2026-07-04", "17:20", "18:00")], meal({}, { ...MEAL, windows: [{ start: "11:30", end: "14:00" }] })).filter((f) => f.rule === "idle")).toHaveLength(1)
  })

  it("only a change that shrinks the meal is new", () => {
    const p = meal()
    const base = [m("2026-07-04", "08:00", "11:45", false, "a")]
    expect(workloadChange(base, [...base, m("2026-07-04", "12:10", "14:00", false, "b")], p).map((f) => f.rule)).toEqual(["meal"])
    expect(workloadChange(base, [...base, m("2026-07-04", "12:10", "14:00", true, "b")], p)).toEqual([])
  })
})

// ── #1171 lot 2: travel between places ──────────────────────────────────────

describe("policy version 4: the travel answer", () => {
  const OFF = { apply: false as const }
  const ALL = { requireOffDay: true, requireMeal: true, requireTravel: true }
  it("writes version 4 with every answer, reads 1 to 4, and requires the travel answer on writes", () => {
    const v4 = buildPolicy({ ...VALUES, offDay: OFF, meal: OFF, travel: { apply: true, minutes: 15 } }, TZ)
    expect(v4.version).toBe(4)
    expect(parseWorkloadPolicy(v4)).toEqual({ ok: true, policy: v4 })
    expect(parseWorkloadPolicy({ ...v4, version: 3 }).ok).toBe(false)
    const r = checkPolicyValues({ ...VALUES, offDay: OFF, meal: OFF }, ALL)
    expect(r.ok ? [] : r.problems.map((p) => p.field)).toEqual(["travel"])
    const fields = (travel: unknown) => { const x = checkPolicyValues({ ...VALUES, offDay: OFF, meal: OFF, travel }, ALL); return x.ok ? [] : x.problems.map((p) => p.field) }
    expect(fields({ apply: true, minutes: 0 })).toEqual([])
    expect(fields({ apply: true, minutes: 16 })).toEqual(["travelMinutes"])
    expect(fields({ apply: true })).toEqual(["travelMinutes"])
    expect(fields({ apply: false, minutes: 5 })).toEqual(["travel"])
  })

  it("scans again when the margin starts or grows, not when it shrinks or stops", () => {
    const base = activePolicy(buildPolicy({ ...VALUES, offDay: OFF, meal: OFF, travel: { apply: true, minutes: 10 } }, TZ), HORIZON)
    const t = (travel: ActivePolicy["travel"]) => ({ ...base, travel })
    expect(policyChangeNeedsScan(base, t({ apply: true, minutes: 15 }))).toBe(true)
    expect(policyChangeNeedsScan(base, t({ apply: true, minutes: 5 }))).toBe(false)
    expect(policyChangeNeedsScan(base, t({ apply: false }))).toBe(false)
    expect(policyChangeNeedsScan(t({ apply: false }), base)).toBe(true)
  })
})

describe("evaluateWorkload: travel between places", () => {
  const travel = (minutes = 15) => activePolicy(buildPolicy({ ...VALUES, maxEventMinutes: 100 * 60, offDay: { apply: false }, meal: { apply: false }, travel: { apply: true, minutes } }, TZ), HORIZON)
  const at = (place: string | null, date: string, start: string, end: string, id = `t${++n}`): DutyShift => ({ id, date, startTime: start, endTime: end, placeId: place, placeName: place === "gs" ? "Grande Scène" : place === "dome" ? "Le Dôme" : place })
  const of = (shifts: DutyShift[], p = travel()) => evaluateWorkload(shifts, p).filter((f) => f.rule === "travel" || f.rule === "places")

  it("two missions at different places too close: refused with both places and the margin", () => {
    const f = of([at("gs", "2026-07-04", "10:00", "14:00"), at("dome", "2026-07-04", "14:05", "16:00")])
    expect(f).toEqual([expect.objectContaining({ rule: "travel", minutes: 5, limit: 15, places: ["Grande Scène", "Le Dôme"] })])
    expect(workloadFindingMessage(f[0], travel())).toBe("Journée de service du samedi 4 juillet : seulement 5 min entre une mission à « Grande Scène » qui finit à 14 h et une mission à « Le Dôme » qui commence à 14 h 05. Cet événement demande 15 min entre deux lieux différents.")
  })

  it("the same place, enough margin, or a mission without a place is not a finding", () => {
    expect(of([at("gs", "2026-07-04", "10:00", "14:00"), at("gs", "2026-07-04", "14:00", "16:00")])).toEqual([])
    expect(of([at("gs", "2026-07-04", "10:00", "14:00"), at("dome", "2026-07-04", "14:15", "16:00")])).toEqual([])
    expect(of([at("gs", "2026-07-04", "10:00", "14:00"), at(null, "2026-07-04", "14:00", "16:00")])).toEqual([])
  })

  it("two places at the same time are refused, even with a margin of 0 (a cumulable poste included)", () => {
    const f = of([at("gs", "2026-07-04", "10:00", "15:00"), at("dome", "2026-07-04", "14:00", "16:00")], travel(0))
    expect(f).toEqual([expect.objectContaining({ rule: "places", minutes: 60, places: ["Grande Scène", "Le Dôme"] })])
    expect(workloadFindingMessage(f[0], travel(0))).toBe("Journée de service du samedi 4 juillet : deux missions en même temps à deux lieux différents, « Grande Scène » et « Le Dôme », de 14 h à 15 h. Une personne ne peut pas être à deux endroits à la fois.")
    // Back to back at two places with a margin of 0 is fine.
    expect(of([at("gs", "2026-07-04", "10:00", "14:00"), at("dome", "2026-07-04", "14:00", "16:00")], travel(0))).toEqual([])
  })

  it("checks across midnight and through a mission at a third place in between", () => {
    expect(of([at("gs", "2026-07-04", "22:00", "01:00"), at("dome", "2026-07-05", "01:10", "03:00")])).toHaveLength(1)
    const chain = of([at("gs", "2026-07-04", "10:00", "12:00"), at(null, "2026-07-04", "12:00", "12:05"), at("dome", "2026-07-04", "12:05", "14:00")])
    expect(chain).toEqual([expect.objectContaining({ rule: "travel", minutes: 5 })])
  })

  it("is not applied without the answer or with « do not apply »", () => {
    const close = [at("gs", "2026-07-04", "10:00", "14:00"), at("dome", "2026-07-04", "14:05", "16:00")]
    expect(of(close, { ...travel(), travel: { apply: false } })).toEqual([])
    expect(of(close, { ...POLICY, maxEventMinutes: 100 * 60 })).toEqual([])
  })
})
