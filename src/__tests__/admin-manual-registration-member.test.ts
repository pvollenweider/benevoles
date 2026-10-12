import { describe, it, expect, vi, beforeEach } from "vitest"

// Placing a member already in the list on a shift (#914): the add form sends the member's id, the
// server links the registration to that member, email or not, and never creates a new one. The
// volunteer is then told by email (#916), except without email, for oneself or a past shift.
const m = vi.hoisted(() => ({
  volunteerFindFirst: vi.fn(),
  volunteerCreate: vi.fn(),
  registrationCreate: vi.fn(),
  adminFindFirst: vi.fn(),
  sent: [] as { kind: string; recipient: { email: string }; data: Record<string, unknown>; dedupeKey?: string }[],
  logEvent: vi.fn(),
  shiftDate: new Date("2030-07-04T00:00:00Z"),
  sessionEmail: "lea@org-a.org",
  limits: [] as { roleName: string; maxPerVolunteer: number }[],
  held: [] as { shift: { roleName: string } }[],
}))

const shift = () => ({
  id: "s1", eventId: "evt-1", roleName: "Bar", label: "Bar", capacity: 5, registrations: [],
  date: m.shiftDate, startTime: "10:00", endTime: "12:00",
  event: { title: "Festival", organization: { name: "Org A", slug: "org-a", timeZone: "Europe/Zurich" } },
})

vi.mock("@/lib/auth-guard", () => ({
  requireOrgSession: vi.fn(async () => {
    const db = {
      shift: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "gone" ? null : { ...shift(), id: where.id, roleName: where.id === "s3" ? "Loge" : "Bar" })),
        findMany: vi.fn(async () => m.limits),
        update: vi.fn(),
      },
      volunteer: { findFirst: m.volunteerFindFirst, create: m.volunteerCreate },
      registration: { findMany: vi.fn(async () => m.held), create: m.registrationCreate },
      adminUser: { findFirst: m.adminFindFirst },
      $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    }
    return { organizationId: "org-a", session: { user: { id: "adm-1", email: m.sessionEmail, role: "admin", organizationId: "org-a" } }, db }
  }),
}))
vi.mock("@/lib/event-log", () => ({ logEvent: m.logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/notifications/added-by-organizer", () => ({
  queueAddedByOrganizer: vi.fn(async (_tx: unknown, input: { registrationId: string; recipient: { email: string }; data: Record<string, unknown> }) => {
    m.sent.push({ kind: "registration_added_by_organizer", recipient: input.recipient, data: input.data, dedupeKey: input.registrationId })
  }),
}))

function post(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: "evt-1", shiftId: "s1", ...body }),
  })
}

const loggedEmail = () => m.logEvent.mock.calls[0][0].changes.confirmationEmail.to

describe("POST /api/admin/registrations with a chosen member (#914)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.sent.length = 0
    m.shiftDate = new Date("2030-07-04T00:00:00Z")
    m.sessionEmail = "lea@org-a.org"
    m.adminFindFirst.mockResolvedValue({ name: "Léa Morel" })
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
    m.volunteerCreate.mockResolvedValue({ id: "mem-new", firstName: "Chloé", lastName: "Roy", email: null })
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ volunteerId: "", firstName: " Chloé ", lastName: "Roy" }))
    expect(res.status).toBe(201)
    expect(m.volunteerCreate.mock.calls[0][0].data).toMatchObject({ firstName: "Chloé", lastName: "Roy", organizationId: "org-a" })
  })
})

describe("POST /api/admin/registrations tells the volunteer (#916)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.sent.length = 0
    m.shiftDate = new Date("2030-07-04T00:00:00Z")
    m.sessionEmail = "lea@org-a.org"
    m.adminFindFirst.mockResolvedValue({ name: "Léa Morel" })
    m.registrationCreate.mockImplementation(async ({ data }: { data: { volunteerId: string } }) => ({ id: "r1", volunteerId: data.volunteerId }))
  })

  it("queues the grouped email: who placed them, for this registration", async () => {
    m.volunteerFindFirst.mockResolvedValue({ id: "mem-3", firstName: "Aline", lastName: "Exemple", email: "aline@example.org" })
    const { POST } = await import("@/app/api/admin/registrations/route")
    expect((await POST(post({ volunteerId: "mem-3" }))).status).toBe(201)
    expect(m.sent).toHaveLength(1)
    expect(m.sent[0]).toMatchObject({
      recipient: { email: "aline@example.org" },
      dedupeKey: "r1",
      data: { organizerName: "Léa Morel", organizationName: "Org A", eventTitle: "Festival", volunteerName: "Aline Exemple" },
    })
    expect(loggedEmail()).toBe("prévu, regroupé avec les autres ajouts des prochaines minutes")
  })

  it("sends nothing without email, and says so in the log", async () => {
    m.volunteerFindFirst.mockResolvedValue({ id: "mem-2", firstName: "René", lastName: "Meyer", email: null })
    const { POST } = await import("@/app/api/admin/registrations/route")
    expect((await POST(post({ volunteerId: "mem-2" }))).status).toBe(201)
    expect(m.sent).toHaveLength(0)
    expect(loggedEmail()).toBe("non envoyé : sans adresse email")
  })

  it("sends nothing when organizers place themselves", async () => {
    m.volunteerFindFirst.mockResolvedValue({ id: "mem-9", firstName: "Léa", lastName: "Morel", email: "LEA@org-a.org" })
    const { POST } = await import("@/app/api/admin/registrations/route")
    expect((await POST(post({ volunteerId: "mem-9" }))).status).toBe(201)
    expect(m.sent).toHaveLength(0)
    expect(loggedEmail()).toBe("non envoyé : inscription de soi-même")
  })

  it("sends nothing for a shift already over (data entry after the fact)", async () => {
    m.shiftDate = new Date("2020-07-04T00:00:00Z")
    m.volunteerFindFirst.mockResolvedValue({ id: "mem-3", firstName: "Aline", lastName: "Exemple", email: "aline@example.org" })
    const { POST } = await import("@/app/api/admin/registrations/route")
    expect((await POST(post({ volunteerId: "mem-3" }))).status).toBe(201)
    expect(m.sent).toHaveLength(0)
    expect(loggedEmail()).toBe("non envoyé : créneau déjà commencé")
  })

  it("names the organization when the organizer's name is unknown", async () => {
    m.adminFindFirst.mockResolvedValue(null)
    m.volunteerFindFirst.mockResolvedValue({ id: "mem-3", firstName: "Aline", lastName: "Exemple", email: "aline@example.org" })
    const { POST } = await import("@/app/api/admin/registrations/route")
    await POST(post({ volunteerId: "mem-3" }))
    expect(m.sent[0].data.organizerName).toBeNull()
  })
})

describe("POST /api/admin/registrations with several shifts (#918)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.sent.length = 0
    m.limits = []
    m.held = []
    m.shiftDate = new Date("2030-07-04T00:00:00Z")
    m.adminFindFirst.mockResolvedValue({ name: "Léa Morel" })
    let n = 0
    m.registrationCreate.mockImplementation(async ({ data }: { data: { volunteerId: string; shiftId: string } }) => ({ id: `r${++n}`, ...data }))
    m.volunteerFindFirst.mockResolvedValue({ id: "mem-3", firstName: "Aline", lastName: "Exemple", email: "aline@example.org" })
  })

  it("adds every shift for the person, logs each, and queues each in the grouped email", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ shiftId: undefined, shiftIds: ["s1", "s2", "s1"], volunteerId: "mem-3" }))
    expect(res.status).toBe(201)
    const { registrations } = await res.json()
    expect(registrations.map((r: { shiftId: string }) => r.shiftId)).toEqual(["s1", "s2"])
    expect(m.logEvent).toHaveBeenCalledTimes(2)
    expect(m.sent.map((x) => x.dedupeKey)).toEqual(["r1", "r2"])
  })

  it("adds nothing when one shift is unknown", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    expect((await POST(post({ shiftIds: ["s1", "gone"], volunteerId: "mem-3" }))).status).toBe(404)
    expect(m.registrationCreate).not.toHaveBeenCalled()
  })

  it("counts the shifts added together against the role limit", async () => {
    m.limits = [{ roleName: "Bar", maxPerVolunteer: 2 }]
    m.held = [{ shift: { roleName: "Bar" } }]
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ shiftIds: ["s1", "s2"], volunteerId: "mem-3" }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: "role_limit" })
    expect(m.registrationCreate).not.toHaveBeenCalled()
  })

  it("refuses a submit without any shift", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    expect((await POST(new Request("http://localhost/api/admin/registrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: "evt-1", shiftIds: [], volunteerId: "mem-3" }) }))).status).toBe(400)
  })
})
