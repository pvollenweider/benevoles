import { describe, it, expect, vi, beforeEach } from "vitest"

// « Retrouver toutes mes inscriptions » on an old event page (#1429): emails the organisation link,
// never returns it, and never requires anything but the event token.

const m = vi.hoisted(() => ({
  registrationFindFirst: vi.fn(),
  ensureOrgLink: vi.fn(),
  send: vi.fn(),
  rateLimit: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findFirst: m.registrationFindFirst } } }))
vi.mock("@/lib/org-link", () => ({ ensureOrgLink: m.ensureOrgLink }))
vi.mock("@/lib/org-link-send", () => ({ sendOrgLinkNow: m.send }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.rateLimit, getClientIp: () => "1.2.3.4" }))
vi.mock("@/lib/token-vault", () => ({ registrationToken: { where: (t: string) => ({ editTokenHash: `h:${t}` }) } }))

const reg = {
  volunteerId: "v1",
  volunteer: { firstName: "Léa", lastName: "M", email: "lea@example.ch" },
  event: {
    organizationId: "org-a",
    organization: { id: "org-a", name: "Asso", slug: "asso", active: true, suspendedAt: null },
  },
}

const post = () => new Request("http://localhost/api/public/registrations/tok/org-link", { method: "POST" })

describe("POST /api/public/registrations/[token]/org-link", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.registrationFindFirst.mockResolvedValue(reg)
    m.ensureOrgLink.mockResolvedValue({ token: "org-token", issuedAt: null })
    m.send.mockResolvedValue("sent")
    m.rateLimit.mockResolvedValue({ ok: true })
  })

  it("emails the organisation link once and never returns the token", async () => {
    const { POST } = await import("@/app/api/public/registrations/[token]/org-link/route")
    const res = await POST(post(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(JSON.stringify(body)).not.toContain("org-token")
    expect(m.registrationFindFirst.mock.calls[0][0].where).toMatchObject({ editTokenHash: "h:tok" })
    expect(m.ensureOrgLink).toHaveBeenCalledWith(expect.anything(), "v1", "org-a")
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({
      kind: "org_personal_link",
      volunteer: { id: "v1", firstName: "Léa", lastName: "M", email: "lea@example.ch" },
      organization: { id: "org-a", name: "Asso", slug: "asso" },
      link: { token: "org-token", issuedAt: null },
    }))
  })

  it("404 for an unknown or cancelled event link", async () => {
    m.registrationFindFirst.mockResolvedValue(null)
    const { POST } = await import("@/app/api/public/registrations/[token]/org-link/route")
    expect((await POST(post(), { params: Promise.resolve({ token: "nope" }) })).status).toBe(404)
    expect(m.send).not.toHaveBeenCalled()
  })

  it("sends nothing while the organisation is suspended", async () => {
    m.registrationFindFirst.mockResolvedValue({ ...reg, event: { ...reg.event, organization: { ...reg.event.organization, suspendedAt: new Date() } } })
    const { POST } = await import("@/app/api/public/registrations/[token]/org-link/route")
    const res = await POST(post(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(403)
    expect(m.send).not.toHaveBeenCalled()
  })

  it("answers the per-volunteer throttle with the same 200 and a neutral text", async () => {
    m.send.mockResolvedValue("throttled")
    const { POST } = await import("@/app/api/public/registrations/[token]/org-link/route")
    const res = await POST(post(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.message).toBe("Une demande a déjà été faite il y a peu. Si une adresse email est enregistrée, le lien de toutes tes inscriptions est dans ta boîte de réception ou tes indésirables. Réessaie dans une heure.")
  })

  it("answers the same 200 whether or not an address is registered", async () => {
    m.registrationFindFirst.mockResolvedValue({ ...reg, volunteer: { ...reg.volunteer, email: null } })
    const { POST } = await import("@/app/api/public/registrations/[token]/org-link/route")
    const res = await POST(post(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    expect(m.ensureOrgLink).not.toHaveBeenCalled()
    expect(m.send).not.toHaveBeenCalled()
  })
})
