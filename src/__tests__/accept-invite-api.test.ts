import { describe, it, expect, vi, beforeEach } from "vitest"

const findUnique = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
const orgUpdateMany = vi.hoisted(() => vi.fn())
const orgLogCreate = vi.hoisted(() => vi.fn())
const queryRaw = vi.hoisted(() => vi.fn())
const txOrder = vi.hoisted(() => [] as string[])
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique, update },
    organization: { updateMany: orgUpdateMany },
    orgLog: { create: orgLogCreate },
    $queryRaw: queryRaw,
    async $transaction(fn: (tx: unknown) => unknown) { txOrder.push("begin"); const out = await fn(this); txOrder.push("commit"); return out },
  },
}))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock("@/lib/notifications/outbox", () => ({
  // Stored with the transaction (#352); what matters is the payload queued.
  enqueueNotifications: async (payloads: unknown[]) => { payloads.forEach((p) => void(p)); return payloads.map((_, i) => `row-${i}`) },
  deliverAfterResponse: () => {},
}))

const admin = {
  id: "admin-1",
  name: "Quentin",
  email: "quentin@example.com",
  setupTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  isActive: false,
  role: "organizer",
  organizationId: "org-1",
  organization: { name: "RFC Nalinnois", slug: "rfcn" },
}

function get(token: string) {
  return new Request(`http://localhost/api/admin/accept-invite?token=${encodeURIComponent(token)}`)
}

function post(body: unknown) {
  return new Request("http://localhost/api/admin/accept-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("accept-invite: read-only precheck matches what POST would do", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    update.mockResolvedValue({})
  })

  it("GET reports a valid, unexpired token without consuming it", async () => {
    findUnique.mockResolvedValue(admin)
    const { GET } = await import("@/app/api/admin/accept-invite/route")
    const res = await GET(get("good-token"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ valid: true })
    expect(update).not.toHaveBeenCalled()
  })

  it("GET reports an unknown token as invalid (already used or never existed)", async () => {
    findUnique.mockResolvedValue(null)
    const { GET } = await import("@/app/api/admin/accept-invite/route")
    const res = await GET(get("dead-token"))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.valid).toBe(false)
    expect(data.error).toMatch(/invalide ou déjà utilisé/)
  })

  it("GET reports an expired token distinctly from an unknown one", async () => {
    findUnique.mockResolvedValue({ ...admin, setupTokenExpiresAt: new Date(Date.now() - 1000) })
    const { GET } = await import("@/app/api/admin/accept-invite/route")
    const res = await GET(get("expired-token"))
    expect(res.status).toBe(410)
    const data = await res.json()
    expect(data.valid).toBe(false)
    expect(data.error).toMatch(/expiré/)
  })

  it("GET without a token is invalid", async () => {
    const { GET } = await import("@/app/api/admin/accept-invite/route")
    const res = await GET(new Request("http://localhost/api/admin/accept-invite"))
    expect(res.status).toBe(404)
    expect((await res.json()).valid).toBe(false)
  })

  it("POST still activates the account on a valid token and clears it", async () => {
    findUnique.mockResolvedValue(admin)
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    const res = await POST(post({ token: "good-token", password: "Correct-Horse-Battery9!" }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: admin.id },
        data: expect.objectContaining({ isActive: true, setupTokenHash: null, setupTokenExpiresAt: null }),
      }),
    )
  })

  it("POST rejects an expired token with the same message as GET", async () => {
    findUnique.mockResolvedValue({ ...admin, setupTokenExpiresAt: new Date(Date.now() - 1000) })
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    const res = await POST(post({ token: "expired-token", password: "Correct-Horse-Battery9!" }))
    expect(res.status).toBe(410)
    expect((await res.json()).error).toMatch(/expiré/)
    expect(update).not.toHaveBeenCalled()
  })
})

describe("accept-invite: token stored hashed (#269)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("looks the admin up by the SHA-256 of the token from the link, never the token itself", async () => {
    findUnique.mockResolvedValue(null)
    const { GET } = await import("@/app/api/admin/accept-invite/route")
    await GET(get("abc"))
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { setupTokenHash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" },
    }))
  })
})

describe("accept-invite: an owner's activation fills a missing reply-to (#1077)", () => {
  const owner = { ...admin, id: "owner-1", email: "Julie@Asso.CH", role: "admin" }
  const password = "Correct-Horse-Battery9!"

  beforeEach(() => {
    vi.clearAllMocks()
    txOrder.length = 0
    update.mockImplementation(async () => { txOrder.push("activate"); return {} })
    orgUpdateMany.mockImplementation(async () => { txOrder.push("reply-to"); return { count: 1 } })
    orgLogCreate.mockImplementation(async () => { txOrder.push("log"); return {} })
    queryRaw.mockImplementation(async () => { txOrder.push("edited?"); return [] })
  })

  it("sets the owner's address only while the organization has none, in the activation transaction", async () => {
    findUnique.mockResolvedValue(owner)
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    const res = await POST(post({ token: "owner-token", password }))
    expect(res.status).toBe(200)
    expect(orgUpdateMany).toHaveBeenCalledWith({
      where: { id: "org-1", replyToEmail: null },
      data: { replyToEmail: "julie@asso.ch" },
    })
    expect(txOrder).toEqual(["begin", "activate", "edited?", "reply-to", "log", "commit"])
  })

  it("logs it in the organization's activity without the address", async () => {
    findUnique.mockResolvedValue(owner)
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    await POST(post({ token: "owner-token", password }))
    expect(orgLogCreate).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        actorType: "admin",
        actorId: "owner-1",
        action: "organization.reply_to_defaulted",
        entityType: "Organization",
        entityId: "org-1",
      },
    })
    expect(JSON.stringify(orgLogCreate.mock.calls)).not.toMatch(/julie/i)
  })

  it("does nothing for an organiser's activation", async () => {
    findUnique.mockResolvedValue({ ...admin, role: "organizer" })
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    const res = await POST(post({ token: "organizer-token", password }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalled()
    expect(queryRaw).not.toHaveBeenCalled()
    expect(orgUpdateMany).not.toHaveBeenCalled()
    expect(orgLogCreate).not.toHaveBeenCalled()
  })

  it("leaves an existing reply-to untouched and logs nothing (already set, or set by an earlier owner)", async () => {
    // The conditional update matches no row when replyToEmail is not null.
    orgUpdateMany.mockResolvedValue({ count: 0 })
    findUnique.mockResolvedValue({ ...owner, id: "owner-2", email: "second@asso.ch" })
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    const res = await POST(post({ token: "second-owner-token", password }))
    expect(res.status).toBe(200)
    expect(orgUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "org-1", replyToEmail: null } }))
    expect(orgLogCreate).not.toHaveBeenCalled()
  })

  it("keeps a reply-to an owner cleared in the settings empty", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }])
    findUnique.mockResolvedValue(owner)
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    const res = await POST(post({ token: "owner-token", password }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalled()
    expect(orgUpdateMany).not.toHaveBeenCalled()
    expect(orgLogCreate).not.toHaveBeenCalled()
  })

  it("only ever touches the activated admin's own organization", async () => {
    findUnique.mockResolvedValue({ ...owner, organizationId: "org-2" })
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    await POST(post({ token: "owner-token", password }))
    expect(orgUpdateMany).toHaveBeenCalledTimes(1)
    expect(orgUpdateMany.mock.calls[0][0].where.id).toBe("org-2")
    expect(orgLogCreate.mock.calls[0][0].data.organizationId).toBe("org-2")
  })
})
