import { describe, it, expect, vi, beforeEach } from "vitest"

const findUnique = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { adminUser: { findUnique, update } },
}))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))

const admin = {
  id: "admin-1",
  name: "Quentin",
  email: "quentin@example.com",
  setupTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  isActive: false,
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
        data: expect.objectContaining({ isActive: true, setupToken: null, setupTokenExpiresAt: null }),
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
