import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

// The super admin's organization switch: the sa-org-id cookie (Lax, so that an admin link opened
// from a webmail carries it), then the requested admin page, never another site.

const requireSuperAdminMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: requireSuperAdminMock }))

const findUnique = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findUnique } } }))

const setCookie = vi.hoisted(() => vi.fn())
vi.mock("next/headers", () => ({ cookies: async () => ({ set: setCookie }) }))

import { GET } from "@/app/api/super-admin/use-org/[id]/route"

const call = (query = "", id = "org-1") =>
  GET(new Request(`http://localhost/api/super-admin/use-org/${id}${query}`, {
    headers: { "x-forwarded-host": "www.benevol.app", "x-forwarded-proto": "https" },
  }), { params: Promise.resolve({ id }) })

describe("GET /api/super-admin/use-org/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSuperAdminMock.mockResolvedValue({ session: { user: { role: "super_admin" } } })
    findUnique.mockResolvedValue({ id: "org-1" })
  })

  it("sets a Lax, httpOnly sa-org-id cookie", async () => {
    await call()
    expect(setCookie).toHaveBeenCalledWith("sa-org-id", "org-1", expect.objectContaining({
      path: "/", httpOnly: true, sameSite: "lax",
    }))
  })

  it("goes to the events list without next", async () => {
    const res = await call()
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://www.benevol.app/admin/events")
  })

  it("lands on the requested admin page", async () => {
    const res = await call(`?next=${encodeURIComponent("/admin/events/ev1/questions?x=1")}`)
    expect(res.headers.get("location")).toBe("https://www.benevol.app/admin/events/ev1/questions?x=1")
  })

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/admin/%2F%2Fevil.example", "/super-admin/organizations"])(
    "refuses next=%s and goes to the events list",
    async (next) => {
      const res = await call(`?next=${encodeURIComponent(next)}`)
      expect(res.headers.get("location")).toBe("https://www.benevol.app/admin/events")
    },
  )

  it("rejects a caller who is not super admin, without setting the cookie", async () => {
    requireSuperAdminMock.mockResolvedValue(NextResponse.json({ error: "Non autorisé" }, { status: 401 }))
    const res = await call("?next=https://evil.example")
    expect(res.status).toBe(401)
    expect(res.headers.get("location")).toBeNull()
    expect(setCookie).not.toHaveBeenCalled()
  })

  it("answers 404 for an unknown organization", async () => {
    findUnique.mockResolvedValue(null)
    const res = await call("?next=/admin/events/ev1", "nope")
    expect(res.status).toBe(404)
    expect(setCookie).not.toHaveBeenCalled()
  })
})
