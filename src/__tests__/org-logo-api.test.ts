import { describe, it, expect, vi, beforeEach } from "vitest"
import sharp from "sharp"
import { NextResponse } from "next/server"
import { LOGO_ERRORS, logoVersion } from "@/lib/org-logo"

// Organization logo (#300): the owners' upload/remove route and the public image route.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const logOrgEvent = vi.hoisted(() => vi.fn())
vi.mock("@/lib/org-log", () => ({ logOrgEvent, adminActor: () => ({ type: "admin", id: "adm-a" }) }))

const findFirst = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { organizationLogo: { findFirst } } }))

const HASH = "c".repeat(64)

function scopedDb() {
  return {
    organizationLogo: {
      upsert: vi.fn(async ({ create }: { create: { hash: string; width: number; height: number } }) => ({ hash: create.hash, width: create.width, height: create.height })),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }
}

function put(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/admin/settings/organization/logo", { method: "PUT", body, headers })
}

describe("PUT /api/admin/settings/organization/logo", () => {
  beforeEach(() => vi.clearAllMocks())

  it("stores the processed image for the session's organization and logs it", async () => {
    const db = scopedDb()
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    const { PUT } = await import("@/app/api/admin/settings/organization/logo/route")
    const png = await sharp({ create: { width: 1024, height: 512, channels: 3, background: "#123456" } }).png().toBuffer()

    const res = await PUT(put(new Uint8Array(png), { "Content-Type": "image/png" }))
    expect(res.status).toBe(200)
    expect(requireOrgSessionMock).toHaveBeenCalledWith("owner")
    const { logo } = await res.json()
    expect(logo).toMatchObject({ width: 512, height: 256 })
    expect(logo.src).toMatch(/^\/api\/public\/organizations\/org-a\/logo\?v=[0-9a-f]{16}$/)

    const call = db.organizationLogo.upsert.mock.calls[0][0] as unknown as { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }
    expect(call.where).toEqual({ organizationId: "org-a" })
    expect(call.create).toMatchObject({ organizationId: "org-a", mimeType: "image/png", width: 512, height: 256 })
    expect(call.update).not.toHaveProperty("organizationId")
    expect(logOrgEvent).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a", action: "organization.logo_updated", entityType: "Organization" }))
  })

  it("refuses an SVG (400) without storing anything", async () => {
    const db = scopedDb()
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    const { PUT } = await import("@/app/api/admin/settings/organization/logo/route")
    const res = await PUT(put('<svg xmlns="http://www.w3.org/2000/svg"/>', { "Content-Type": "image/png" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(LOGO_ERRORS.svg)
    expect(db.organizationLogo.upsert).not.toHaveBeenCalled()
  })

  it("refuses an announced size over 2 MB (413) before reading the body", async () => {
    const db = scopedDb()
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    const { PUT } = await import("@/app/api/admin/settings/organization/logo/route")
    const res = await PUT(put("x", { "Content-Length": String(3 * 1024 * 1024) }))
    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe(LOGO_ERRORS.tooLarge)
    expect(db.organizationLogo.upsert).not.toHaveBeenCalled()
  })

  it("refuses an actual body over 2 MB (413)", async () => {
    const db = scopedDb()
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    const { PUT } = await import("@/app/api/admin/settings/organization/logo/route")
    const big = new Uint8Array(2 * 1024 * 1024 + 10)
    big.set([0xff, 0xd8, 0xff])
    expect((await PUT(put(big))).status).toBe(413)
    expect(db.organizationLogo.upsert).not.toHaveBeenCalled()
  })

  it("is refused to an organizer (the guard's 403 is returned as is)", async () => {
    requireOrgSessionMock.mockResolvedValue(NextResponse.json({ error: "Réservé aux propriétaires" }, { status: 403 }))
    const { PUT, DELETE } = await import("@/app/api/admin/settings/organization/logo/route")
    expect((await PUT(put("x"))).status).toBe(403)
    expect((await DELETE()).status).toBe(403)
  })
})

describe("DELETE /api/admin/settings/organization/logo", () => {
  beforeEach(() => vi.clearAllMocks())

  it("removes only the session organization's logo and logs it", async () => {
    const db = scopedDb()
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    const { DELETE } = await import("@/app/api/admin/settings/organization/logo/route")
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ logo: null })
    expect(requireOrgSessionMock).toHaveBeenCalledWith("owner")
    expect(db.organizationLogo.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-a" } })
    expect(logOrgEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "organization.logo_removed" }))
  })

  it("logs nothing when there was no logo", async () => {
    const db = scopedDb()
    db.organizationLogo.deleteMany.mockResolvedValue({ count: 0 })
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    const { DELETE } = await import("@/app/api/admin/settings/organization/logo/route")
    expect((await DELETE()).status).toBe(200)
    expect(logOrgEvent).not.toHaveBeenCalled()
  })
})

describe("GET /api/public/organizations/[id]/logo", () => {
  beforeEach(() => vi.clearAllMocks())
  const params = (id: string) => ({ params: Promise.resolve({ id }) })
  const get = (url: string, headers: Record<string, string> = {}) => new Request(`http://localhost${url}`, { headers })

  it("serves the logo of that organization only, while it is active", async () => {
    findFirst.mockResolvedValue({ data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mimeType: "image/png", hash: HASH })
    const { GET } = await import("@/app/api/public/organizations/[id]/logo/route")
    const res = await GET(get(`/api/public/organizations/org-a/logo?v=${logoVersion(HASH)}`), params("org-a"))
    expect(res.status).toBe(200)
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-a", organization: { active: true } } }))
    expect(res.headers.get("Content-Type")).toBe("image/png")
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable")
    expect(res.headers.get("ETag")).toBe(`"${HASH}"`)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  })

  it("gives an old or missing version the current image, revalidated", async () => {
    findFirst.mockResolvedValue({ data: new Uint8Array([1]), mimeType: "image/jpeg", hash: HASH })
    const { GET } = await import("@/app/api/public/organizations/[id]/logo/route")
    const res = await GET(get("/api/public/organizations/org-a/logo?v=0123456789abcdef"), params("org-a"))
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600, must-revalidate")
  })

  it("answers 304 to a matching If-None-Match", async () => {
    findFirst.mockResolvedValue({ data: new Uint8Array([1]), mimeType: "image/png", hash: HASH })
    const { GET } = await import("@/app/api/public/organizations/[id]/logo/route")
    const res = await GET(get("/api/public/organizations/org-a/logo", { "If-None-Match": `"${HASH}"` }), params("org-a"))
    expect(res.status).toBe(304)
    expect(await res.text()).toBe("")
  })

  it("is a 404 for an organization without a logo, deactivated, deleted or unknown", async () => {
    findFirst.mockResolvedValue(null)
    const { GET } = await import("@/app/api/public/organizations/[id]/logo/route")
    const res = await GET(get("/api/public/organizations/org-x/logo"), params("org-x"))
    expect(res.status).toBe(404)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
  })
})
