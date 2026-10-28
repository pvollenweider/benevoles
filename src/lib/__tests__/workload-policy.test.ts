import { describe, it, expect } from "vitest"
import {
  buildPolicy, checkPolicyValues, evaluateWorkload, findingOnlyAbout, newFindings, parseWorkloadPolicy, policyChangeNeedsScan,
  serviceDayExamples, serviceDayOf, workloadChange, workloadFindingMessage, type DutyShift, type WorkloadPolicy, type WorkloadPolicyValues,
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
const POLICY: WorkloadPolicy = buildPolicy(VALUES, TZ)
const policy = (over: Partial<WorkloadPolicy> = {}): WorkloadPolicy => ({ ...POLICY, ...over })

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
    expect(parseWorkloadPolicy(POLICY)).toEqual({ ok: true, policy: POLICY })
    expect(parseWorkloadPolicy({ ...POLICY, version: 2 }).ok).toBe(false)
    expect(parseWorkloadPolicy({ ...POLICY, timeZone: "Mars/Olympus" }).ok).toBe(false)
    expect(parseWorkloadPolicy({ ...POLICY, mealMinutes: 30 }).ok).toBe(false)
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
