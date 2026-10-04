import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const orgFindUnique = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findUnique: orgFindUnique } } }))

function get(query = "") {
  return new Request(`http://localhost/api/admin/members/export-hours${query}`)
}

describe("GET /api/admin/members/export-hours (#557)", () => {
  const volunteerFindMany = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({
      db: { volunteer: { findMany: volunteerFindMany } },
      organizationId: "org-a",
      session: { user: { id: "admin-1" } },
    })
    orgFindUnique.mockResolvedValue({ name: "Org A", timeZone: "Europe/Zurich" })
    volunteerFindMany.mockResolvedValue([])
  })

  it("answers 400 for an invalid period (end before start), without querying members", async () => {
    const { GET } = await import("@/app/api/admin/members/export-hours/route")
    const res = await GET(get("?from=2026-06-30&to=2026-01-01"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/date de fin précède la date de début/)
    expect(volunteerFindMany).not.toHaveBeenCalled()
  })

  it("accepts an equal from/to (a single day) and a normal range", async () => {
    const { GET } = await import("@/app/api/admin/members/export-hours/route")
    expect((await GET(get("?from=2026-06-01&to=2026-06-01"))).status).toBe(200)
    expect((await GET(get("?from=2026-01-01&to=2026-06-30"))).status).toBe(200)
  })

  it("returns a CSV with the expected header row when the period is valid", async () => {
    const { GET } = await import("@/app/api/admin/members/export-hours/route")
    const res = await GET(get("?from=2026-01-01&to=2026-06-30"))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain("Prénom;Nom;Événements;Créneaux;Heures planifiées;Heures attestées")
  })

  it("falls back to the default period and still returns 200 without query params", async () => {
    const { GET } = await import("@/app/api/admin/members/export-hours/route")
    const res = await GET(get())
    expect(res.status).toBe(200)
  })
})
