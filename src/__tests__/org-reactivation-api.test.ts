import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashToken } from "@/lib/token-hash"
import { canSelfReactivate, reactivationLinkValid, reactivationUpdate } from "@/lib/org-reactivation"

// « Réactiver mon espace » (#811): only for a space deactivated for inactivity, a single-use link
// stored hashed, sent without an organisation (a deactivated one sends nothing), spent once shown.

const m = vi.hoisted(() => ({
  findUnique: vi.fn(), adminUpdate: vi.fn(), adminUpdateMany: vi.fn(), orgUpdate: vi.fn(), orgLog: vi.fn(), queued: [] as unknown[],
}))
vi.mock("@/lib/prisma", () => {
  const db = {
    adminUser: { findUnique: m.findUnique, update: m.adminUpdate, updateMany: m.adminUpdateMany },
    organization: { update: m.orgUpdate },
    orgLog: { create: m.orgLog },
    async $transaction(fn: (tx: unknown) => unknown) { return fn(db) },
  }
  return { prisma: db }
})
vi.mock("@/lib/notifications/outbox", () => ({
  enqueueNotifications: async (payloads: unknown[]) => { m.queued.push(...payloads); return payloads.map((_, i) => `row-${i}`) },
  deliverAfterResponse: () => {},
}))

const json = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
    body: JSON.stringify(body),
  })

const deactivated = { name: "Fête du village", active: false, suspendedAt: null, inactivityDeactivatedAt: new Date("2026-09-01T00:00:00Z") }

beforeEach(() => {
  vi.clearAllMocks()
  m.queued = []
})

describe("who may reactivate a space alone (#811)", () => {
  it("only a space deactivated for inactivity, never one the operator deactivated or suspended", () => {
    expect(canSelfReactivate(deactivated)).toBe(true)
    expect(canSelfReactivate({ ...deactivated, inactivityDeactivatedAt: null })).toBe(false)
    expect(canSelfReactivate({ ...deactivated, suspendedAt: new Date() })).toBe(false)
    expect(canSelfReactivate({ ...deactivated, active: true })).toBe(false)
    expect(canSelfReactivate(null)).toBe(false)
  })

  it("a link works for an active account, before expiry", () => {
    const now = new Date("2026-10-10T10:00:00Z")
    const link = { isActive: true, orgReactivationExpiresAt: new Date("2026-10-10T11:00:00Z"), organization: deactivated }
    expect(reactivationLinkValid(link, now)).toBe(true)
    expect(reactivationLinkValid({ ...link, orgReactivationExpiresAt: new Date("2026-10-10T09:59:59Z") }, now)).toBe(false)
    expect(reactivationLinkValid({ ...link, isActive: false }, now)).toBe(false)
  })

  it("starts the check over from the day of the reactivation", () => {
    const now = new Date("2026-10-10T10:00:00Z")
    expect(reactivationUpdate(now)).toEqual({ active: true, inactivityDeactivatedAt: null, lastRetentionConfirmedAt: now })
  })
})

describe("POST /api/public/org-reactivation/request (#811)", () => {
  it("answers the same and sends nothing for an unknown address or a space the operator deactivated", async () => {
    const { POST } = await import("@/app/api/public/org-reactivation/request/route")
    m.findUnique.mockResolvedValueOnce(null)
    expect(await (await POST(json("http://localhost/x", { email: "nobody@x.org" }))).json()).toEqual({ ok: true })
    m.findUnique.mockResolvedValueOnce({ id: "a1", name: "A", email: "a@x.org", isActive: true, organization: { ...deactivated, inactivityDeactivatedAt: null } })
    expect(await (await POST(json("http://localhost/x", { email: "a@x.org" }))).json()).toEqual({ ok: true })
    m.findUnique.mockResolvedValueOnce({ id: "a1", name: "A", email: "a@x.org", isActive: true, organization: { ...deactivated, suspendedAt: new Date() } })
    expect(await (await POST(json("http://localhost/x", { email: "a@x.org" }))).json()).toEqual({ ok: true })
    expect(m.adminUpdate).not.toHaveBeenCalled()
    expect(m.queued).toEqual([])
  })

  it("stores the hash and emails the link, without an organisation so the send guard lets it go", async () => {
    m.findUnique.mockResolvedValueOnce({ id: "a1", name: "A", email: "a@x.org", isActive: true, organization: deactivated })
    const { POST } = await import("@/app/api/public/org-reactivation/request/route")
    expect(await (await POST(json("http://localhost/x", { email: "A@x.org" }))).json()).toEqual({ ok: true })

    const queued = m.queued[0] as { kind: string; organizationId: string | null; data: { reactivateUrl: string; organizationName: string } }
    expect(queued).toMatchObject({ kind: "org_reactivation", organizationId: null, data: { organizationName: "Fête du village" } })
    const plaintext = new URL(queued.data.reactivateUrl).searchParams.get("token")!
    const stored = m.adminUpdate.mock.calls[0][0].data
    expect(stored.orgReactivationTokenHash).toBe(hashToken(plaintext))
    const hours = (stored.orgReactivationExpiresAt.getTime() - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(23.9)
    expect(hours).toBeLessThanOrEqual(24)
  })
})

describe("POST /api/public/org-reactivation/confirm (#811)", () => {
  const secret = "a".repeat(64)

  it("reactivates, clears every link of the organisation and logs who did it", async () => {
    m.findUnique.mockResolvedValueOnce({ id: "a1", isActive: true, organizationId: "org-1", orgReactivationExpiresAt: new Date(Date.now() + 3_600_000), organization: deactivated })
    const { POST } = await import("@/app/api/public/org-reactivation/confirm/route")
    const res = await POST(json("http://localhost/x", { token: secret }))
    expect(await res.json()).toEqual({ ok: true, organizationName: "Fête du village" })
    expect(m.findUnique.mock.calls[0][0].where).toEqual({ orgReactivationTokenHash: hashToken(secret) })
    expect(m.orgUpdate).toHaveBeenCalledWith({ where: { id: "org-1" }, data: expect.objectContaining({ active: true, inactivityDeactivatedAt: null }) })
    expect(m.adminUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1" }) }))
    expect(m.orgLog).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "organization.reactivated_after_inactivity", actorId: "a1", organizationId: "org-1" }) })
  })

  it("spends an expired link without reactivating, and refuses an unknown one", async () => {
    m.findUnique.mockResolvedValueOnce({ id: "a1", isActive: true, organizationId: "org-1", orgReactivationExpiresAt: new Date(Date.now() - 1000), organization: deactivated })
    const { POST } = await import("@/app/api/public/org-reactivation/confirm/route")
    expect((await POST(json("http://localhost/x", { token: secret }))).status).toBe(400)
    expect(m.adminUpdate).toHaveBeenCalledWith({ where: { id: "a1" }, data: { orgReactivationTokenHash: null, orgReactivationExpiresAt: null } })
    expect(m.orgUpdate).not.toHaveBeenCalled()

    m.findUnique.mockResolvedValueOnce(null)
    expect((await POST(json("http://localhost/x", { token: secret }))).status).toBe(400)
    expect((await POST(json("http://localhost/x", { token: "short" }))).status).toBe(400)
  })

  it("never reactivates a suspended space, even with a valid link", async () => {
    m.findUnique.mockResolvedValueOnce({ id: "a1", isActive: true, organizationId: "org-1", orgReactivationExpiresAt: new Date(Date.now() + 3_600_000), organization: { ...deactivated, suspendedAt: new Date() } })
    const { POST } = await import("@/app/api/public/org-reactivation/confirm/route")
    expect((await POST(json("http://localhost/x", { token: secret }))).status).toBe(400)
    expect(m.orgUpdate).not.toHaveBeenCalled()
  })
})
