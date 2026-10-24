import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashToken } from "@/lib/token-hash"

const findUnique = vi.hoisted(() => vi.fn())
// The activation consumes the link with a conditional updateMany (count 0: lost to another request).
const update = vi.hoisted(() => vi.fn())
const bcryptHash = vi.hoisted(() => vi.fn(async () => "hashed"))
const orgUpdateMany = vi.hoisted(() => vi.fn())
const orgLogCreate = vi.hoisted(() => vi.fn())
const queryRaw = vi.hoisted(() => vi.fn())
const editedRows = vi.hoisted(() => [] as unknown[])
const txOrder = vi.hoisted(() => [] as string[])
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique, updateMany: update },
    organization: { updateMany: orgUpdateMany },
    orgLog: { create: orgLogCreate },
    $queryRaw: queryRaw,
    async $transaction(fn: (tx: unknown) => unknown) { txOrder.push("begin"); const out = await fn(this); txOrder.push("commit"); return out },
  },
}))
vi.mock("bcryptjs", () => ({ default: { hash: bcryptHash } }))
const enqueued = vi.hoisted(() => [] as unknown[])
const delivered = vi.hoisted(() => [] as unknown[])
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock("@/lib/notifications/outbox", () => ({
  // Stored with the transaction (#352); what matters is the payload queued.
  enqueueNotifications: async (payloads: unknown[]) => { enqueued.push(...payloads); return payloads.map((_, i) => `row-${i}`) },
  deliverAfterResponse: (ids: unknown[]) => { delivered.push(...ids) },
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

// A fresh address per request: the activation budget is per address and per link.
function post(body: unknown, ip = `t-${Math.random()}`) {
  return new Request("http://localhost/api/admin/accept-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  })
}

describe("accept-invite: read-only precheck matches what POST would do", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    update.mockResolvedValue({ count: 1 })
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
        where: expect.objectContaining({ id: admin.id, setupTokenHash: hashToken("good-token") }),
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
    update.mockImplementation(async () => { txOrder.push("activate"); return { count: 1 } })
    orgUpdateMany.mockImplementation(async () => { txOrder.push("reply-to"); return { count: 1 } })
    orgLogCreate.mockImplementation(async () => { txOrder.push("log"); return {} })
    editedRows.length = 0
    queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
      if (sql.join("?").includes("FOR UPDATE")) { txOrder.push("lock"); return [] }
      txOrder.push("edited?")
      return editedRows
    })
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
    expect(txOrder).toEqual(["begin", "activate", "lock", "edited?", "reply-to", "log", "commit"])
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
    editedRows.push({ "?column?": 1 })
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

describe("accept-invite: the link is consumed once, atomically", () => {
  const password = "Correct-Horse-Battery9!"

  beforeEach(() => {
    vi.clearAllMocks()
    enqueued.length = 0
    delivered.length = 0
    update.mockResolvedValue({ count: 1 })
    orgUpdateMany.mockResolvedValue({ count: 1 })
    queryRaw.mockResolvedValue([])
  })

  it("consumes only while the account still carries this token, unexpired", async () => {
    findUnique.mockResolvedValue(admin)
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    await POST(post({ token: "atomic-token", password }))
    expect(update.mock.calls[0][0].where).toEqual({
      id: admin.id,
      setupTokenHash: hashToken("atomic-token"),
      OR: [{ setupTokenExpiresAt: null }, { setupTokenExpiresAt: { gt: expect.any(Date) } }],
    })
  })

  it("a request that lost the race changes nothing and queues no welcome email", async () => {
    // Valid at lookup, consumed by a concurrent request before the conditional update.
    findUnique.mockResolvedValueOnce({ ...admin, role: "admin" }).mockResolvedValueOnce(null)
    update.mockResolvedValue({ count: 0 })
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    const res = await POST(post({ token: "raced-token", password }))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toMatch(/invalide ou déjà utilisé/)
    expect(queryRaw).not.toHaveBeenCalled()
    expect(orgUpdateMany).not.toHaveBeenCalled()
    expect(orgLogCreate).not.toHaveBeenCalled()
    expect(enqueued).toHaveLength(0)
    expect(delivered).toHaveLength(0)
  })

  it("a link that expired while the password was hashed is refused as expired", async () => {
    findUnique
      .mockResolvedValueOnce(admin)
      .mockResolvedValueOnce({ ...admin, setupTokenExpiresAt: new Date(Date.now() - 1) })
    update.mockResolvedValue({ count: 0 })
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    const res = await POST(post({ token: "expiring-token", password }))
    expect(res.status).toBe(410)
    expect(enqueued).toHaveLength(0)
  })

  it("a normal activation still queues exactly one welcome email", async () => {
    findUnique.mockResolvedValue(admin)
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    const res = await POST(post({ token: "welcome-token", password }))
    expect(res.status).toBe(200)
    expect(enqueued).toEqual([expect.objectContaining({ kind: "admin_welcome", dedupeKey: `admin_welcome:${admin.id}` })])
    expect(delivered).toHaveLength(1)
  })
})

describe("accept-invite: activation POST is rate limited", () => {
  const password = "Correct-Horse-Battery9!"

  beforeEach(() => {
    vi.clearAllMocks()
    update.mockResolvedValue({ count: 1 })
    findUnique.mockResolvedValue(admin)
  })

  it("past the budget of one link, answers 429 before bcrypt and before any account change", async () => {
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    const { ACTIVATION_MAX_PER_TOKEN } = await import("@/lib/activation-budget")
    for (let i = 0; i < ACTIVATION_MAX_PER_TOKEN; i++) await POST(post({ token: "hammered-token", password }))
    vi.clearAllMocks()
    const res = await POST(post({ token: "hammered-token", password }))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toMatch(/Trop de tentatives/)
    expect(findUnique).not.toHaveBeenCalled()
    expect(bcryptHash).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it("parallel requests on one link: only the budget reaches bcrypt", async () => {
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    const { ACTIVATION_MAX_PER_TOKEN } = await import("@/lib/activation-budget")
    const res = await Promise.all(Array.from({ length: 15 }, () => POST(post({ token: "parallel-token", password }))))
    expect(res.filter((r) => r.status === 429)).toHaveLength(15 - ACTIVATION_MAX_PER_TOKEN)
    expect(bcryptHash).toHaveBeenCalledTimes(ACTIVATION_MAX_PER_TOKEN)
  })

  it("one address past its budget with made-up links doesn't block someone else's activation", async () => {
    findUnique.mockResolvedValue(null)
    const { POST } = await import("@/app/api/admin/accept-invite/route")
    const { ACTIVATION_MAX_PER_IP } = await import("@/lib/activation-budget")
    for (let i = 0; i < ACTIVATION_MAX_PER_IP; i++) {
      expect((await POST(post({ token: `made-up-${i}`, password }, "66.6.6.6"))).status).toBe(404)
    }
    expect((await POST(post({ token: "made-up-x", password }, "66.6.6.6"))).status).toBe(429)
    findUnique.mockResolvedValue(admin)
    expect((await POST(post({ token: "real-token", password }, "77.7.7.7"))).status).toBe(200)
  })

  it("the GET precheck keeps its own limit", async () => {
    const { GET } = await import("@/app/api/admin/accept-invite/route")
    const req = () => new Request("http://localhost/api/admin/accept-invite?token=t", { headers: { "x-forwarded-for": "88.8.8.8" } })
    for (let i = 0; i < 30; i++) expect((await GET(req())).status).toBe(200)
    expect((await GET(req())).status).toBe(429)
  })
})
