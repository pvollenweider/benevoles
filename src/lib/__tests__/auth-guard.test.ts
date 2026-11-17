import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock("@/auth", () => ({ auth: authMock }))

const { firstOrgMock, findUniqueOrgMock, findUniqueEventMock } = vi.hoisted(() => ({
  firstOrgMock: vi.fn(),
  findUniqueOrgMock: vi.fn(),
  findUniqueEventMock: vi.fn(),
}))
const { grantFindFirstMock } = vi.hoisted(() => ({ grantFindFirstMock: vi.fn() }))
vi.mock("../prisma", () => ({
  prisma: {
    $extends: () => ({ __scoped: true }),
    organization: { findFirst: firstOrgMock, findUnique: findUniqueOrgMock },
    event: { findUnique: findUniqueEventMock },
    adminEventAccess: { findFirst: grantFindFirstMock },
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

import { requireOrgSession, requireSuperAdmin, getOrgContext, requireFrontDeskOrOrganizer } from "../auth-guard"

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

  it("over https, reads the organisation from the __Host- cookie only", async () => {
    vi.stubEnv("AUTH_URL", "https://www.benevol.app")
    try {
      authMock.mockResolvedValue({ user: { role: "super_admin", organizationId: null } })
      findUniqueOrgMock.mockResolvedValue({ id: "org-picked" })
      cookiesMock.mockResolvedValue({ get: (name: string) => (name === "__Host-sa-org-id" ? { value: "org-picked" } : undefined) })
      const result = await requireOrgSession()
      expect(result).not.toBeInstanceOf(NextResponse)
      if (result instanceof NextResponse) return
      expect(result.organizationId).toBe("org-picked")
      // The plain name is not read there.
      withSaCookie("org-picked")
      expect((await requireOrgSession()) as NextResponse).toBeInstanceOf(NextResponse)
    } finally {
      vi.unstubAllEnvs()
    }
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

// Front-desk access limited to one event (#1142): a stored role that is no admin level. Every
// guard and loader refuses it, except the one made for it, and only with a live grant.
describe("front-desk account", () => {
  const colette = { user: { id: "adm-colette", name: "Colette Favre", email: "colette.favre@example.org", role: "front_desk", organizationId: "org-fete" } }
  const grantRow = (over: Record<string, unknown> = {}) => ({
    id: "grant-1", adminUserId: "adm-colette", eventId: "evt-fete", organizationId: "org-fete", expiresAt: null, revokedAt: null,
    adminUser: { organizationId: "org-fete", isActive: true, role: "front_desk" },
    event: {
      id: "evt-fete", organizationId: "org-fete", publicStatus: "published", title: "Fête du village",
      startDate: new Date("2027-06-12T00:00:00Z"), endDate: new Date("2027-06-14T00:00:00Z"),
      organization: { name: "Fête du village", timeZone: "Europe/Zurich" },
    },
    ...over,
  })

  beforeEach(() => {
    authMock.mockReset()
    redirectMock.mockClear()
    findUniqueOrgMock.mockReset()
    findUniqueOrgMock.mockResolvedValue({ active: true })
    findUniqueEventMock.mockReset()
    grantFindFirstMock.mockReset()
    grantFindFirstMock.mockResolvedValue(null)
    cookiesMock.mockResolvedValue({ get: () => undefined })
    onPage("/admin/events/evt-fete/day-of")
    authMock.mockResolvedValue(colette)
  })

  it("requireOrgSession refuses it at both levels with 403, reading nothing", async () => {
    for (const level of ["organizer", "owner"] as const) {
      const result = await requireOrgSession(level)
      expect(result).toBeInstanceOf(NextResponse)
      expect((result as NextResponse).status).toBe(403)
    }
    expect(findUniqueOrgMock).not.toHaveBeenCalled()
    expect(grantFindFirstMock).not.toHaveBeenCalled()
  })

  it("requireSuperAdmin refuses it with 403", async () => {
    const result = await requireSuperAdmin()
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
  })

  it("getOrgContext gives it no context: it is sent to its landing page, whatever page was asked, reading nothing", async () => {
    await expect(getOrgContext()).rejects.toThrow("NEXT_REDIRECT:/admin/front-desk")
    onPage("/admin/settings/admins")
    await expect(getOrgContext()).rejects.toThrow("NEXT_REDIRECT:/admin/front-desk")
    expect(findUniqueOrgMock).not.toHaveBeenCalled()
    expect(grantFindFirstMock).not.toHaveBeenCalled()
  })

  it("getOrgContext does not let a live grant change that", async () => {
    grantFindFirstMock.mockResolvedValue(grantRow())
    await expect(getOrgContext()).rejects.toThrow("NEXT_REDIRECT:/admin/front-desk")
  })

  it("getOrgContext gives no context to a role that is no admin level at all", async () => {
    authMock.mockResolvedValue({ user: { id: "x", role: "volunteer", organizationId: "org-fete" } })
    expect(await getOrgContext()).toBeNull()
    authMock.mockResolvedValue({ user: { id: "x", organizationId: "org-fete" } })
    expect(await getOrgContext()).toBeNull()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  describe("requireFrontDeskOrOrganizer", () => {
    it("401 when signed out", async () => {
      authMock.mockResolvedValue(null)
      const result = await requireFrontDeskOrOrganizer("evt-fete")
      expect((result as NextResponse).status).toBe(401)
    })

    it("403 without a grant", async () => {
      const result = await requireFrontDeskOrOrganizer("evt-fete")
      expect(result).toBeInstanceOf(NextResponse)
      expect((result as NextResponse).status).toBe(403)
      expect(grantFindFirstMock).toHaveBeenCalledTimes(1)
    })

    it("accepts a live grant on that event, and says which kind of session it is", async () => {
      grantFindFirstMock.mockResolvedValue(grantRow())
      const result = await requireFrontDeskOrOrganizer("evt-fete")
      expect(result).not.toBeInstanceOf(NextResponse)
      expect(result).toMatchObject({
        access: "front_desk", organizationId: "org-fete", db: { __scoped: true },
        grant: { id: "grant-1", adminUserId: "adm-colette", eventId: "evt-fete", organizationId: "org-fete" },
      })
      expect(grantFindFirstMock.mock.calls[0][0].where).toMatchObject({ adminUserId: "adm-colette", eventId: "evt-fete", organizationId: "org-fete" })
    })

    it.each([
      ["revoked", grantRow({ revokedAt: new Date("2020-01-01T00:00:00Z") })],
      ["expired", grantRow({ expiresAt: new Date("2020-01-01T00:00:00Z") })],
      ["on another event", grantRow({ eventId: "evt-marche" })],
      ["of another organisation", grantRow({ organizationId: "org-tournoi" })],
      ["on an archived event", grantRow({ event: { id: "evt-fete", organizationId: "org-fete", publicStatus: "archived" } })],
      ["on an event of another organisation", grantRow({ event: { id: "evt-fete", organizationId: "org-tournoi", publicStatus: "published" } })],
    ])("403 for a grant %s", async (_label, found) => {
      grantFindFirstMock.mockResolvedValue(found)
      const result = await requireFrontDeskOrOrganizer("evt-fete")
      expect(result).toBeInstanceOf(NextResponse)
      expect((result as NextResponse).status).toBe(403)
    })

    it("403 when its organisation is deactivated, before the grant is read", async () => {
      findUniqueOrgMock.mockResolvedValue({ active: false })
      grantFindFirstMock.mockResolvedValue(grantRow())
      const result = await requireFrontDeskOrOrganizer("evt-fete")
      expect((result as NextResponse).status).toBe(403)
      expect(grantFindFirstMock).not.toHaveBeenCalled()
    })

    it("403 without an organisation, an account id or an event id", async () => {
      grantFindFirstMock.mockResolvedValue(grantRow())
      authMock.mockResolvedValue({ user: { ...colette.user, organizationId: null } })
      expect(((await requireFrontDeskOrOrganizer("evt-fete")) as NextResponse).status).toBe(403)
      authMock.mockResolvedValue({ user: { ...colette.user, id: undefined } })
      expect(((await requireFrontDeskOrOrganizer("evt-fete")) as NextResponse).status).toBe(403)
      authMock.mockResolvedValue(colette)
      expect(((await requireFrontDeskOrOrganizer("")) as NextResponse).status).toBe(403)
      expect(grantFindFirstMock).not.toHaveBeenCalled()
    })

    it("an owner or an organiser passes exactly as with requireOrgSession, without a grant being read", async () => {
      for (const role of ["admin", "organizer"]) {
        authMock.mockResolvedValue({ user: { id: "adm-sami", role, organizationId: "org-fete" } })
        const result = await requireFrontDeskOrOrganizer("evt-fete")
        expect(result).toMatchObject({ access: "organizer", organizationId: "org-fete", db: { __scoped: true }, grant: null })
      }
      expect(grantFindFirstMock).not.toHaveBeenCalled()
    })

    it("the other refusals of requireOrgSession hold: deactivated organisation, no organisation picked, unknown role, pending second factor", async () => {
      authMock.mockResolvedValue({ user: { id: "adm-sami", role: "organizer", organizationId: "org-fete" } })
      findUniqueOrgMock.mockResolvedValue({ active: false })
      expect(((await requireFrontDeskOrOrganizer("evt-fete")) as NextResponse).status).toBe(403)
      findUniqueOrgMock.mockResolvedValue({ active: true })
      authMock.mockResolvedValue({ user: { id: "sa", role: "super_admin", organizationId: null } })
      expect(((await requireFrontDeskOrOrganizer("evt-fete")) as NextResponse).status).toBe(409)
      authMock.mockResolvedValue({ user: { id: "x", role: "volunteer", organizationId: "org-fete" } })
      expect(((await requireFrontDeskOrOrganizer("evt-fete")) as NextResponse).status).toBe(403)
      authMock.mockResolvedValue({ user: { id: "sa" }, secondFactor: { pending: true } })
      expect(((await requireFrontDeskOrOrganizer("evt-fete")) as NextResponse).status).toBe(401)
      expect(grantFindFirstMock).not.toHaveBeenCalled()
    })
  })
})
