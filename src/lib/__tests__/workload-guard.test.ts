import { describe, it, expect } from "vitest"
import { applyDutyChange, judgeDutyChange, reproducibleFrom, scheduleEditRefusalBody, workloadGateOf, workloadRefusalBody } from "../workload-guard"
import { buildPolicy, WORKLOAD_POLICY_INCOMPLETE, type DutyShift } from "../workload-policy"
import { duplicatedWorkload } from "../event-duplicate"

// #1171 lot 1: the pure part of the enforcement (the locks and reads run on Postgres, workload-policy.int.test.ts).
const POLICY = buildPolicy({
  serviceDayStart: "08:00", maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600, maxIdleGapMinutes: 120,
}, "Europe/Zurich")
const s = (id: string, date: string, startTime: string, endTime: string): DutyShift => ({ id, date, startTime, endTime })
const day = s("day", "2031-07-04", "14:00", "20:00")
const night = s("night", "2031-07-05", "01:00", "03:00")

describe("workloadGateOf", () => {
  it("is off unless enabled, on with a policy that parses, closed otherwise", () => {
    expect(workloadGateOf(null)).toEqual({ kind: "off" })
    expect(workloadGateOf({ workloadProtectionEnabled: false, workloadPolicy: POLICY })).toEqual({ kind: "off" })
    expect(workloadGateOf({ workloadProtectionEnabled: true, workloadPolicy: POLICY })).toEqual({ kind: "on", policy: POLICY })
    expect(workloadGateOf({ workloadProtectionEnabled: true, workloadPolicy: null })).toEqual({ kind: "incomplete" })
    expect(workloadGateOf({ workloadProtectionEnabled: true, workloadPolicy: { ...POLICY, minRestMinutes: null } })).toEqual({ kind: "incomplete" })
  })
})

describe("applyDutyChange and judgeDutyChange", () => {
  it("removes, replaces and adds", () => {
    const moved = { ...night, startTime: "02:00" }
    expect(applyDutyChange([day, night], { removeShiftIds: ["day"], replace: [moved], add: [s("x", "2031-07-06", "10:00", "11:00")] }).map((d) => [d.id, d.startTime]))
      .toEqual([["night", "02:00"], ["x", "10:00"]])
  })

  it("lets anything through when off, nothing when incomplete, and refuses a new finding when on", () => {
    expect(judgeDutyChange({ kind: "off" }, [day], { add: [night] })).toEqual({ ok: true })
    expect(judgeDutyChange({ kind: "incomplete" }, [], { add: [day] })).toEqual({ ok: false, reason: "incomplete" })
    const verdict = judgeDutyChange({ kind: "on", policy: POLICY }, [day], { add: [night] })
    expect(verdict).toMatchObject({ ok: false, reason: "findings", findings: [expect.objectContaining({ rule: "idle", minutes: 300 })] })
    // A swap: giving the day shift away removes the wait.
    expect(judgeDutyChange({ kind: "on", policy: POLICY }, [day, night], { removeShiftIds: ["day"], add: [s("b", "2031-07-05", "00:00", "01:00")] })).toEqual({ ok: true })
  })
})

describe("reproducibleFrom", () => {
  it("tells a finding the submission makes alone from one that needs the shifts already held", () => {
    const both = judgeDutyChange({ kind: "on", policy: POLICY }, [], { add: [day, night] })
    if (both.ok || both.reason !== "findings") throw new Error("expected findings")
    expect(reproducibleFrom(both.findings[0], [day, night], POLICY)).toBe(true)
    const withHeld = judgeDutyChange({ kind: "on", policy: POLICY }, [day], { add: [night] })
    if (withHeld.ok || withHeld.reason !== "findings") throw new Error("expected findings")
    expect(reproducibleFrom(withHeld.findings[0], [night], POLICY)).toBe(false)
  })
})

describe("refusal bodies", () => {
  it("gives one specific sentence and every finding", () => {
    const verdict = judgeDutyChange({ kind: "on", policy: POLICY }, [], { add: [day, night, s("long", "2031-07-06", "08:00", "20:00")] })
    if (verdict.ok) throw new Error("expected a refusal")
    const body = workloadRefusalBody(verdict, "Ajout impossible.")
    expect(body.code).toBe("workload")
    expect(body.error).toMatch(/^Ajout impossible. Journée de service du vendredi 4 juillet : ces deux missions laissent 5 h/)
    expect(body.error).toMatch(/\(et \d autres limites\)$/)
    expect(body.workload.length).toBeGreaterThan(1)
    expect(workloadRefusalBody({ ok: false, reason: "incomplete" }, "x").error).toBe(WORKLOAD_POLICY_INCOMPLETE)
  })

  it("names who an edit would put over the limits", () => {
    const verdict = judgeDutyChange({ kind: "on", policy: POLICY }, [day], { add: [night] })
    if (verdict.ok) throw new Error("expected a refusal")
    const one = scheduleEditRefusalBody([{ volunteerId: "v1", name: "Sam Martin", verdict }])
    expect(one.error).toContain("le programme de Sam Martin")
    expect(one.error).toContain("Rien n'a été modifié.")
    expect(scheduleEditRefusalBody([{ volunteerId: "v1", name: "A", verdict }, { volunteerId: "v2", name: "B", verdict }]).error).toContain("de 2 personnes")
  })
})

describe("duplicatedWorkload", () => {
  const newEvent = { workloadProtectionEnabled: false }
  it("copies the source's values with the settings, the zone snapshotted again, only while it can be adopted", () => {
    expect(duplicatedWorkload({ workloadProtectionEnabled: true, workloadPolicy: POLICY }, true, { gate: true, newEvent, timeZone: "Europe/Paris" }))
      .toEqual({ workloadProtectionEnabled: true, workloadPolicy: { ...POLICY, timeZone: "Europe/Paris" } })
    expect(duplicatedWorkload({ workloadProtectionEnabled: true, workloadPolicy: POLICY }, true, { gate: false, newEvent, timeZone: "Europe/Zurich" })).toEqual({ workloadProtectionEnabled: false })
    expect(duplicatedWorkload({ workloadProtectionEnabled: true, workloadPolicy: { broken: true } }, true, { gate: true, newEvent, timeZone: "Europe/Zurich" })).toEqual({ workloadProtectionEnabled: false })
  })

  it("follows the organisation's rule for a new event without the settings", () => {
    const fromOrg = { workloadProtectionEnabled: true, workloadPolicy: POLICY }
    expect(duplicatedWorkload({ workloadProtectionEnabled: false }, false, { gate: true, newEvent: fromOrg, timeZone: "Europe/Zurich" })).toBe(fromOrg)
  })
})
