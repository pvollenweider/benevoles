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
vi.mock("@/lib/token-vault", () => ({ registrationToken: { reveal: (r: { id: string }) => `tok-${r.id}` }, linkToken: { reveal: (r: { tokenLegacy: string }) => r.tokenLegacy } }))
const push = vi.hoisted(() => ({ pushDeviceCount: vi.fn().mockResolvedValue(0), sendTargetedPush: vi.fn().mockResolvedValue({ sent: 0, failed: 0, removed: 0 }) }))
vi.mock("@/lib/push", () => push)
const afterCallbacks = vi.hoisted(() => [] as (() => unknown)[])
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { afterCallbacks.push(fn) } }))
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
const historyCreate = vi.fn()

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
      // History row and emails in one transaction (#467).
      $transaction: async (fn: (tx: unknown) => unknown) => fn({ targetedMessage: { create: historyCreate } }),
    }
    historyCreate.mockResolvedValue({ id: "msg-1" })
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "adm-1", name: "Léa Admin" } } })
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
    expect(await res.json()).toEqual({ sent: 1, audience: "les bénévoles du poste « Bar »", pushDevices: 0 })
    const payloads = enqueueNotifications.mock.calls[0][0]
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toMatchObject({ kind: "targeted_message", recipient: { email: "alice@x.ch" }, data: { subject: base.subject, message: base.message, editToken: "tok-r1" } })
    expect(payloads[0].data.shifts.map((s: { label: string }) => s.label)).toEqual(["Bar", "Bar soir"])
    expect(payloads[0].dedupeKey).toMatch(/^message:.+:alice$/)
    expect(deliverAfterResponse).toHaveBeenCalledWith(["row-1", "row-2"])
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "message.sent", entityType: "Event", changes: { recipients: { to: 1 } } })
    // Exactly one history row (#467), with the author, the text, the audience and the count, and
    // the emails linked to it.
    expect(historyCreate).toHaveBeenCalledOnce()
    expect(historyCreate.mock.calls[0][0].data).toEqual({
      organizationId: "org-a", eventId: "evt-a", authorId: "adm-1", authorName: "Léa Admin",
      subject: base.subject, message: base.message, audienceLabel: "les bénévoles du poste « Bar »", recipientCount: 1,
      pushRequested: false, pushDevices: 0,
    })
    expect(enqueueNotifications.mock.calls[0][2]).toEqual({ organizationId: "org-a", targetedMessageId: "msg-1" })
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

  it("adds a push to the recipients' devices when asked, after the response, apart from the emails (#468)", async () => {
    push.pushDeviceCount.mockResolvedValue(2)
    afterCallbacks.length = 0
    const { POST } = await import("@/app/api/admin/events/[id]/message/route")
    const dry = await POST(post({ ...base, audience: { kind: "role", roleName: "Bar" }, dryRun: true }), params)
    expect(await dry.json()).toMatchObject({ recipients: 1, pushDevices: 2 })
    const res = await POST(post({ ...base, message: "Parking nord.\nDétails ci-dessous.", audience: { kind: "role", roleName: "Bar" }, push: true }), params)
    expect(await res.json()).toMatchObject({ sent: 1, pushDevices: 2 })
    expect(historyCreate.mock.calls[0][0].data).toMatchObject({ pushRequested: true, pushDevices: 2 })
    expect(enqueueNotifications).toHaveBeenCalledOnce() // the email goes anyway
    expect(push.sendTargetedPush).not.toHaveBeenCalled()
    for (const fn of afterCallbacks) await fn()
    expect(push.sendTargetedPush).toHaveBeenCalledWith("msg-1", [{ volunteerId: "alice", url: "/my/tok-r1", title: base.subject, body: "Parking nord." }], { title: base.subject, body: "Parking nord.", tag: "message-msg-1" })
  })

  it("sends no push without the option", async () => {
    push.pushDeviceCount.mockResolvedValue(0)
    afterCallbacks.length = 0
    const { POST } = await import("@/app/api/admin/events/[id]/message/route")
    await POST(post({ ...base, audience: { kind: "event" } }), params)
    for (const fn of afterCallbacks) await fn()
    expect(push.sendTargetedPush).not.toHaveBeenCalled()
  })

  it("writes to invited people without a confirmed shift, with their invitation link (#481)", async () => {
    Object.assign(db, {
      memberInvite: {
        findMany: vi.fn().mockResolvedValue([
          { volunteerId: "alice", sentAt: new Date("2026-06-01"), tokenEnc: null, tokenLegacy: "inv-alice", volunteer: { firstName: "Alice", email: "alice@x.ch" } },
          { volunteerId: "dan", sentAt: new Date("2026-06-01"), tokenEnc: null, tokenLegacy: "inv-dan", volunteer: { firstName: "Dan", email: "dan@x.ch" } },
          { volunteerId: "carla", sentAt: new Date("2026-06-01"), tokenEnc: null, tokenLegacy: "inv-carla", volunteer: { firstName: "Carla", email: "carla@x.ch" } },
        ]),
      },
    })
    const { POST } = await import("@/app/api/admin/events/[id]/message/route")
    const dry = await (await POST(post({ ...base, audience: { kind: "invited_without_shift" }, dryRun: true }), params)).json()
    // Alice has confirmed shifts; Dan has nothing; Carla is only on the waitlist.
    expect(dry).toMatchObject({ recipients: 2, waitlistOnly: 1, audience: "les invités sans créneau confirmé" })
    enqueueNotifications.mockClear()
    await POST(post({ ...base, audience: { kind: "invited_without_shift" } }), params)
    const payloads = enqueueNotifications.mock.calls[0][0]
    expect(payloads.map((p: { recipient: { email: string } }) => p.recipient.email).sort()).toEqual(["carla@x.ch", "dan@x.ch"])
    for (const p of payloads) {
      expect(p.data.shifts).toEqual([])
      expect(p.data.editToken).toBeUndefined()
      expect(new URL(p.data.signupUrl).searchParams.get("token")).toMatch(/^inv-/)
    }
  })

  it("replaces template variables per recipient and refuses unknown or misplaced ones (#482)", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/message/route")
    const bad = await POST(post({ subject: "Bonjour {nom}", message: "x", audience: { kind: "event" } }), params)
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toMatch(/Variable inconnue/)
    expect((await POST(post({ subject: "Salut", message: "Au {poste}", audience: { kind: "event" } }), params)).status).toBe(400)
    enqueueNotifications.mockClear()
    const ok = await POST(post({ subject: "Merci {prénom}", message: "{prénom}, le poste {poste} de {événement} compte sur toi. {{code}}", audience: { kind: "role", roleName: "Bar" } }), params)
    expect(ok.status).toBe(200)
    const [payload] = enqueueNotifications.mock.calls[0][0]
    expect(payload.data.subject).toBe("Merci Alice")
    expect(payload.data.message).toBe("Alice, le poste Bar de Fête compte sur toi. {code}")
    // The history keeps the text as written.
    expect(historyCreate.mock.calls.at(-1)![0].data.subject).toBe("Merci {prénom}")
  })
})
