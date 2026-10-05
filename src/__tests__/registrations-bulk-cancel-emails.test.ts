import { describe, it, expect, vi, beforeEach } from "vitest"

// « Retirer de leur créneau » (#703): the bulk route, with the real cancelRegistrations, queues
// exactly the emails its confirmation recap announces: one per removed person with an address,
// none for a person without one, none for the selected rows that aren't confirmed (they are not
// removed). Waitlist promotion still runs once per freed spot.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const m = vi.hoisted(() => ({
  queued: [] as { kind: string; dedupeKey?: string; recipient: { email?: string | null }; volunteerId?: string; data: Record<string, unknown> }[],
  promote: vi.fn(),
  logEvent: vi.fn(),
}))
vi.mock("@/lib/event-log", () => ({ adminActor: () => ({ type: "admin", id: "admin-1" }), logEvent: m.logEvent }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: m.promote }))
vi.mock("@/lib/sector-leaders", () => ({ tagVolunteerAsResponsable: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => {
    const payloads: typeof m.queued = []
    return { payloads, send: async (p: typeof m.queued[number]) => { payloads.push(p); return { ok: true } } }
  },
  // Stored with the cancellation's transaction (#352): what matters is the payloads queued.
  enqueueNotifications: async (payloads: typeof m.queued) => { m.queued.push(...payloads); return payloads.map((_, i) => `row-${i}`) },
  deliverAfterResponse: () => {},
}))

import { bulkCancelCounts } from "@/lib/action-recap"

const event = { id: "evt-1", title: "Festival", slug: "festival", organizationId: "org-a", organization: { slug: "asso" } }
const shifts: Record<string, { roleName: string; label: string; date: Date; startTime: string; endTime: string }> = {
  s1: { roleName: "Bar", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "18:00", endTime: "22:00" },
  s2: { roleName: "Accueil", label: "Matin", date: new Date("2026-07-04T00:00:00Z"), startTime: "09:00", endTime: "12:00" },
  s3: { roleName: "Bar", label: "Bar", date: new Date("2026-07-05T00:00:00Z"), startTime: "18:00", endTime: "22:00" },
}
type Row = { id: string; eventId: string; shiftId: string; status: string; volunteerId: string; editTokenLegacy: string; editTokenEnc: null; volunteer: { id: string; firstName: string; lastName: string; email: string | null } }
let rows: Row[]

const row = (id: string, volunteerId: string, shiftId: string, status: string, email: string | null = `${volunteerId}@x.ch`): Row => ({
  id, eventId: "evt-1", shiftId, status, volunteerId, editTokenLegacy: `tok-${id}`, editTokenEnc: null,
  volunteer: { id: volunteerId, firstName: "Prénom", lastName: volunteerId, email },
})
const full = (r: Row) => ({ ...r, shift: shifts[r.shiftId], event })

/** The org-scoped client, in memory: only what the bulk route and cancelRegistrations call. */
function fakeDb() {
  const db = {
    event: { findFirst: async () => event },
    registration: {
      findMany: async ({ where, orderBy }: { where: { id: { in: string[] } }; orderBy?: unknown }) => {
        const found = rows.filter((r) => where.id.in.includes(r.id)).map(full)
        // orderBy shift date, then start time (the only order asked here).
        return orderBy ? found.sort((a, b) => a.shift.date.getTime() - b.shift.date.getTime() || a.shift.startTime.localeCompare(b.shift.startTime)) : found
      },
      updateMany: async ({ where, data }: { where: { id: string; status: { not: string } }; data: { status: string } }) => {
        const r = rows.find((x) => x.id === where.id && x.status !== where.status.not)
        if (r) r.status = data.status
        return { count: r ? 1 : 0 }
      },
      findFirst: async ({ where }: { where: { volunteerId: string; eventId: string; status: { in: string[] } } }) =>
        rows.find((r) => r.volunteerId === where.volunteerId && r.eventId === where.eventId && where.status.in.includes(r.status)) ?? null,
      count: async () => 0,
    },
    shift: { findFirst: async () => ({ capacity: 5, status: "open" }), updateMany: async () => ({ count: 0 }) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  }
  return db
}

function post(ids: string[]) {
  return new Request("http://localhost/api/admin/events/evt-1/registrations/bulk", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", registrationIds: ids }),
  })
}
const params = { params: Promise.resolve({ id: "evt-1" }) }

beforeEach(() => {
  m.queued.length = 0
  m.promote.mockReset().mockResolvedValue(undefined)
  m.logEvent.mockReset().mockResolvedValue("log-1")
  rows = [
    row("r1", "v1", "s1", "active"),
    row("r2", "v1", "s2", "active"), // same person, second shift removed: still one email
    row("r6", "v1", "s3", "active"), // not selected: stays, its link goes in v1's email
    row("r3", "v2", "s1", "active"), // nothing left on the event: link to the event page
    row("r4", "v3", "s1", "active", null), // no address: no email
    row("r5", "v4", "s1", "waiting"), // selected but not confirmed: not removed, no email
    row("r7", "v5", "s2", "requested"),
  ]
  requireOrgSessionMock.mockResolvedValue({ db: fakeDb(), organizationId: "org-a", session: { user: { id: "admin-1" } } })
})

describe("POST bulk cancel: the emails the recap announces (#703)", () => {
  it("queues one email per removed person with an address, none for the others", async () => {
    const selected = ["r1", "r2", "r3", "r4", "r5", "r7"]
    const counts = bulkCancelCounts(rows.filter((r) => selected.includes(r.id)))
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")

    const res = await POST(post(selected), params)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ done: 4, cancelledIds: ["r1", "r2", "r3", "r4"], skipped: 2 })
    expect(m.queued.map((p) => p.kind)).toEqual(["registration_removed", "registration_removed"])
    expect(m.queued).toHaveLength(counts.withEmail)
    expect(counts).toMatchObject({ registrations: 4, people: 3, notConfirmed: 2 })

    const v1 = m.queued.find((p) => p.volunteerId === "v1")!
    expect(v1).toMatchObject({ dedupeKey: "registration_removed:r1", recipient: { email: "v1@x.ch" } })
    expect(v1.data).toMatchObject({ eventTitle: "Festival", orgSlug: "asso", eventSlug: "festival", editToken: "tok-r6" })
    // Shift order: by date then start time.
    expect(v1.data.shifts).toEqual([
      { roleName: "Accueil", label: "Matin", date: "2026-07-04", startTime: "09:00", endTime: "12:00" },
      { roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "18:00", endTime: "22:00" },
    ])
    const v2 = m.queued.find((p) => p.volunteerId === "v2")!
    expect(v2).toMatchObject({ dedupeKey: "registration_removed:r3", recipient: { email: "v2@x.ch" } })
    expect(v2.data.editToken).toBeNull()
    expect(m.queued.some((p) => ["v3", "v4", "v5"].includes(p.volunteerId ?? ""))).toBe(false)

    // Waitlist promotion unchanged: one call per freed spot.
    expect(m.promote).toHaveBeenCalledTimes(4)
    expect(rows.find((r) => r.id === "r5")!.status).toBe("waiting")
    expect(rows.find((r) => r.id === "r7")!.status).toBe("requested")
  })

  it("a retried request emails no one twice", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    await POST(post(["r1", "r3"]), params)
    expect(m.queued).toHaveLength(2)
    await POST(post(["r1", "r3"]), params)
    expect(m.queued).toHaveLength(2)
  })
})
