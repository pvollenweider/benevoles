import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// « Programmer l'envoi » (#1019): the schedule and cancel routes.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
const rateLimit = vi.hoisted(() => vi.fn())
vi.mock("@/lib/rate-limit", () => ({ rateLimit }))
vi.mock("@/lib/token-vault", () => ({ registrationToken: { reveal: (r: { id: string }) => `tok-${r.id}` }, linkToken: { reveal: () => null } }))

const regs = [
  { id: "r1", volunteerId: "alice", shiftId: "bar1", status: "active", volunteer: { firstName: "Alice", lastName: "A", email: "alice@x.ch" }, shift: { id: "bar1", roleName: "Bar", label: "Bar", date: new Date("2026-11-01T00:00:00Z"), startTime: "10:00", endTime: "12:00" } },
  { id: "r2", volunteerId: "bob", shiftId: "bar1", status: "active", volunteer: { firstName: "Bob", lastName: "B", email: "bob@x.ch" }, shift: { id: "bar1", roleName: "Bar", label: "Bar", date: new Date("2026-11-01T00:00:00Z"), startTime: "10:00", endTime: "12:00" } },
]
// Friday 16 October 2026, 10:30 in Zurich.
const NOW = new Date("2026-10-16T08:30:00Z")

let db: Record<string, Record<string, ReturnType<typeof vi.fn>>>
const post = (url: string, body?: unknown) => new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
const base = { audience: { kind: "event" }, subject: "Rappel parking", message: "Bonjour {prénom}, entrée rue Basse.", date: "2026-10-20", time: "18:00" }

describe("POST /api/admin/events/[id]/scheduled-messages", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] })
    vi.clearAllMocks()
    rateLimit.mockResolvedValue({ ok: true, remaining: 1, retryAfter: 0 })
    db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a", title: "Fête", slug: "fete", organizationId: "org-a", publicStatus: "published", organization: { name: "Org", slug: "org", timeZone: "Europe/Zurich" } }) },
      shift: { findFirst: vi.fn().mockResolvedValue({ id: "bar1" }) },
      registration: { findMany: vi.fn().mockResolvedValue(regs) },
      memberInvite: { findMany: vi.fn().mockResolvedValue([]) },
      scheduledMessage: { create: vi.fn().mockResolvedValue({ id: "sm-1" }) },
    }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "adm-1", name: "Léa Admin" } } })
  })
  afterEach(() => { vi.useRealTimers() })

  const call = async (body: unknown) => {
    const { POST } = await import("@/app/api/admin/events/[id]/scheduled-messages/route")
    return POST(post("/api/admin/events/evt-a/scheduled-messages", body), { params: Promise.resolve({ id: "evt-a" }) })
  }

  it("stores the intent with the instant in the organisation's zone, sends nothing, and logs it", async () => {
    const res = await call(base)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: "sm-1", scheduledFor: "2026-10-20T16:00:00.000Z", when: "mardi 20 octobre à 18:00 (Europe/Zurich)", audience: "tous les bénévoles inscrits", recipients: 2 })
    expect(db.scheduledMessage.create.mock.calls[0][0].data).toEqual({
      organizationId: "org-a", eventId: "evt-a", authorId: "adm-1", authorName: "Léa Admin",
      subject: base.subject, message: base.message, audience: { kind: "event" }, audienceLabel: "tous les bénévoles inscrits",
      push: false, scheduledFor: new Date("2026-10-20T16:00:00.000Z"),
    })
    expect(logEvent.mock.calls[0][0]).toMatchObject({
      action: "message.scheduled", entityType: "Event", entityId: "evt-a",
      changes: { scheduledFor: { from: null, to: "mardi 20 octobre à 18:00 (Europe/Zurich)" }, subject: { to: base.subject } },
    })
    // Counted with the immediate sends of the organisation.
    expect(rateLimit).toHaveBeenCalledWith("org:org-a", "targeted-message", 30, 3600000)
  })

  it("refuses a past time on its field, and stores nothing", async () => {
    const res = await call({ ...base, date: "2026-10-16", time: "10:00" })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Cette heure est passée : choisissez une heure après 10:30 (heure de Europe/Zurich).", field: "time" })
    expect(db.scheduledMessage.create).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("refuses an archived event, a cancelled or foreign shift, unknown variables and too many messages", async () => {
    db.event.findFirst.mockResolvedValueOnce({ id: "evt-a", title: "Fête", slug: "fete", organizationId: "org-a", publicStatus: "archived", organization: { name: "Org", slug: "org", timeZone: null } })
    expect((await call(base)).status).toBe(400)
    db.shift.findFirst.mockResolvedValueOnce(null)
    const shift = await call({ ...base, audience: { kind: "shift", shiftId: "gone" } })
    expect(shift.status).toBe(400)
    expect(db.shift.findFirst.mock.calls.at(-1)?.[0].where).toEqual({ id: "gone", eventId: "evt-a", status: { not: "cancelled" } })
    expect((await call({ ...base, message: "Bonjour {inconnu}" })).status).toBe(400)
    expect((await call({ ...base, date: "" })).status).toBe(400)
    rateLimit.mockResolvedValueOnce({ ok: false, remaining: 0, retryAfter: 60 })
    expect((await call(base)).status).toBe(429)
    expect(db.scheduledMessage.create).not.toHaveBeenCalled()
  })
  it("stores a sector audience as its intent, named after the sector; refuses an archived or foreign one (#1170)", async () => {
    const main = db.event.findFirst.getMockImplementation() as ((a: unknown) => unknown) | undefined
    const sectorRead = { sectorsEnabled: true, sectorsAdoptedAt: new Date("2026-10-01"), sectors: [{ id: "sec-bar", name: "Buvette", displayOrder: 0, archivedAt: null }, { id: "sec-old", name: "Ancien", displayOrder: 1, archivedAt: new Date("2026-10-02") }] }
    db.event.findFirst = vi.fn(async (args: { select: Record<string, unknown> }) => ("sectorsAdoptedAt" in args.select ? sectorRead : main!(args)))
    db.shift.findMany = vi.fn().mockResolvedValue([{ roleName: "Bar", sectorId: "sec-bar", updatedAt: new Date("2026-10-02") }])
    const res = await call({ ...base, audience: { kind: "sector", sectorId: "sec-bar" } })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ audience: "les bénévoles du secteur « Buvette »", recipients: 2 })
    expect(db.scheduledMessage.create.mock.calls[0][0].data.audience).toEqual({ kind: "sector", sectorId: "sec-bar" })
    db.scheduledMessage.create.mockClear()
    for (const sectorId of ["sec-old", "sec-of-org-b"]) {
      const refused = await call({ ...base, audience: { kind: "sector", sectorId } })
      expect(refused.status).toBe(400)
      expect((await refused.json()).error).toBe("Secteur introuvable dans cet événement.")
    }
    expect(db.scheduledMessage.create).not.toHaveBeenCalled()
  })

})

describe("POST /api/admin/events/[id]/scheduled-messages/[scheduledId]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db = {
      scheduledMessage: {
        findFirst: vi.fn().mockResolvedValue({ id: "sm-1", subject: "Rappel parking", scheduledFor: new Date("2026-10-20T16:00:00Z"), event: { organization: { timeZone: "Europe/Zurich" } } }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "adm-1", name: "Léa Admin" } } })
  })

  const call = async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/scheduled-messages/[scheduledId]/cancel/route")
    return POST(post("/api/admin/events/evt-a/scheduled-messages/sm-1/cancel"), { params: Promise.resolve({ id: "evt-a", scheduledId: "sm-1" }) })
  }

  it("cancels only a message still scheduled, conditionally, and logs it", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const update = db.scheduledMessage.updateMany.mock.calls[0][0]
    expect(update.where).toEqual({ id: "sm-1", eventId: "evt-a", status: "scheduled" })
    expect(update.data).toMatchObject({ status: "cancelled", cancelledByName: "Léa Admin" })
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "message.schedule_cancelled", changes: { subject: { from: "Rappel parking", to: null } } })
  })

  it("answers 409 when the cron already took it, logging nothing", async () => {
    db.scheduledMessage.updateMany.mockResolvedValue({ count: 0 })
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/^Trop tard/)
    expect(logEvent).not.toHaveBeenCalled()
  })
})
