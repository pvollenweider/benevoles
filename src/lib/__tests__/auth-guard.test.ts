import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock("@/auth", () => ({ auth: authMock }))

const { firstOrgMock, findUniqueOrgMock } = vi.hoisted(() => ({
  firstOrgMock: vi.fn(),
  findUniqueOrgMock: vi.fn(),
}))
vi.mock("../prisma", () => ({
  prisma: {
    $extends: () => ({ __scoped: true }),
    organization: { findFirst: firstOrgMock, findUnique: findUniqueOrgMock },
  },
}))

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: cookiesMock }))

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
}))
vi.mock("next/navigation", () => ({ redirect: redirectMock }))

function withSaCookie(value: string | undefined) {
  cookiesMock.mockResolvedValue({ get: (name: string) => (name === "sa-org-id" && value ? { value } : undefined) })
}

import { requireOrgSession, requireSuperAdmin, getOrgContext } from "../auth-guard"

describe("requireOrgSession", () => {
  beforeEach(() => {
    authMock.mockReset()
    firstOrgMock.mockReset()
    findUniqueOrgMock.mockReset()
    findUniqueOrgMock.mockResolvedValue({ active: true })
    cookiesMock.mockResolvedValue({ get: () => undefined })
  })

  it("returns 401 when no session", async () => {
    authMock.mockResolvedValue(null)
    const result = await requireOrgSession()
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
  })

  it("returns 403 when the admin's organization is disabled", async () => {
    authMock.mockResolvedValue({ user: { role: "admin", organizationId: "org-A" } })
    findUniqueOrgMock.mockResolvedValue({ active: false })
    const result = await requireOrgSession()
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
  })

  it("returns 403 for an org admin without organizationId", async () => {
    authMock.mockResolvedValue({ user: { role: "admin", organizationId: null } })
    const result = await requireOrgSession()
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
  })

  // Regression (#267): used to fall back silently to the oldest organization.
  it("rejects a super_admin with no organization selected, without falling back", async () => {
    authMock.mockResolvedValue({ user: { role: "super_admin", organizationId: null } })
    firstOrgMock.mockResolvedValue({ id: "first-org" })
    const result = await requireOrgSession()
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(409)
    expect(firstOrgMock).not.toHaveBeenCalled()
  })

  it("rejects a super_admin whose selected organization no longer exists", async () => {
    authMock.mockResolvedValue({ user: { role: "super_admin", organizationId: null } })
    withSaCookie("deleted-org")
    findUniqueOrgMock.mockResolvedValue(null)
    const result = await requireOrgSession()
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(409)
  })

  it("scopes a super_admin to the organization they selected", async () => {
    authMock.mockResolvedValue({ user: { role: "super_admin", organizationId: null } })
    withSaCookie("org-picked")
    findUniqueOrgMock.mockResolvedValue({ id: "org-picked" })
    const result = await requireOrgSession()
    expect(result).not.toBeInstanceOf(NextResponse)
    if (result instanceof NextResponse) return
    expect(result.organizationId).toBe("org-picked")
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
    firstOrgMock.mockReset()
    findUniqueOrgMock.mockReset()
    findUniqueOrgMock.mockResolvedValue({ active: true })
    cookiesMock.mockResolvedValue({ get: () => undefined })
  })

  it("returns null when the admin's organization is disabled", async () => {
    authMock.mockResolvedValue({ user: { role: "admin", organizationId: "org-B" } })
    findUniqueOrgMock.mockResolvedValue({ active: false })
    const result = await getOrgContext()
    expect(result).toBeNull()
  })

  it("returns null when not authenticated", async () => {
    authMock.mockResolvedValue(null)
    const result = await getOrgContext()
    expect(result).toBeNull()
  })

  it("returns null when an org admin has no organizationId", async () => {
    authMock.mockResolvedValue({ user: { role: "admin", organizationId: null } })
    const result = await getOrgContext()
    expect(result).toBeNull()
  })

  // Regression (#267): used to fall back silently to the oldest organization.
  it("redirects a super_admin with no organization selected to the org picker", async () => {
    authMock.mockResolvedValue({ user: { role: "super_admin", organizationId: null } })
    firstOrgMock.mockResolvedValue({ id: "first-org" })
    await expect(getOrgContext()).rejects.toThrow("NEXT_REDIRECT:/super-admin/organizations")
    expect(firstOrgMock).not.toHaveBeenCalled()
  })

  it("scopes a super_admin to the organization they selected", async () => {
    authMock.mockResolvedValue({ user: { role: "super_admin", organizationId: null } })
    withSaCookie("org-picked")
    findUniqueOrgMock.mockResolvedValue({ id: "org-picked" })
    const result = await getOrgContext()
    expect(result?.organizationId).toBe("org-picked")
  })

  it("returns scoped client when admin has an organizationId", async () => {
    authMock.mockResolvedValue({ user: { role: "admin", organizationId: "org-B" } })
    const result = await getOrgContext()
    expect(result).not.toBeNull()
    expect(result?.organizationId).toBe("org-B")
    expect(result?.db).toBeDefined()
  })
})
