import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))

vi.mock("@/auth", () => ({ auth: authMock }))

vi.mock("../prisma", () => ({
  prisma: {
    $extends: () => ({ __scoped: true }),
  },
}))

import { requireOrgSession, requireSuperAdmin, getOrgContext } from "../auth-guard"

describe("requireOrgSession", () => {
  beforeEach(() => {
    authMock.mockReset()
  })

  it("returns 401 when no session", async () => {
    authMock.mockResolvedValue(null)
    const result = await requireOrgSession()
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
  })

  it("returns 403 when user has no organizationId (e.g. super admin)", async () => {
    authMock.mockResolvedValue({ user: { role: "super_admin", organizationId: null } })
    const result = await requireOrgSession()
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
  })

  it("returns scoped client when admin has an organizationId", async () => {
    authMock.mockResolvedValue({ user: { role: "admin", organizationId: "org-A" } })
    const result = await requireOrgSession()
    expect(result).not.toBeInstanceOf(NextResponse)
    if (result instanceof NextResponse) return
    expect(result.organizationId).toBe("org-A")
    expect(result.db).toBeDefined()
  })
})

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    authMock.mockReset()
  })

  it("returns 401 when no session", async () => {
    authMock.mockResolvedValue(null)
    const result = await requireSuperAdmin()
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
  })

  it("returns 403 when user is not super_admin", async () => {
    authMock.mockResolvedValue({ user: { role: "admin", organizationId: "org-A" } })
    const result = await requireSuperAdmin()
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
  })

  it("returns the unscoped client when user is super_admin", async () => {
    authMock.mockResolvedValue({ user: { role: "super_admin", organizationId: null } })
    const result = await requireSuperAdmin()
    expect(result).not.toBeInstanceOf(NextResponse)
    if (result instanceof NextResponse) return
    expect(result.session).toBeDefined()
    expect(result.db).toBeDefined()
  })
})

describe("getOrgContext (SSR helper)", () => {
  beforeEach(() => {
    authMock.mockReset()
  })

  it("returns null when not authenticated", async () => {
    authMock.mockResolvedValue(null)
    const result = await getOrgContext()
    expect(result).toBeNull()
  })

  it("returns null when user has no organizationId", async () => {
    authMock.mockResolvedValue({ user: { role: "super_admin", organizationId: null } })
    const result = await getOrgContext()
    expect(result).toBeNull()
  })

  it("returns scoped client when admin has an organizationId", async () => {
    authMock.mockResolvedValue({ user: { role: "admin", organizationId: "org-B" } })
    const result = await getOrgContext()
    expect(result).not.toBeNull()
    expect(result?.organizationId).toBe("org-B")
    expect(result?.db).toBeDefined()
  })
})
