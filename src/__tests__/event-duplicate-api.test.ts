import { describe, it, expect, vi, beforeEach } from "vitest"

// Duplicating an event (#378) carries a question's poste (#984, part 3) to the copy's poste of the
// same name, and clears it when the copy has no such poste.

const guard = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: guard }))
const addSectorLeader = vi.hoisted(() => vi.fn())
vi.mock("@/lib/admin-registration-actions", () => ({ addSectorLeader }))
vi.mock("@/lib/event-log", () => ({ adminActor: () => ({ type: "admin", id: "adm" }) }))

const shift = {
  roleName: "Cuisine", label: "Cuisine", description: null, date: new Date("2026-07-04T00:00:00Z"), startTime: "18:00", endTime: "22:00",
  capacity: 3, minVolunteers: null, locationDetails: null, latitude: null, longitude: null, contactName: null, contactPhone: null,
  instructions: null, displayOrder: 0, internalNotes: null, minAge: null, waitlistEnabled: false, requiresApproval: false,
  colorKey: null, maxPerVolunteer: null, reservedTags: [], recurrenceId: null, status: "open",
}
const source = {
  id: "evt-1", title: "Fête", description: null, location: null, latitude: null, longitude: null,
  startDate: new Date("2026-07-04T00:00:00Z"), endDate: new Date("2026-07-04T00:00:00Z"),
  publicInstructions: null, confirmationMessage: null, reminderMessage: null, remindersEnabled: true, requirePhone: false,
  accentColorKey: null, dayContactName: null, dayContactPhone: null, cancelDeadlineDays: null, cancelDeadlineHours: null, showSchedule: [],
  shifts: [shift], pages: [], sectorLeaders: [] as { roleName: string; name: string; email: string }[], shiftRecurrences: [], organization: { slug: "club" },
  questions: [
    { id: "q1", label: "Repas ?", type: "yesno", options: [], required: false, position: 0, roleName: "Cuisine", archivedAt: null },
    { id: "q2", label: "Taille ?", type: "text", options: [], required: false, position: 1, roleName: null, archivedAt: null },
  ],
}

const makeDb = (src: typeof source = source) => ({
  event: {
    findFirst: vi.fn().mockResolvedValueOnce(src).mockResolvedValueOnce(null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt-2", ...data })),
  },
  shiftRecurrence: { create: vi.fn() },
  shift: { createMany: vi.fn() },
  $transaction: vi.fn(),
})
const post = (body: unknown) => new Request("http://localhost/api/admin/events/evt-1/duplicate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "evt-1" }) }

describe("POST /api/admin/events/[id]/duplicate: questions' postes", () => {
  beforeEach(() => vi.clearAllMocks())

  it("keeps the poste on the copy's poste of the same name", async () => {
    const db = makeDb()
    guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/duplicate/route")
    expect((await POST(post({}), params)).status).toBe(201)
    const data = db.event.create.mock.calls[0][0].data as { shifts: { create: { roleName: string }[] }; questions: { createMany: { data: { label: string; roleName: string | null }[] } } }
    expect(data.shifts.create.map((s) => s.roleName)).toEqual(["Cuisine"])
    expect(data.questions.createMany.data.map((q) => [q.label, q.roleName])).toEqual([["Repas ?", "Cuisine"], ["Taille ?", null]])
  })

  it("clears it when the copy takes no shifts", async () => {
    const db = makeDb()
    guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/duplicate/route")
    expect((await POST(post({ copy: { shifts: false } }), params)).status).toBe(201)
    const data = db.event.create.mock.calls[0][0].data as { questions: { createMany: { data: { roleName: string | null }[] } } }
    expect(data.questions.createMany.data.map((q) => q.roleName)).toEqual([null, null])
  })
})

// Regression for #1010: deleting a poste cancels its shifts and keeps its leaders; duplicating
// copied those leaders too and emailed each one a link to a poste the copy doesn't have.
describe("POST /api/admin/events/[id]/duplicate: sector leaders", () => {
  beforeEach(() => vi.clearAllMocks())
  // The route reads only the live shifts: « Bar » was deleted, its shifts are cancelled.
  const withLeaders = {
    ...source,
    sectorLeaders: [
      { roleName: "Cuisine", name: "Léa", email: "lea@x.ch" },
      { roleName: "Bar", name: "Noé", email: "noe@x.ch" },
    ],
  }

  it("copies, and emails, only the leaders of a poste the copy has", async () => {
    const db = makeDb(withLeaders)
    guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/duplicate/route")
    expect((await POST(post({ copy: { leaders: true } }), params)).status).toBe(201)
    // addSectorLeader creates the row and sends the invite: once, for the poste the copy has.
    expect(addSectorLeader).toHaveBeenCalledTimes(1)
    expect(addSectorLeader.mock.calls[0][2]).toEqual({ roleName: "Cuisine", name: "Léa", email: "lea@x.ch" })
  })

  it("copies no leader, and sends no email, when the copy takes no shifts", async () => {
    const db = makeDb(withLeaders)
    guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/duplicate/route")
    expect((await POST(post({ copy: { leaders: true, shifts: false } }), params)).status).toBe(201)
    expect(addSectorLeader).not.toHaveBeenCalled()
  })
})
