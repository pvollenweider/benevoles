import { describe, it, expect, vi, beforeEach } from "vitest"

// Placing a member already in the list on a shift (#914): the add form sends the member's id, the
// server links the registration to that member, email or not, and never creates a new one.
const m = vi.hoisted(() => ({
  volunteerFindFirst: vi.fn(),
  volunteerCreate: vi.fn(),
  registrationCreate: vi.fn(),
}))

const shift = { id: "s1", eventId: "evt-1", roleName: "Bar", capacity: 5, registrations: [] }

vi.mock("@/lib/auth-guard", () => ({
  requireOrgSession: vi.fn(async () => ({
    organizationId: "org-a",
    session: { user: { email: "admin@a.org", role: "admin", organizationId: "org-a" } },
    db: {
      shift: { findFirst: vi.fn().mockResolvedValue(shift), findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
      volunteer: { findFirst: m.volunteerFindFirst, create: m.volunteerCreate },
      registration: { findMany: vi.fn().mockResolvedValue([]), create: m.registrationCreate },
    },
  })),
}))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn(), adminActor: () => ({ type: "admin", id: "adm" }) }))

function post(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: "evt-1", shiftId: "s1", ...body }),
  })
}

describe("POST /api/admin/registrations with a chosen member (#914)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.registrationCreate.mockImplementation(async ({ data }: { data: { volunteerId: string } }) => ({ id: "r1", volunteerId: data.volunteerId }))
  })

  it("links the registration to the member, looked up in the organization only", async () => {
    m.volunteerFindFirst.mockResolvedValue({ id: "mem-1", firstName: "René", lastName: "Meyer", email: null })
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ volunteerId: "mem-1" }))
    expect(res.status).toBe(201)
    expect(m.volunteerFindFirst).toHaveBeenCalledWith({ where: { id: "mem-1", organizationId: "org-a" } })
    expect(m.volunteerCreate).not.toHaveBeenCalled()
    expect(m.registrationCreate.mock.calls[0][0].data).toMatchObject({ volunteerId: "mem-1", source: "admin_manual" })
  })

  it("refuses a member it cannot find instead of creating a new person", async () => {
    m.volunteerFindFirst.mockResolvedValue(null)
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ volunteerId: "mem-other-org", firstName: "Eve", lastName: "B" }))
    expect(res.status).toBe(404)
    expect(m.volunteerCreate).not.toHaveBeenCalled()
    expect(m.registrationCreate).not.toHaveBeenCalled()
  })

  it("still requires the names for a new person typed by hand", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ firstName: " ", lastName: "Roy" }))
    expect(res.status).toBe(400)
    expect(m.registrationCreate).not.toHaveBeenCalled()
  })

  it("creates a new person from the typed names, trimmed", async () => {
    m.volunteerCreate.mockResolvedValue({ id: "mem-new" })
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ volunteerId: "", firstName: " Chloé ", lastName: "Roy" }))
    expect(res.status).toBe(201)
    expect(m.volunteerCreate.mock.calls[0][0].data).toMatchObject({ firstName: "Chloé", lastName: "Roy", organizationId: "org-a" })
  })
})
