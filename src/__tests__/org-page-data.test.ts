import { describe, it, expect, vi, beforeEach } from "vitest"

// The organisation page's server read (#1429): the token resolves to (volunteer, organisation),
// and every registration is constrained by both. Unpublished and archived events stay visible
// while a shift is upcoming, so it can still be cancelled.

const m = vi.hoisted(() => ({
  registrationFindMany: vi.fn(),
  guardTokenLookup: vi.fn(),
}))
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  const identity = <T,>(fn: T) => fn
  return { ...actual, cache: identity, default: { ...actual, cache: identity } }
})
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findMany: m.registrationFindMany } } }))
vi.mock("@/lib/token-page-guard", () => ({
  guardTokenLookup: m.guardTokenLookup,
  pageClient: async () => ({ headers: new Headers() }),
}))
vi.mock("@/lib/site", () => ({ contactEmail: () => "contact@example.ch" }))
vi.mock("@/lib/urls", () => ({ orgBaseUrl: (slug: string) => `https://${slug}.example` }))

const target = {
  id: "v1",
  organizationId: "org-a",
  firstName: "Léa",
  lastName: "M",
  email: "lea@example.ch",
  organization: { id: "org-a", name: "Asso", slug: "asso", timeZone: "Europe/Zurich", active: true, suspendedAt: null },
}

const shift = (id: string, date: string) => ({
  id,
  roleName: "Bar",
  label: `Bar ${id}`,
  date: new Date(`${date}T00:00:00Z`),
  startTime: "10:00",
  endTime: "12:00",
})

const row = (id: string, status: string, date: string, publicStatus: string, title: string, cancelDeadlineDays: number | null = null) => ({
  id,
  status,
  waitingPosition: null,
  waitingExpiresAt: null,
  shift: shift(`s-${id}`, date),
  event: { id: `e-${id}`, title, slug: `e-${id}`, publicStatus, cancelDeadlineDays, cancelDeadlineHours: null },
})

describe("loadOrgPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.guardTokenLookup.mockResolvedValue({ blocked: false, value: target })
    m.registrationFindMany.mockResolvedValue([])
  })

  it("reads every live state of this volunteer in this organisation, without filtering public status", async () => {
    m.registrationFindMany.mockResolvedValue([
      row("archived", "waiting", "2099-05-20", "archived", "Café"),
      row("draft", "active", "2099-06-02", "unpublished", "Festival"),
    ])
    const { loadOrgPage } = await import("@/lib/org-personal-page-load")
    const loaded = await loadOrgPage("tok")
    expect(loaded.state).toBe("ok")
    expect(m.registrationFindMany.mock.calls[0][0].where).toEqual({
      volunteerId: "v1",
      status: { in: ["active", "waiting", "offered", "requested"] },
      event: { organizationId: "org-a" },
    })
    if (loaded.state !== "ok") return
    expect(loaded.data.registrations.map((r) => r.event.publicStatus)).toEqual(["archived", "unpublished"])
    expect(loaded.data.registrations.map((r) => r.id)).toEqual(["archived", "draft"])
    expect(loaded.data.orgHomeUrl).toBe("https://asso.example")
    expect(loaded.data.scopeSentence).toContain("auprès de Asso")
  })

  it("never queries another organisation, even with the same address on both sides", async () => {
    m.registrationFindMany.mockResolvedValue([row("a", "active", "2099-06-02", "published", "A")])
    const { loadOrgPage } = await import("@/lib/org-personal-page-load")
    await loadOrgPage("tok-a")
    const where = m.registrationFindMany.mock.calls[0][0].where
    expect(where.event).toEqual({ organizationId: "org-a" })
    expect(where.volunteerId).toBe("v1")
  })

  it("shows « Espace indisponible » for a suspended or deactivated organisation, without reading rows", async () => {
    m.guardTokenLookup.mockResolvedValue({ blocked: false, value: { ...target, organization: { ...target.organization, suspendedAt: new Date() } } })
    const { loadOrgPage } = await import("@/lib/org-personal-page-load")
    const loaded = await loadOrgPage("tok")
    expect(loaded).toEqual({ state: "unavailable", contact: "contact@example.ch" })
    expect(m.registrationFindMany).not.toHaveBeenCalled()
  })

  it("answers invalid for an unknown token and blocked without looking anything up", async () => {
    m.guardTokenLookup.mockResolvedValueOnce({ blocked: false, value: null })
    const { loadOrgPage } = await import("@/lib/org-personal-page-load")
    expect(await loadOrgPage("nope")).toEqual({ state: "invalid" })
    m.guardTokenLookup.mockResolvedValueOnce({ blocked: true })
    expect(await loadOrgPage("nope2")).toEqual({ state: "blocked" })
    expect(m.registrationFindMany).not.toHaveBeenCalled()
  })
})
