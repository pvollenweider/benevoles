import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * The scheduled step of « Validation automatique des nouveaux espaces » (#1371), with doubles:
 * every eligibility condition excludes on its own, the daily budget cuts the option off once and
 * alerts once, expiry is logged once, a failure of one space does not stop the others, and nothing
 * happens off the hosted service. The counts are the only thing the outbox job's summary carries.
 */

const m = vi.hoisted(() => ({
  setting: null as Record<string, unknown> | null,
  candidates: [] as string[],
  orgs: new Map<string, Record<string, unknown>>(),
  blocks: [] as { expiresAt: Date | null }[],
  logs: [] as Record<string, unknown>[],
  approve: vi.fn(),
  notify: vi.fn(async () => {}),
  reported: [] as [string, unknown][],
  calls: [] as string[],
}))

vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: vi.fn(async () => {
      m.calls.push("lock")
      return m.setting ? [{ value: m.setting }] : []
    }),
    platformSetting: {
      update: vi.fn(async ({ data }: { data: { value: Record<string, unknown> } }) => {
        m.calls.push("setting.update")
        m.setting = data.value
        return { value: data.value }
      }),
    },
    organization: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        m.calls.push(`org.findUnique:${where.id}`)
        if (where.id === "org-throws") throw new Error("db down")
        return m.orgs.get(where.id) ?? null
      }),
    },
    signupBlock: { findMany: vi.fn(async () => { m.calls.push("blocks"); return m.blocks }) },
    operatorLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { m.logs.push(data); return data }) },
  }
  return {
    prisma: {
      ...tx,
      platformSetting: {
        findUnique: vi.fn(async () => (m.setting ? { value: m.setting } : null)),
        update: tx.platformSetting.update,
      },
      organization: {
        findMany: vi.fn(async ({ take }: { take: number }) => {
          m.calls.push(`org.findMany:${take}`)
          return m.candidates.slice(0, take).map((id) => ({ id }))
        }),
        findUnique: tx.organization.findUnique,
      },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})
vi.mock("@/lib/org-approval-server", () => ({ approveOrganization: m.approve }))
vi.mock("@/lib/operator-alerts", () => ({ notifyOperator: m.notify }))
vi.mock("@/lib/report-error", () => ({ reportError: (key: string) => (e: unknown) => { m.reported.push([key, e]) } }))

import { runAutoApproval } from "@/lib/auto-approval-server"
import { EMPTY_AUTO_APPROVAL, AUTO_APPROVAL_DAILY_CEILING } from "@/lib/auto-approval"

const NOW = new Date("2026-11-16T10:00:00Z")

const baseSetting = () => ({
  ...EMPTY_AUTO_APPROVAL,
  until: "2026-11-30",
  activatedAt: "2026-11-16T08:00:00.000Z",
  activatedByLabel: "Opérateur",
  budgetDate: "2026-11-16",
  budgetUsed: 0,
})

const baseOrg = (id = "org-fete") => ({
  id,
  name: "Fête du village",
  slug: "fete",
  active: true,
  suspendedAt: null,
  publicationApprovedAt: null,
  outboundEmailApprovedAt: null,
  createdAt: new Date("2026-11-16T09:00:00.000Z"),
  signupAt: new Date("2026-11-16T09:00:00.000Z"),
  admins: [{
    email: "sacha.bonvin@example.org",
    createdAt: new Date("2026-11-16T09:00:00.000Z"),
    isActive: true,
    activatedAt: new Date("2026-11-16T09:30:00.000Z"),
  }],
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HOSTED_SERVICE = "true"
  m.setting = baseSetting()
  m.candidates = []
  m.orgs = new Map()
  m.blocks = []
  m.logs = []
  m.reported = []
  m.calls = []
  m.approve.mockResolvedValue({ approved: true, outboxIds: ["outbox-1"] })
  m.notify.mockResolvedValue(undefined)
})
afterEach(() => { delete process.env.HOSTED_SERVICE })

describe("the automatic validation step (#1371)", () => {
  it("does nothing off the hosted service, without touching the database", async () => {
    process.env.HOSTED_SERVICE = "false"
    const counts = await runAutoApproval({ now: NOW })
    expect(counts).toEqual({ candidates: 0, approved: 0, skipped: 0, failed: 0, cutOff: 0, expired: 0 })
    expect(m.calls).toEqual([])
    expect(m.approve).not.toHaveBeenCalled()
  })

  it("does nothing when the option is off", async () => {
    m.setting = null
    const counts = await runAutoApproval({ now: NOW })
    expect(counts.approved).toBe(0)
    expect(m.approve).not.toHaveBeenCalled()
  })

  it("validates an eligible space, counts it, and leaves the « espace activé » email to the outbox", async () => {
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    const counts = await runAutoApproval({ now: NOW })

    expect(m.approve).toHaveBeenCalledWith(expect.anything(), {
      organizationId: "org-fete",
      actor: { type: "automatic" },
      now: NOW,
    })
    expect(counts).toEqual({ candidates: 1, approved: 1, skipped: 0, failed: 0, cutOff: 0, expired: 0 })
    expect(m.setting).toMatchObject({ budgetDate: "2026-11-16", budgetUsed: 1, totalSinceActivation: 1, cutOffAt: null })
    // The step itself never raises an alert for a normal validation.
    expect(m.notify).not.toHaveBeenCalled()
  })

  it.each([
    ["not from the self-service sign-up", { signupAt: null }],
    ["created before the option was turned on", { createdAt: new Date("2026-11-16T07:59:59.000Z") }],
    ["inactive", { active: false }],
    ["suspended", { suspendedAt: new Date("2026-11-16T09:10:00.000Z") }],
    ["already validated", { publicationApprovedAt: new Date(), outboundEmailApprovedAt: new Date() }],
  ])("excludes a space %s on its own", async (_label, patch) => {
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", { ...baseOrg(), ...patch })
    const counts = await runAutoApproval({ now: NOW })
    expect(m.approve).not.toHaveBeenCalled()
    expect(counts.approved).toBe(0)
    expect(counts.skipped).toBe(1)
    expect(m.setting).toMatchObject({ budgetUsed: 0, totalSinceActivation: 0 })
  })

  it("excludes a space whose owner is not active, or activated less than five minutes ago", async () => {
    for (const patch of [
      { isActive: false, activatedAt: new Date("2026-11-16T09:30:00.000Z") },
      { isActive: true, activatedAt: null },
      { isActive: true, activatedAt: new Date("2026-11-16T09:58:00.000Z") },
    ]) {
      m.candidates = ["org-fete"]
      m.orgs.set("org-fete", { ...baseOrg(), admins: [{ ...baseOrg().admins[0], ...patch }] })
      m.approve.mockClear()
      const counts = await runAutoApproval({ now: NOW })
      expect(m.approve, JSON.stringify(patch)).not.toHaveBeenCalled()
      expect(counts.approved, JSON.stringify(patch)).toBe(0)
      expect(counts.skipped, JSON.stringify(patch)).toBe(1)
    }
  })

  it("leaves a space pending when the block list now hits the owner's address or domain", async () => {
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    m.blocks = [{ expiresAt: null }]
    const counts = await runAutoApproval({ now: NOW })
    expect(m.approve).not.toHaveBeenCalled()
    expect(counts.skipped).toBe(1)
    expect(m.setting).toMatchObject({ budgetUsed: 0, totalSinceActivation: 0 })
  })

  it("cuts the option off at the ceiling, logs once and alerts once, without validating the next space", async () => {
    m.setting = { ...baseSetting(), budgetUsed: AUTO_APPROVAL_DAILY_CEILING - 1 }
    m.candidates = ["org-a", "org-b"]
    m.orgs.set("org-a", baseOrg("org-a"))
    m.orgs.set("org-b", baseOrg("org-b"))

    const first = await runAutoApproval({ now: NOW })
    // The batch is bounded by the remaining budget: one candidate is read, not two.
    expect(first).toMatchObject({ candidates: 1, approved: 1, cutOff: 1 })
    expect(m.setting).toMatchObject({ budgetUsed: AUTO_APPROVAL_DAILY_CEILING, totalSinceActivation: 1 })
    expect(m.setting?.cutOffAt).toEqual(expect.any(String))
    expect(m.setting?.cutOffAlertedAt).toEqual(expect.any(String))
    expect(m.logs.filter((l) => l.action === "auto_approval.cut_off")).toHaveLength(1)
    expect(m.notify).toHaveBeenCalledTimes(1)
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ key: "auto-approval-cut-off:2026-11-16", priority: 4 }))
    expect(m.approve).toHaveBeenCalledTimes(1)

    // A following run sees the cut-off and does not alert again.
    const second = await runAutoApproval({ now: new Date("2026-11-16T10:05:00Z") })
    expect(second.approved).toBe(0)
    expect(m.notify).toHaveBeenCalledTimes(1)
    expect(m.logs.filter((l) => l.action === "auto_approval.cut_off")).toHaveLength(1)
  })

  it("records a budget already used up on an option that is still on, once", async () => {
    m.setting = { ...baseSetting(), budgetUsed: AUTO_APPROVAL_DAILY_CEILING }
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    const first = await runAutoApproval({ now: NOW })
    expect(first).toMatchObject({ approved: 0, cutOff: 1 })
    expect(m.setting?.cutOffAt).toEqual(expect.any(String))
    expect(m.logs.filter((l) => l.action === "auto_approval.cut_off")).toHaveLength(1)

    const second = await runAutoApproval({ now: new Date("2026-11-16T10:05:00Z") })
    expect(second.cutOff).toBe(0)
    expect(m.logs.filter((l) => l.action === "auto_approval.cut_off")).toHaveLength(1)
    expect(m.notify).toHaveBeenCalledTimes(1)
  })

  it("writes the one « expirée » entry, then does nothing more", async () => {
    m.setting = { ...baseSetting(), until: "2026-11-10" }
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())

    const first = await runAutoApproval({ now: NOW })
    expect(first).toMatchObject({ approved: 0, expired: 1 })
    expect(m.logs.filter((l) => l.action === "auto_approval.expired")).toHaveLength(1)
    expect(m.setting?.expiredAt).toEqual(expect.any(String))

    const second = await runAutoApproval({ now: new Date("2026-11-16T10:05:00Z") })
    expect(second.expired).toBe(0)
    expect(m.logs.filter((l) => l.action === "auto_approval.expired")).toHaveLength(1)
    expect(m.approve).not.toHaveBeenCalled()
  })

  it("keeps going after one space fails, reporting it", async () => {
    m.candidates = ["org-throws", "org-fete"]
    m.orgs.set("org-fete", baseOrg("org-fete"))
    const counts = await runAutoApproval({ now: NOW })
    expect(counts).toMatchObject({ candidates: 2, approved: 1, failed: 1 })
    expect(m.approve).toHaveBeenCalledTimes(1)
    expect(m.reported.map(([key]) => key)).toContain("auto_approval.approve")
  })

  it("returns counts only, never an identifier in the job summary", async () => {
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    const counts = await runAutoApproval({ now: NOW })
    expect(Object.keys(counts).sort()).toEqual(["approved", "candidates", "cutOff", "expired", "failed", "skipped"])
    expect(Object.values(counts).every((v) => typeof v === "number")).toBe(true)
  })
})
