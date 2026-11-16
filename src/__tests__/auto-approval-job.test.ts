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
  sendNtfy: vi.fn(async () => true),
  reported: [] as [string, unknown][],
  calls: [] as string[],
  tx: null as unknown,
}))

vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      // The only UPDATE is the cut-off push claim; everything else is the setting row lock.
      // (`FOR UPDATE` is part of the lock query, so match the statement's start.)
      if (strings[0].trimStart().startsWith("UPDATE")) {
        m.calls.push("claim")
        const cutOffAt = values[values.length - 1]
        if (!m.setting || m.setting.cutOffAt !== cutOffAt || m.setting.cutOffAlertedAt) return []
        m.setting = { ...m.setting, cutOffAlertedAt: values[0] }
        return [{ key: "signup.autoApproval" }]
      }
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
  m.tx = tx
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
vi.mock("@/lib/operator-alerts", () => ({ notifyOperator: m.notify, sendNtfy: m.sendNtfy }))
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
  m.sendNtfy.mockResolvedValue(true)
})
afterEach(() => { delete process.env.HOSTED_SERVICE })

describe("the automatic validation step (#1371)", () => {
  it("does nothing off the hosted service, without touching the database", async () => {
    process.env.HOSTED_SERVICE = "false"
    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(counts).toEqual({ candidates: 0, approved: 0, skipped: 0, failed: 0, cutOff: 0, expired: 0 })
    expect(m.calls).toEqual([])
    expect(m.approve).not.toHaveBeenCalled()
  })

  it("does nothing when the option is off", async () => {
    m.setting = null
    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(counts.approved).toBe(0)
    expect(m.approve).not.toHaveBeenCalled()
  })

  it("validates an eligible space, counts it, and leaves the « espace activé » email to the outbox", async () => {
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })

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
    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
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
      const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
      expect(m.approve, JSON.stringify(patch)).not.toHaveBeenCalled()
      expect(counts.approved, JSON.stringify(patch)).toBe(0)
      expect(counts.skipped, JSON.stringify(patch)).toBe(1)
    }
  })

  it("leaves a space pending when the block list now hits the owner's address or domain", async () => {
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    m.blocks = [{ expiresAt: null }]
    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(m.approve).not.toHaveBeenCalled()
    expect(counts.skipped).toBe(1)
    expect(m.setting).toMatchObject({ budgetUsed: 0, totalSinceActivation: 0 })
  })

  it("cuts the option off at the ceiling, logs once and alerts once, without validating the next space", async () => {
    m.setting = { ...baseSetting(), budgetUsed: AUTO_APPROVAL_DAILY_CEILING - 1 }
    m.candidates = ["org-a", "org-b"]
    m.orgs.set("org-a", baseOrg("org-a"))
    m.orgs.set("org-b", baseOrg("org-b"))

    const first = await runAutoApproval({ now: NOW, clock: () => NOW })
    // The batch is bounded by the remaining budget: one candidate is read, not two.
    expect(first).toMatchObject({ candidates: 1, approved: 1, cutOff: 1 })
    expect(m.setting).toMatchObject({ budgetUsed: AUTO_APPROVAL_DAILY_CEILING, totalSinceActivation: 1 })
    expect(m.setting?.cutOffAt).toEqual(expect.any(String))
    expect(m.setting?.cutOffAlertedAt).toEqual(expect.any(String))
    expect(m.logs.filter((l) => l.action === "auto_approval.cut_off")).toHaveLength(1)
    expect(m.notify).toHaveBeenCalledTimes(1)
    expect(m.notify).toHaveBeenCalledWith(
      expect.objectContaining({ key: "auto-approval-cut-off:2026-11-16T10:00:00.000Z", priority: 4 }),
      {},
      { db: m.tx, push: false, strictEmail: true },
    )
    expect(m.sendNtfy).toHaveBeenCalledTimes(1)
    expect(m.sendNtfy).toHaveBeenCalledWith(expect.objectContaining({ key: "auto-approval-cut-off:2026-11-16T10:00:00.000Z" }))
    expect(m.approve).toHaveBeenCalledTimes(1)

    // A following run sees the cut-off and neither queues nor pushes again.
    const second = await runAutoApproval({ now: new Date("2026-11-16T10:05:00Z"), clock: () => new Date("2026-11-16T10:05:00Z") })
    expect(second.approved).toBe(0)
    expect(m.notify).toHaveBeenCalledTimes(1)
    expect(m.sendNtfy).toHaveBeenCalledTimes(1)
    expect(m.logs.filter((l) => l.action === "auto_approval.cut_off")).toHaveLength(1)
  })

  it("records a budget already used up on an option that is still on, once", async () => {
    m.setting = { ...baseSetting(), budgetUsed: AUTO_APPROVAL_DAILY_CEILING }
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    const first = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(first).toMatchObject({ approved: 0, cutOff: 1 })
    expect(m.setting?.cutOffAt).toEqual(expect.any(String))
    expect(m.logs.filter((l) => l.action === "auto_approval.cut_off")).toHaveLength(1)

    const second = await runAutoApproval({ now: new Date("2026-11-16T10:05:00Z"), clock: () => new Date("2026-11-16T10:05:00Z") })
    expect(second.cutOff).toBe(0)
    expect(m.logs.filter((l) => l.action === "auto_approval.cut_off")).toHaveLength(1)
    expect(m.notify).toHaveBeenCalledTimes(1)
    expect(m.sendNtfy).toHaveBeenCalledTimes(1)
  })

  it("writes the one « expirée » entry, then does nothing more", async () => {
    m.setting = { ...baseSetting(), until: "2026-11-10", activatedAt: "2026-11-01T08:00:00.000Z" }
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())

    const first = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(first).toMatchObject({ approved: 0, expired: 1 })
    expect(m.logs.filter((l) => l.action === "auto_approval.expired")).toHaveLength(1)
    expect(m.setting?.expiredAt).toEqual(expect.any(String))

    const second = await runAutoApproval({ now: new Date("2026-11-16T10:05:00Z"), clock: () => new Date("2026-11-16T10:05:00Z") })
    expect(second.expired).toBe(0)
    expect(m.logs.filter((l) => l.action === "auto_approval.expired")).toHaveLength(1)
    expect(m.approve).not.toHaveBeenCalled()
  })

  it("reports a corrupted setting once per run and treats it as off", async () => {
    m.setting = { until: "2099-01-01" }
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(counts).toEqual({ candidates: 0, approved: 0, skipped: 0, failed: 0, cutOff: 0, expired: 0 })
    expect(m.reported).toHaveLength(1)
    expect(m.reported[0][0]).toBe("auto_approval.invalid")
    expect(m.approve).not.toHaveBeenCalled()
  })

  it("never validates a space whose only active owner was invited later", async () => {
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", {
      ...baseOrg(),
      admins: [{
        email: "invitee@example.org",
        createdAt: new Date("2026-11-16T09:20:00.000Z"),
        isActive: true,
        activatedAt: new Date("2026-11-16T09:30:00.000Z"),
      }],
    })
    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(m.approve).not.toHaveBeenCalled()
    expect(counts.approved).toBe(0)
    expect(counts.skipped).toBe(1)
  })

  it("decides expiry with the clock read after the lock, not before selection", async () => {
    m.setting = { ...baseSetting(), until: "2026-11-16", budgetDate: "2026-11-16" }
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    const selectedAt = new Date("2026-11-16T22:59:00.000Z")
    const afterLock = new Date("2026-11-16T23:00:00.000Z")

    const counts = await runAutoApproval({ now: selectedAt, clock: () => afterLock })
    expect(counts.candidates).toBe(1)
    expect(counts.approved).toBe(0)
    expect(m.approve).not.toHaveBeenCalled()
    expect(m.setting).toMatchObject({ budgetUsed: 0, cutOffAt: null })
  })

  it("uses the UTC day of the clock read after the lock for the budget", async () => {
    m.setting = { ...baseSetting(), budgetDate: "2026-11-16", budgetUsed: 19 }
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    const selectedAt = new Date("2026-11-16T23:59:30.000Z")
    const afterLock = new Date("2026-11-17T00:00:30.000Z")

    const counts = await runAutoApproval({ now: selectedAt, clock: () => afterLock })
    expect(counts.approved).toBe(1)
    expect(m.setting).toMatchObject({ budgetDate: "2026-11-17", budgetUsed: 1 })
  })

  it("never moves a budget day already past the captured day backwards", async () => {
    m.setting = { ...baseSetting(), budgetDate: "2026-11-17", budgetUsed: 5 }
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    const selectedAt = new Date("2026-11-16T23:59:30.000Z")
    const afterLock = new Date("2026-11-17T00:00:30.000Z")

    const counts = await runAutoApproval({ now: selectedAt, clock: () => afterLock })
    expect(counts.approved).toBe(1)
    expect(m.setting).toMatchObject({ budgetDate: "2026-11-17", budgetUsed: 6 })
  })

  it("leaves a space untouched when the stored budget day is after the clock's", async () => {
    m.setting = { ...baseSetting(), budgetDate: "2026-11-18", budgetUsed: 5 }
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())

    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(counts.approved).toBe(0)
    expect(m.approve).not.toHaveBeenCalled()
    expect(m.setting).toMatchObject({ budgetDate: "2026-11-18", budgetUsed: 5 })
  })

  it("does not commit a cut-off whose durable email cannot be queued", async () => {
    m.setting = { ...baseSetting(), budgetUsed: AUTO_APPROVAL_DAILY_CEILING - 1 }
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    m.notify.mockRejectedValueOnce(new Error("outbox down"))

    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(counts.approved).toBe(0)
    expect(counts.failed).toBe(1)
    expect(m.setting).toMatchObject({ budgetUsed: AUTO_APPROVAL_DAILY_CEILING - 1, cutOffAt: null })
    expect(m.sendNtfy).not.toHaveBeenCalled()
  })

  it("queues the durable email with the cut-off and does not retry a failed push", async () => {
    m.setting = { ...baseSetting(), budgetUsed: AUTO_APPROVAL_DAILY_CEILING - 1 }
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    m.sendNtfy.mockResolvedValue(false)

    const first = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(first.cutOff).toBe(1)
    expect(m.notify).toHaveBeenCalledTimes(1) // the email is queued with the cut-off
    expect(m.sendNtfy).toHaveBeenCalledTimes(1)
    expect(m.setting?.cutOffAlertedAt).toEqual(expect.any(String))

    const second = await runAutoApproval({ now: new Date("2026-11-16T10:05:00Z"), clock: () => new Date("2026-11-16T10:05:00Z") })
    expect(second.cutOff).toBe(0)
    expect(m.notify).toHaveBeenCalledTimes(1)
    expect(m.sendNtfy).toHaveBeenCalledTimes(1)
  })

  it("recovers the push of a committed cut-off after a crash, without queueing its email twice", async () => {
    m.setting = {
      ...baseSetting(),
      budgetUsed: AUTO_APPROVAL_DAILY_CEILING,
      cutOffAt: "2026-11-16T09:55:00.000Z",
      cutOffSeenAt: null,
      cutOffAlertedAt: null,
    }

    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(counts.cutOff).toBe(0)
    expect(m.notify).not.toHaveBeenCalled() // the email was queued with the cut-off before the crash
    expect(m.sendNtfy).toHaveBeenCalledTimes(1)
    expect(m.setting.cutOffAlertedAt).toBe(NOW.toISOString())
  })

  it("pushes a cut-off alert even after the option expired", async () => {
    m.setting = {
      ...baseSetting(),
      until: "2026-11-10",
      activatedAt: "2026-11-01T08:00:00.000Z",
      budgetUsed: AUTO_APPROVAL_DAILY_CEILING,
      cutOffAt: "2026-11-10T22:00:00.000Z",
      cutOffAlertedAt: null,
    }

    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(counts.expired).toBe(1)
    expect(m.notify).not.toHaveBeenCalled()
    expect(m.sendNtfy).toHaveBeenCalledTimes(1)
  })

  it("keeps going after one space fails, reporting it", async () => {
    m.candidates = ["org-throws", "org-fete"]
    m.orgs.set("org-fete", baseOrg("org-fete"))
    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(counts).toMatchObject({ candidates: 2, approved: 1, failed: 1 })
    expect(m.approve).toHaveBeenCalledTimes(1)
    expect(m.reported.map(([key]) => key)).toContain("auto_approval.approve")
  })

  it("returns counts only, never an identifier in the job summary", async () => {
    m.candidates = ["org-fete"]
    m.orgs.set("org-fete", baseOrg())
    const counts = await runAutoApproval({ now: NOW, clock: () => NOW })
    expect(Object.keys(counts).sort()).toEqual(["approved", "candidates", "cutOff", "expired", "failed", "skipped"])
    expect(Object.values(counts).every((v) => typeof v === "number")).toBe(true)
  })
})
