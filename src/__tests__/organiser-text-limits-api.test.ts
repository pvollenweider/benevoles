import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn(), adminActor: () => ({ type: "admin", id: "a" }) }))
vi.mock("@/lib/org-log", () => ({ logOrgEvent: vi.fn(), adminActor: () => ({ type: "admin", id: "a" }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))
vi.mock("@/lib/member-address-revocation", () => ({ renewMemberLinks: vi.fn() }))
vi.mock("@/lib/notifications/outbox", async (orig) => ({ ...(await orig<typeof import("@/lib/notifications/outbox")>()), deliverAfterResponse: vi.fn() }))

const shiftCreate = vi.hoisted(() => vi.fn())

const json = (url: string, method: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

const eventBase = { title: "Fête du village", startDate: "2026-07-04", endDate: "2026-07-05" }
const shiftBase = { eventId: "evt-a", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 2 }
const seriesBase = { eventId: "evt-a", roleName: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", slotMinutes: 60, capacity: 2 }
const recurrenceBase = {
  eventId: "evt-a", roleName: "Bar", from: "2026-07-04", until: "2026-07-31", weekdays: [6], everyWeeks: 1,
  startTime: "10:00", endTime: "12:00", slotMinutes: 60, capacity: 2, holidays: "none",
}

async function errorOf(res: Response) {
  expect(res.status).toBe(400)
  return ((await res.json()) as { error: string }).error
}

// Organisers' free texts are capped (stored texts are re-rendered on public pages and in emails).
describe("organiser text caps", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shiftCreate.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "s1", ...(data as object) }))
    requireOrgSessionMock.mockResolvedValue({
      db: { event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) }, shift: { findMany: vi.fn().mockResolvedValue([]), create: shiftCreate } },
      organizationId: "org-a", session: {},
    })
  })

  it("event creation refuses each Markdown text over 20,000 characters, naming the field", async () => {
    const { POST } = await import("@/app/api/admin/events/route")
    expect(await errorOf(await POST(json("/api/admin/events", "POST", { ...eventBase, confirmationMessage: "x".repeat(20_001) }))))
      .toBe("Le message de confirmation : 20 000 caractères au maximum.")
    expect(await errorOf(await POST(json("/api/admin/events", "POST", { ...eventBase, description: "x".repeat(20_001) }))))
      .toBe("La description : 20 000 caractères au maximum.")
    expect(await errorOf(await POST(json("/api/admin/events", "POST", { ...eventBase, publicInstructions: "x".repeat(20_001) }))))
      .toBe("Les informations pratiques : 20 000 caractères au maximum.")
    expect(await errorOf(await POST(json("/api/admin/events", "POST", { ...eventBase, title: "x".repeat(201) }))))
      .toBe("Le titre : 200 caractères au maximum.")
    expect(await errorOf(await POST(json("/api/admin/events", "POST", { ...eventBase, location: "x".repeat(501) }))))
      .toBe("Le lieu : 500 caractères au maximum.")
  })

  it("event edit refuses the same texts", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    expect(await errorOf(await PATCH(json("/api/admin/events/e1", "PATCH", { confirmationMessage: "x".repeat(20_001) }), params("e1"))))
      .toBe("Le message de confirmation : 20 000 caractères au maximum.")
    expect(await errorOf(await PATCH(json("/api/admin/events/e1", "PATCH", { showSchedule: [{ name: "x".repeat(201), date: "2026-07-04", startTime: "20:00", endTime: "22:00" }] }), params("e1"))))
      .toBe("Le nom du spectacle : 200 caractères au maximum.")
  })

  it("shift creation refuses over-long texts and accepts them at the cap", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    const cases: [Record<string, string>, string][] = [
      [{ roleName: "x".repeat(101) }, "Le nom du poste : 100 caractères au maximum."],
      [{ label: "x".repeat(201) }, "Le libellé du créneau : 200 caractères au maximum."],
      [{ description: "x".repeat(5001) }, "La description du créneau : 5 000 caractères au maximum."],
      [{ locationDetails: "x".repeat(1001) }, "Le lieu de rendez-vous : 1 000 caractères au maximum."],
      [{ internalNotes: "x".repeat(5001) }, "Les notes internes : 5 000 caractères au maximum."],
    ]
    for (const [extra, message] of cases) expect(await errorOf(await POST(json("/api/admin/shifts", "POST", { ...shiftBase, ...extra })))).toBe(message)
    expect(shiftCreate).not.toHaveBeenCalled()
    const res = await POST(json("/api/admin/shifts", "POST", { ...shiftBase, description: "x".repeat(5000), internalNotes: "y".repeat(5000) }))
    expect(res.status).toBe(201)
  })

  it("shift edit, series and recurring permanence refuse over-long texts", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    expect(await errorOf(await PATCH(json("/api/admin/shifts/s1", "PATCH", { internalNotes: "x".repeat(5001) }), params("s1"))))
      .toBe("Les notes internes : 5 000 caractères au maximum.")
    const series = await import("@/app/api/admin/shifts/series/route")
    expect(await errorOf(await series.POST(json("/api/admin/shifts/series", "POST", { ...seriesBase, description: "x".repeat(5001) }))))
      .toBe("La description du créneau : 5 000 caractères au maximum.")
    const recurrence = await import("@/app/api/admin/shifts/recurrence/route")
    expect(await errorOf(await recurrence.POST(json("/api/admin/shifts/recurrence", "POST", { ...recurrenceBase, locationDetails: "x".repeat(1001) }))))
      .toBe("Le lieu de rendez-vous : 1 000 caractères au maximum.")
  })

  it("member notes are capped on creation and edit", async () => {
    const members = await import("@/app/api/admin/members/route")
    expect(await errorOf(await members.POST(json("/api/admin/members", "POST", { firstName: "Léa", lastName: "Favre", notes: "x".repeat(5001) }))))
      .toBe("Les notes : 5 000 caractères au maximum.")
    const member = await import("@/app/api/admin/members/[id]/route")
    expect(await errorOf(await member.PATCH(json("/api/admin/members/v1", "PATCH", { notes: "x".repeat(5001) }), params("v1"))))
      .toBe("Les notes : 5 000 caractères au maximum.")
  })

  it("the volunteer charter is capped at 20,000 characters", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    expect(await errorOf(await PATCH(json("/api/admin/settings/organization", "PATCH", { volunteerCharter: "x".repeat(20_001) }))))
      .toBe("La charte : 20 000 caractères au maximum.")
  })
})
