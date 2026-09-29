import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))

const enqueueNotifications = vi.hoisted(() => vi.fn().mockResolvedValue(["row-1", "row-2"]))
const deliverAfterResponse = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications, deliverAfterResponse }))

const rateLimit = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, remaining: 1, retryAfter: 0 }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit }))
vi.mock("@/lib/token-vault", () => ({ registrationToken: { reveal: (r: { id: string }) => `tok-${r.id}` } }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const shift = (id: string, roleName: string, over: Partial<{ label: string; startTime: string }> = {}) => ({
  id, roleName, label: over.label ?? roleName, date: new Date("2026-07-04T00:00:00Z"), startTime: over.startTime ?? "10:00", endTime: "12:00",
})
const regs = [
  { id: "r1", volunteerId: "alice", shiftId: "bar1", status: "active", volunteer: { firstName: "Alice", lastName: "A", email: "alice@x.ch" }, shift: shift("bar1", "Bar") },
  { id: "r2", volunteerId: "alice", shiftId: "bar2", status: "active", volunteer: { firstName: "Alice", lastName: "A", email: "alice@x.ch" }, shift: shift("bar2", "Bar", { label: "Bar soir", startTime: "18:00" }) },
  { id: "r3", volunteerId: "bob", shiftId: "acc1", status: "active", volunteer: { firstName: "Bob", lastName: "B", email: "bob@x.ch" }, shift: shift("acc1", "Accueil") },
  { id: "r4", volunteerId: "carla", shiftId: "bar1", status: "waiting", volunteer: { firstName: "Carla", lastName: "C", email: "carla@x.ch" }, shift: shift("bar1", "Bar") },
]

let db: Record<string, unknown>

const post = (body: unknown) =>
  new Request("http://localhost/api/admin/events/evt-a/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "evt-a" }) }
const base = { subject: "Info de dernière minute", message: "Venez 10 min avant." }

describe("POST /api/admin/events/[id]/message", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    enqueueNotifications.mockResolvedValue(["row-1", "row-2"])
    rateLimit.mockResolvedValue({ ok: true, remaining: 1, retryAfter: 0 })
    db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a", title: "Fête", organizationId: "org-a", organization: { name: "Org", slug: "org" } }) },
      shift: { findFirst: vi.fn().mockResolvedValue({ id: "bar1" }) },
      registration: { findMany: vi.fn().mockResolvedValue(regs) },
    }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
  })

  it("dry run: counts the recipients and previews the email without sending", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/message/route")
    const res = await POST(post({ ...base, audience: { kind: "event" }, dryRun: true }), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recipients).toBe(2)
    expect(body.audience).toBe("tous les bénévoles inscrits")
    expect(body.preview.subject).toBe("Info de dernière minute — Fête")
    expect(body.preview.html).toContain("Venez 10 min avant.")
    expect(body.preview.html).toContain("/my/apercu")
    expect(enqueueNotifications).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("sends one email per person through the outbox, with their shifts in the audience, and logs it", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/message/route")
    const res = await POST(post({ ...base, audience: { kind: "role", roleName: "Bar" } }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: 1, audience: "les bénévoles du poste « Bar »" })
    const payloads = enqueueNotifications.mock.calls[0][0]
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toMatchObject({ kind: "targeted_message", recipient: { email: "alice@x.ch" }, data: { subject: base.subject, message: base.message, editToken: "tok-r1" } })
    expect(payloads[0].data.shifts.map((s: { label: string }) => s.label)).toEqual(["Bar", "Bar soir"])
    expect(payloads[0].dedupeKey).toMatch(/^message:.+:alice$/)
    expect(deliverAfterResponse).toHaveBeenCalledWith(["row-1", "row-2"])
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "message.sent", entityType: "Event", changes: { recipients: { to: 1 } } })
  })

  it("waitlist audience: waiting people, no shift list in the email", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/message/route")
    const res = await POST(post({ ...base, audience: { kind: "waitlist" } }), params)
    expect(res.status).toBe(200)
    const payloads = enqueueNotifications.mock.calls[0][0]
    expect(payloads.map((p: { recipient: { email: string } }) => p.recipient.email)).toEqual(["carla@x.ch"])
    expect(payloads[0].data.shifts).toEqual([])
    // A waitlist entry's link would open on « introuvable »: none is sent.
    expect(payloads[0].data.editToken).toBeUndefined()
  })

  it("refuses an empty audience, a shift of another event, a bad body, and too many sends", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/message/route")
    expect((await POST(post({ ...base, audience: { kind: "role", roleName: "Sécurité" } }), params)).status).toBe(400)
    ;(db.shift as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(null)
    expect((await POST(post({ ...base, audience: { kind: "shift", shiftId: "other" } }), params)).status).toBe(400)
    expect((await POST(post({ audience: { kind: "event" }, subject: "", message: "x" }), params)).status).toBe(400)
    rateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfter: 60 })
    expect((await POST(post({ ...base, audience: { kind: "event" } }), params)).status).toBe(429)
    expect(enqueueNotifications).not.toHaveBeenCalled()
  })
})
