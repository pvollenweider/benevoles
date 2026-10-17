import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextResponse } from "next/server"

// The super admin's organization switch (#1048): a POST only (the proxy checks its origin), the
// sa-org-id cookie (Lax, so that an admin link opened from a webmail carries it), then the
// requested admin page on the configured site address, never another site nor a forwarded host.

const requireSuperAdminMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: requireSuperAdminMock }))

const findUnique = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findUnique } } }))

const setCookie = vi.hoisted(() => vi.fn())
vi.mock("next/headers", () => ({ cookies: async () => ({ set: setCookie }) }))

import { GET, POST } from "@/app/api/super-admin/use-org/[id]/route"

const forged = { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https", host: "evil.example" }

const post = (opts: { query?: string; id?: string; form?: Record<string, string> } = {}) => {
  const { query = "", id = "org-1", form } = opts
  return POST(new Request(`http://localhost/api/super-admin/use-org/${id}${query}`, {
    method: "POST",
    headers: { ...forged, ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  }), { params: Promise.resolve({ id }) })
}

describe("POST /api/super-admin/use-org/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.benevol.app")
    requireSuperAdminMock.mockResolvedValue({ session: { user: { role: "super_admin" } } })
    findUnique.mockResolvedValue({ id: "org-1" })
  })
  afterEach(() => vi.unstubAllEnvs())

  it("sets a Lax, httpOnly sa-org-id cookie", async () => {
    await post()
    expect(setCookie).toHaveBeenCalledWith("sa-org-id", "org-1", expect.objectContaining({
      path: "/", httpOnly: true, sameSite: "lax",
    }))
  })

  it("goes to the events list without next, with a 303 on the configured address", async () => {
    const res = await post()
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("https://www.benevol.app/admin/events")
  })

  it("lands on the page named by the confirmation form", async () => {
    const res = await post({ form: { next: "/admin/events/ev1/questions?x=1" } })
    expect(res.headers.get("location")).toBe("https://www.benevol.app/admin/events/ev1/questions?x=1")
  })

  it("also reads next from the address", async () => {
    const res = await post({ query: `?next=${encodeURIComponent("/admin/events/ev1")}` })
    expect(res.headers.get("location")).toBe("https://www.benevol.app/admin/events/ev1")
  })

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/admin/%2F%2Fevil.example", "/super-admin/organizations"])(
    "refuses next=%s and goes to the events list",
    async (next) => {
      const res = await post({ form: { next } })
      expect(res.headers.get("location")).toBe("https://www.benevol.app/admin/events")
    },
  )

  it("rejects a caller who is not super admin, without setting the cookie", async () => {
    requireSuperAdminMock.mockResolvedValue(NextResponse.json({ error: "Non autorisé" }, { status: 401 }))
    const res = await post({ form: { next: "https://evil.example" } })
    expect(res.status).toBe(401)
    expect(res.headers.get("location")).toBeNull()
    expect(setCookie).not.toHaveBeenCalled()
  })

  it("answers 404 for an unknown organization", async () => {
    findUnique.mockResolvedValue(null)
    const res = await post({ id: "nope", form: { next: "/admin/events/ev1" } })
    expect(res.status).toBe(404)
    expect(setCookie).not.toHaveBeenCalled()
  })
})

describe("GET /api/super-admin/use-org/[id] (address used before #1048)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.benevol.app")
    requireSuperAdminMock.mockResolvedValue({ session: { user: { role: "super_admin" } } })
  })
  afterEach(() => vi.unstubAllEnvs())

  const get = (query = "") => GET(new Request(`http://localhost/api/super-admin/use-org/org-1${query}`, { headers: forged }), { params: Promise.resolve({ id: "org-1" }) })

  it("changes nothing and opens the confirmation page (regression #1048)", async () => {
    const res = await get(`?next=${encodeURIComponent("/admin/events/ev1")}`)
    expect(setCookie).not.toHaveBeenCalled()
    expect(findUnique).not.toHaveBeenCalled()
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("https://www.benevol.app/super-admin/use-org/org-1?next=%2Fadmin%2Fevents%2Fev1")
  })

  it("rejects a caller who is not super admin", async () => {
    requireSuperAdminMock.mockResolvedValue(NextResponse.json({ error: "Non autorisé" }, { status: 401 }))
    expect((await get()).status).toBe(401)
  })
})
