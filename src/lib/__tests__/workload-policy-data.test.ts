import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
const gate = vi.hoisted(() => ({ adopt: true, shipped: true }))
vi.mock("@/lib/beta-access", () => ({ canAdoptBeta: async () => gate.adopt }))
vi.mock("@/lib/workload-shipped", () => ({ workloadProtectionShipped: () => gate.shipped }))

import { newEventWorkload, parseWorkloadDefault, policySummary } from "../workload-policy-data"
import { buildPolicy } from "../workload-policy"

// #1171: the organisation's default seeds new events only, copied, while the capability can be adopted.
const VALUES = { serviceDayStart: "08:00", maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600, maxIdleGapMinutes: 120 }

describe("parseWorkloadDefault", () => {
  it("reads only a complete default", () => {
    expect(parseWorkloadDefault({ enabled: true, values: VALUES })).toEqual({ enabled: true, values: VALUES })
    expect(parseWorkloadDefault({ enabled: true, values: { ...VALUES, minRestMinutes: undefined } })).toBeNull()
    expect(parseWorkloadDefault({ values: VALUES })).toBeNull()
    expect(parseWorkloadDefault(null)).toBeNull()
  })
})

describe("newEventWorkload", () => {
  it("copies the values and snapshots the organisation's zone", async () => {
    gate.adopt = true; gate.shipped = true
    expect(await newEventWorkload("org", { workloadPolicyDefault: { enabled: true, values: VALUES }, timeZone: "Europe/Paris" }))
      .toEqual({ workloadProtectionEnabled: true, workloadPolicy: buildPolicy(VALUES, "Europe/Paris") })
    expect(await newEventWorkload("org", { workloadPolicyDefault: { enabled: false, values: VALUES }, timeZone: "Europe/Paris" }))
      .toEqual({ workloadProtectionEnabled: false, workloadPolicy: buildPolicy(VALUES, "Europe/Paris") })
  })

  it("gives nothing without a default, before the capability ships, or outside the beta", async () => {
    gate.adopt = true; gate.shipped = true
    expect(await newEventWorkload("org", { workloadPolicyDefault: null })).toEqual({ workloadProtectionEnabled: false })
    gate.shipped = false
    expect(await newEventWorkload("org", { workloadPolicyDefault: { enabled: true, values: VALUES } })).toEqual({ workloadProtectionEnabled: false })
    gate.shipped = true; gate.adopt = false
    expect(await newEventWorkload("org", { workloadPolicyDefault: { enabled: true, values: VALUES } })).toEqual({ workloadProtectionEnabled: false })
  })
})

describe("policySummary", () => {
  it("summarises the limits for the event log, without anyone's data", () => {
    expect(policySummary(null)).toBe("(aucune)")
    expect(policySummary(buildPolicy(VALUES, "Europe/Zurich"))).toBe("journée dès 08:00, 6 h sans pause de 30 min, 10 h/journée, 40 h au total, repos 10 h, attente 2 h")
  })
})
