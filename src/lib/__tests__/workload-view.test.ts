import { describe, it, expect } from "vitest"
import { blocksWorkload, newWorkloadNotices, recapWorkloadNotices, workloadByPerson, workloadModeOf, workloadNotices } from "../workload-view"
import { activePolicy, buildPolicy, WORKLOAD_POLICY_INCOMPLETE } from "../workload-policy"
import { describeSignupFailure } from "../form-errors"

// #1171: one entry point for every surface; the #465 warnings stay for events without protection.
const TZ = "Europe/Zurich"
const STORED = buildPolicy({ serviceDayStart: "08:00", maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600, maxIdleGapMinutes: 120 }, TZ)
const DATES = { startDate: "2026-07-01", endDate: "2026-07-10" }
const POLICY = activePolicy(STORED, DATES)
const s = (id: string, date: string, startTime: string, endTime: string) => ({ id, date, startTime, endTime })
const day = s("day", "2026-07-04", "14:00", "20:00"), night = s("night", "2026-07-05", "01:00", "03:00")
const long = s("long", "2026-07-04", "08:00", "15:00")

describe("workloadModeOf", () => {
  it("reads the event's protection, else the #465 warnings", () => {
    expect(workloadModeOf({ ...DATES }, TZ)).toEqual({ kind: "warnings", timeZone: TZ })
    expect(workloadModeOf({ workloadProtectionEnabled: false, workloadPolicy: STORED, ...DATES }, TZ)).toEqual({ kind: "warnings", timeZone: TZ })
    expect(workloadModeOf({ workloadProtectionEnabled: true, workloadPolicy: STORED, ...DATES }, TZ)).toEqual({ kind: "policy", policy: POLICY })
    expect(workloadModeOf({ workloadProtectionEnabled: true, workloadPolicy: null, ...DATES }, TZ)).toEqual({ kind: "incomplete" })
    expect(blocksWorkload({ kind: "warnings", timeZone: TZ })).toBe(false)
  })
})

describe("workloadNotices", () => {
  it("never reports the same situation in two vocabularies", () => {
    // 9 h without a break: a #465 warning without protection, a finding of the policy with it.
    const warnings = workloadNotices([long], { kind: "warnings", timeZone: TZ })
    expect(warnings.map((n) => n.text)).toEqual(["Samedi 4 juillet : 7 h d'affilée, de 8 h à 15 h, sans pause d'au moins 30 minutes."])
    const findings = workloadNotices([long], { kind: "policy", policy: POLICY })
    expect(findings.map((n) => n.text)).toEqual(["Journée de service du samedi 4 juillet : 7 h de missions d'affilée, de 8 h à 15 h, sans vraie pause. La limite de cet événement est de 6 h."])
    expect(findings[0].shiftIds).toEqual(["long"])
  })

  it("says an unreadable protection once", () => {
    expect(workloadNotices([day], { kind: "incomplete" })).toEqual([{ key: "incomplete", text: WORKLOAD_POLICY_INCOMPLETE, shiftIds: ["day"] }])
    expect(workloadByPerson([{ volunteerId: "v", status: "active", shift: day }], { kind: "incomplete" }).size).toBe(0)
  })
})

describe("newWorkloadNotices and recapWorkloadNotices", () => {
  it("keeps only what a change adds on a protected event", () => {
    const mode = { kind: "policy" as const, policy: POLICY }
    expect(newWorkloadNotices([day], [day, night], mode)).toHaveLength(1)
    expect(recapWorkloadNotices([night], [day], mode)).toHaveLength(1)
    expect(recapWorkloadNotices([], [day, night], mode)).toEqual([])
    // Without protection, the recap shows every warning, as before (#465).
    expect(recapWorkloadNotices([long], [], { kind: "warnings", timeZone: TZ })).toHaveLength(1)
  })
})

describe("workloadByPerson", () => {
  it("counts pending requests on a protected event, confirmed places only otherwise", () => {
    const regs = [{ volunteerId: "v", status: "active", shift: day }, { volunteerId: "v", status: "requested", shift: night }]
    expect(workloadByPerson(regs, { kind: "policy", policy: POLICY }).get("v")).toHaveLength(1)
    expect(workloadByPerson(regs, { kind: "warnings", timeZone: TZ }).size).toBe(0)
  })
})

describe("describeSignupFailure", () => {
  it("names a workload refusal and sends back to the planning", () => {
    const f = describeSignupFailure({ status: 409, body: { error: "Inscription impossible : …", code: "workload" } })
    expect(f).toMatchObject({ kind: "conflict", title: "Ces créneaux dépassent les limites de l'événement", message: "Inscription impossible : …" })
  })
})
