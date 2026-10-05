import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

// Summary of the answers to the custom questions (#686).
const event = {
  title: "Fête d'été", slug: "fete",
  organization: { name: "Org", timeZone: "Europe/Zurich" },
  sectorLeaders: [],
  shifts: [],
  questions: [
    { id: "q1", label: "Taille de t-shirt", type: "single", options: ["S", "M"], archivedAt: null, answers: [{ volunteerId: "a", values: ["M"] }, { volunteerId: "c", values: ["S"] }, { volunteerId: "w", values: ["S"] }] },
  ],
  registrations: [
    { volunteerId: "a", status: "active" },
    { volunteerId: "a", status: "active" },
    { volunteerId: "b", status: "active" },
    { volunteerId: "w", status: "waiting" },
  ],
}

describe("GET /api/admin/events/[id]/export/answers", () => {
  beforeEach(() => vi.clearAllMocks())

  it("streams the summary as a CSV attachment, counted from the live registrations", async () => {
    const findFirst = vi.fn().mockResolvedValue(event)
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst } }, organizationId: "org-a", session: {} })
    const { GET } = await import("@/app/api/admin/events/[id]/export/answers/route")
    const res = await GET(new Request("http://localhost/api/admin/events/evt-a/export/answers"), { params: Promise.resolve({ id: "evt-a" }) })
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="reponses-fete-d-ete.csv"')
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    const lines = (await res.text()).replace(/^﻿/, "").split("\r\n")
    expect(lines.slice(0, 4)).toEqual(["Question;Réponse;Confirmés;En attente", "Taille de t-shirt;S;0;1", "Taille de t-shirt;M;1;0", "Taille de t-shirt;Sans réponse;1;0"])
    // Archived questions and cancelled registrations are filtered in the query.
    const select = findFirst.mock.calls[0][0].select
    expect(select.questions.where).toEqual({ archivedAt: null })
    expect(select.registrations.where).toEqual({ status: { in: ["active", "waiting", "offered", "requested"] }, shift: { status: { not: "cancelled" } } })
  })

  it("returns 404 for an event outside the organization", async () => {
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst: vi.fn().mockResolvedValue(null) } }, organizationId: "org-a", session: {} })
    const { GET } = await import("@/app/api/admin/events/[id]/export/answers/route")
    const res = await GET(new Request("http://localhost/api/admin/events/evt-b/export/answers"), { params: Promise.resolve({ id: "evt-b" }) })
    expect(res.status).toBe(404)
  })
})

describe("GET /api/admin/events/[id]/export/sheets/answers", () => {
  it("prints the summary, even without any shift", async () => {
    const findFirst = vi.fn().mockResolvedValue(event)
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst } }, organizationId: "org-a", session: {} })
    const { GET } = await import("@/app/api/admin/events/[id]/export/sheets/[view]/route")
    const res = await GET(new Request("http://localhost/api/admin/events/evt-a/export/sheets/answers"), { params: Promise.resolve({ id: "evt-a", view: "answers" }) })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("<caption>Taille de t-shirt</caption>")
    expect(html).toContain("<strong>2 bénévoles confirmés</strong>, et 1 en attente")
    expect(findFirst).toHaveBeenCalledTimes(2)
  })

  it("does not load the answers for another view", async () => {
    const findFirst = vi.fn().mockResolvedValue(event)
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst } }, organizationId: "org-a", session: {} })
    const { GET } = await import("@/app/api/admin/events/[id]/export/sheets/[view]/route")
    const res = await GET(new Request("http://localhost/api/admin/events/evt-a/export/sheets/day"), { params: Promise.resolve({ id: "evt-a", view: "day" }) })
    expect(res.status).toBe(200)
    expect(findFirst).toHaveBeenCalledTimes(1)
  })
})
