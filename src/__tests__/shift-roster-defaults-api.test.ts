import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * « Qui est inscrit » (#1068): a NEW event starts with the organisation's default (on unless the
 * organisation turned it off in Paramètres), whatever way it is created; the form's own value wins
 * when it sends one; a duplicate copies its source's value with the settings, else the default.
 * The organisation's default is saved by its owner and never touches existing events.
 */

const guard = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: guard }))
vi.mock("@/lib/admin-registration-actions", () => ({ addSectorLeader: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ adminActor: () => ({ type: "admin", id: "adm" }) }))
const orgUpdate = vi.hoisted(() => vi.fn())
const eventUpdateMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ organization: { update: orgUpdate }, event: { updateMany: eventUpdateMany } }) },
}))

const post = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

function makeDb(orgDefault: boolean, source?: Record<string, unknown>) {
  return {
    organization: { findUnique: vi.fn().mockResolvedValue({ shiftRosterDefault: orgDefault }) },
    event: {
      findFirst: source ? vi.fn().mockResolvedValueOnce(source).mockResolvedValueOnce(null) : vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt-new", organization: { timeZone: null }, ...data })),
    },
    shiftRecurrence: { create: vi.fn() },
    shift: { createMany: vi.fn() },
    $transaction: vi.fn(),
  }
}
const created = (db: ReturnType<typeof makeDb>) => db.event.create.mock.calls[0][0].data as { shiftRosterEnabled?: boolean }

describe("new events and the organisation's default", () => {
  beforeEach(() => vi.clearAllMocks())

  it("POST /api/admin/events: the default when the form sends nothing, the form's value otherwise", async () => {
    const { POST } = await import("@/app/api/admin/events/route")
    for (const orgDefault of [true, false]) {
      const db = makeDb(orgDefault)
      guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
      expect((await POST(post("/api/admin/events", { title: "Fête", startDate: "2031-06-06", endDate: "2031-06-06" }))).status).toBe(201)
      expect(created(db).shiftRosterEnabled).toBe(orgDefault)
    }
    const db = makeDb(true)
    guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    await POST(post("/api/admin/events", { title: "Fête", startDate: "2031-06-06", endDate: "2031-06-06", shiftRosterEnabled: false }))
    // The form's value wins over the default (the organisation is read anyway, for the sectors' default, #1147).
    expect(created(db).shiftRosterEnabled).toBe(false)
  })

  it("POST /api/admin/events/from-template: the organisation's default", async () => {
    const { POST } = await import("@/app/api/admin/events/from-template/route")
    for (const orgDefault of [true, false]) {
      const db = makeDb(orgDefault)
      guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
      expect((await POST(post("/api/admin/events/from-template", { templateId: "buvette", startDate: "2031-08-01" }))).status).toBe(201)
      expect(created(db).shiftRosterEnabled).toBe(orgDefault)
    }
  })

  it("duplicate: the source's value with the settings, the organisation's default without them", async () => {
    const source = (shiftRosterEnabled: boolean, orgDefault: boolean) => ({
      id: "evt-1", title: "Fête", description: null, location: null, latitude: null, longitude: null,
      startDate: new Date("2031-07-04T00:00:00Z"), endDate: new Date("2031-07-04T00:00:00Z"),
      publicInstructions: null, confirmationMessage: null, reminderMessage: null, remindersEnabled: true, requirePhone: false,
      accentColorKey: null, dayContactName: null, dayContactPhone: null, cancelDeadlineDays: null, cancelDeadlineHours: null, showSchedule: [],
      shiftRosterEnabled, shifts: [], pages: [], sectorLeaders: [], shiftRecurrences: [], questions: [],
      organization: { slug: "club", shiftRosterDefault: orgDefault },
    })
    const { POST } = await import("@/app/api/admin/events/[id]/duplicate/route")
    const params = { params: Promise.resolve({ id: "evt-1" }) }
    const cases: [boolean, boolean, boolean, boolean][] = [
      // source value, org default, settings copied, expected
      [false, true, true, false],
      [true, false, true, true],
      [false, true, false, true],
      [true, false, false, false],
    ]
    for (const [value, orgDefault, settings, expected] of cases) {
      const db = makeDb(orgDefault, source(value, orgDefault))
      guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
      expect((await POST(post("/api/admin/events/evt-1/duplicate", { copy: { settings } }), params)).status).toBe(201)
      expect(created(db).shiftRosterEnabled).toBe(expected)
    }
  })
})

describe("PATCH /api/admin/settings/organization — shiftRosterDefault", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    guard.mockResolvedValue({ organizationId: "org-a", session: { user: { id: "admin-1" } } })
    orgUpdate.mockImplementation(async ({ data }) => ({ name: "Org", slug: "org", volunteerCharter: null, hasOrgInsurance: true, publicTitle: null, timeZone: null, shiftRosterDefault: data.shiftRosterDefault }))
  })

  it("stores the default on the caller's organisation only, and no event", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    const res = await PATCH(new Request("http://localhost/api/admin/settings/organization", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shiftRosterDefault: false }) }))
    expect(res.status).toBe(200)
    expect(orgUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "org-a" }, data: { shiftRosterDefault: false } }))
    expect((await res.json()).shiftRosterDefault).toBe(false)
    expect(eventUpdateMany).not.toHaveBeenCalled()
  })

  it("is for owners: the route asks for the owner level", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    const { NextResponse } = await import("next/server")
    guard.mockImplementation(async (level?: string) => level === "owner" ? NextResponse.json({ error: "Réservé" }, { status: 403 }) : { organizationId: "org-a" })
    const res = await PATCH(new Request("http://localhost/api/admin/settings/organization", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shiftRosterDefault: false }) }))
    expect(res.status).toBe(403)
    expect(orgUpdate).not.toHaveBeenCalled()
  })

  it("ignores a non-boolean value", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    const res = await PATCH(new Request("http://localhost/api/admin/settings/organization", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shiftRosterDefault: "no" }) }))
    expect(res.status).toBe(400)
    expect(orgUpdate).not.toHaveBeenCalled()
  })
})
