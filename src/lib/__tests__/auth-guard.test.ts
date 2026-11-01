import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock("@/auth", () => ({ auth: authMock }))

const { firstOrgMock, findUniqueOrgMock, findUniqueEventMock } = vi.hoisted(() => ({
  firstOrgMock: vi.fn(),
  findUniqueOrgMock: vi.fn(),
  findUniqueEventMock: vi.fn(),
}))
vi.mock("../prisma", () => ({
  prisma: {
    $extends: () => ({ __scoped: true }),
    organization: { findFirst: firstOrgMock, findUnique: findUniqueOrgMock },
    event: { findUnique: findUniqueEventMock },
  },
}))

const { cookiesMock, headersMock } = vi.hoisted(() => ({ cookiesMock: vi.fn(), headersMock: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: cookiesMock, headers: headersMock }))

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
}))
vi.mock("next/navigation", () => ({ redirect: redirectMock }))

/** The page being rendered, as src/proxy.ts passes it (x-benevoles-path). */
function onPage(path: string | null) {
  headersMock.mockResolvedValue(new Headers(path ? { "x-benevoles-path": path } : {}))
}

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
    findUniqueEventMock.mockReset()
    findUniqueEventMock.mockResolvedValue(null)
    cookiesMock.mockResolvedValue({ get: () => undefined })
    onPage(null)
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

  // An admin email link (e.g. /admin/events/<id>/questions) opened by the super admin.
  describe("super admin on an event page", () => {
    const page = "/admin/events/ev1/questions?x=1"
    const switchTo = `/super-admin/use-org/org-event?next=${encodeURIComponent(page)}`

    beforeEach(() => {
      authMock.mockResolvedValue({ user: { role: "super_admin", organizationId: null } })
      findUniqueEventMock.mockResolvedValue({ organizationId: "org-event" })
      onPage(page)
      redirectMock.mockClear()
    })

    it("switches to the event's organization when none is picked", async () => {
      await expect(getOrgContext()).rejects.toThrow(`NEXT_REDIRECT:${switchTo}`)
      expect(findUniqueEventMock).toHaveBeenCalledWith({ where: { id: "ev1" }, select: { organizationId: true } })
    })

    it("switches to the event's organization when another one is picked", async () => {
      withSaCookie("org-other")
      findUniqueOrgMock.mockResolvedValue({ id: "org-other" })
      await expect(getOrgContext()).rejects.toThrow(`NEXT_REDIRECT:${switchTo}`)
    })

    it("stays when the event's organization is already picked", async () => {
      withSaCookie("org-event")
      findUniqueOrgMock.mockResolvedValue({ id: "org-event" })
      const result = await getOrgContext()
      expect(result?.organizationId).toBe("org-event")
      expect(redirectMock).not.toHaveBeenCalledWith(expect.stringContaining("use-org"))
    })

    it("keeps the picker for an unknown event without a picked organization", async () => {
      findUniqueEventMock.mockResolvedValue(null)
      await expect(getOrgContext()).rejects.toThrow("NEXT_REDIRECT:/super-admin/organizations")
    })

    it("keeps the picked organization for an unknown event (the page answers not found)", async () => {
      findUniqueEventMock.mockResolvedValue(null)
      withSaCookie("org-other")
      findUniqueOrgMock.mockResolvedValue({ id: "org-other" })
      const result = await getOrgContext()
      expect(result?.organizationId).toBe("org-other")
    })

    it("keeps the picker on an admin page that is not an event's", async () => {
      onPage("/admin/members?verify=1")
      await expect(getOrgContext()).rejects.toThrow("NEXT_REDIRECT:/super-admin/organizations")
      expect(findUniqueEventMock).not.toHaveBeenCalled()
    })

    it("does not look the event up for an org admin, even on another org's event", async () => {
      authMock.mockResolvedValue({ user: { role: "admin", organizationId: "org-B" } })
      const result = await getOrgContext()
      expect(result?.organizationId).toBe("org-B")
      expect(findUniqueEventMock).not.toHaveBeenCalled()
      expect(headersMock).not.toHaveBeenCalled()
    })
  })
})

// Pentest F6: a super admin who only gave the password reaches no admin or super-admin route.
describe("second factor pending", () => {
  const pending = { user: { id: "sa-1", role: undefined, organizationId: null }, secondFactor: { pending: true, loginNonce: "n", authAt: 1 } }

  beforeEach(() => {
    authMock.mockReset()
    cookiesMock.mockResolvedValue({ get: () => undefined })
    redirectMock.mockClear()
  })

  it("requireSuperAdmin answers 401 with the reason", async () => {
    authMock.mockResolvedValue(pending)
    const result = await requireSuperAdmin()
    expect((result as NextResponse).status).toBe(401)
    expect(await (result as NextResponse).json()).toMatchObject({ code: "SECOND_FACTOR_REQUIRED" })
  })

  it("requireOrgSession answers 401 at every level, even with an organization picked", async () => {
    authMock.mockResolvedValue(pending)
    withSaCookie("org-A")
    for (const level of ["organizer", "owner"] as const) {
      const result = await requireOrgSession(level)
      expect((result as NextResponse).status).toBe(401)
    }
    expect(findUniqueOrgMock).not.toHaveBeenCalled()
  })

  it("getOrgContext sends an admin page to the two-factor step, back to the page afterwards", async () => {
    authMock.mockResolvedValue(pending)
    onPage("/admin/events/evt-1")
    await expect(getOrgContext()).rejects.toThrow("NEXT_REDIRECT:/admin/two-factor?callbackUrl=%2Fadmin%2Fevents%2Fevt-1")
  })

  it("lets a completed super admin session through", async () => {
    authMock.mockResolvedValue({ user: { id: "sa-1", role: "super_admin", organizationId: null }, secondFactor: { pending: false, loginNonce: "n", authAt: 1 } })
    const result = await requireSuperAdmin()
    expect(result).not.toBeInstanceOf(NextResponse)
  })
})
