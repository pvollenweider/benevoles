import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))

const enqueueNotifications = vi.hoisted(() => vi.fn().mockResolvedValue(["row-1", "row-2"]))
const deliverAfterResponse = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications, enqueueBatch: enqueueNotifications, deliverAfterResponse }))

const rateLimit = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, remaining: 1, retryAfter: 0 }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit }))
const push = vi.hoisted(() => ({ pushDeviceCount: vi.fn().mockResolvedValue(0), sendTargetedPush: vi.fn().mockResolvedValue({ sent: 0, failed: 0, removed: 0 }) }))
vi.mock("@/lib/push", () => push)
const afterCallbacks = vi.hoisted(() => [] as (() => unknown)[])
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { afterCallbacks.push(fn) } }))
vi.mock("@/lib/token-vault", () => ({
  registrationToken: { select: { editTokenEnc: true, editTokenLegacy: true }, reveal: (r: { volunteerId: string }) => `edit-${r.volunteerId}` },
  linkToken: { select: { tokenEnc: true, tokenLegacy: true }, data: () => ({ tokenHash: "h", tokenEnc: null, tokenLegacy: "new" }), reveal: (r: { volunteerId: string }) => `inv-${r.volunteerId}` },
}))

const day = (d: string) => new Date(`${d}T00:00:00Z`)
const shift = (id: string, roleName: string, date: string, startTime: string, endTime: string, capacity: number, registrations: { volunteerId: string; status: string }[] = [], over: Record<string, unknown> = {}) => ({
  id, roleName, label: roleName, date: day(date), startTime, endTime, capacity, status: "open", reservedTags: [], registrations, ...over,
})

const event = {
  id: "evt-a", title: "Fête", slug: "fete", organizationId: "org-a",
  publicStatus: "published", registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  organization: { name: "Asso", slug: "asso", timeZone: "Europe/Zurich" },
  shifts: [
    shift("bar", "Bar", "2026-07-04", "22:00", "02:00", 3, [{ volunteerId: "reg", status: "active" }]),
    shift("early", "Accueil", "2026-07-04", "18:00", "22:15", 1, [{ volunteerId: "ovl", status: "active" }]),
    shift("full", "Caisse", "2026-07-05", "10:00", "12:00", 1, [{ volunteerId: "reg", status: "active" }]),
  ],
}
const volunteers = [
  { id: "ana", firstName: "Ana", lastName: "Abel", email: "ana@x.ch", active: true, tags: [], availabilityPeriods: [], availabilityNote: null },
  { id: "bob", firstName: "Bob", lastName: "Bez", email: "bob@x.ch", active: true, tags: [], availabilityPeriods: [], availabilityNote: null },
  { id: "reg", firstName: "Rémi", lastName: "Reg", email: "reg@x.ch", active: true, tags: [], availabilityPeriods: [], availabilityNote: null },
  { id: "ovl", firstName: "Olga", lastName: "Ovl", email: "ovl@x.ch", active: true, tags: [], availabilityPeriods: [], availabilityNote: null },
  { id: "ina", firstName: "Ines", lastName: "Ina", email: "ina@x.ch", active: false, tags: [], availabilityPeriods: [], availabilityNote: null },
  { id: "dec", firstName: "Dan", lastName: "Dec", email: "dec@x.ch", active: true, tags: [], availabilityPeriods: [], availabilityNote: null },
]

let db: Record<string, unknown>
const historyCreate = vi.fn()
const createManyAndReturn = vi.fn()
const txInviteFindMany = vi.fn()

const post = (body: unknown) =>
  new Request("http://localhost/api/admin/events/evt-a/open-shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "evt-a" }) }

describe("POST /api/admin/events/[id]/open-shifts (#566)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    enqueueNotifications.mockResolvedValue(["row-1", "row-2"])
    rateLimit.mockResolvedValue({ ok: true, remaining: 1, retryAfter: 0 })
    push.pushDeviceCount.mockResolvedValue(0)
    push.sendTargetedPush.mockResolvedValue({ sent: 0, failed: 0, removed: 0 })
    afterCallbacks.length = 0
    historyCreate.mockResolvedValue({ id: "msg-1" })
    createManyAndReturn.mockResolvedValue([{ id: "inv-new-bob", volunteerId: "bob" }])
    txInviteFindMany.mockResolvedValue([{ volunteerId: "ana" }, { volunteerId: "bob" }])
    db = {
      event: { findFirst: vi.fn().mockResolvedValue(event) },
      volunteer: { findMany: vi.fn().mockResolvedValue(volunteers) },
      memberInvite: { findMany: vi.fn().mockResolvedValue([{ volunteerId: "ana", declinedAt: null }, { volunteerId: "dec", declinedAt: new Date() }]) },
      shiftDecline: { findMany: vi.fn().mockResolvedValue([{ volunteerId: "dec", shiftId: "bar", declinedAt: new Date("2026-06-20T10:00:00Z") }]) },
      questionAnswer: { findMany: vi.fn().mockResolvedValue([]) },
      registration: { findMany: vi.fn().mockResolvedValue([{ volunteerId: "reg" }]) },
      $transaction: async (fn: (tx: unknown) => unknown) => fn({
        memberInvite: { createManyAndReturn, findMany: txInviteFindMany },
        targetedMessage: { create: historyCreate },
      }),
    }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "adm-1", name: "Léa Admin" } } })
  })

  it("never proposes a role assigned by the organisation only (#1145): its shifts are refused, as no longer open", async () => {
    const assigned = { ...event, shifts: event.shifts.map((s) => (s.id === "bar" ? { ...s, assignedOnly: true } : s)) }
    ;(db.event as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(assigned)
    const { POST } = await import("@/app/api/admin/events/[id]/open-shifts/route")
    const res = await POST(post({ shiftIds: ["bar"], volunteerIds: ["ana"], dryRun: true }), params)
    expect(res.status).toBe(409)
    expect(createManyAndReturn).not.toHaveBeenCalled()
    expect(enqueueNotifications).not.toHaveBeenCalled()
    const { loadOpenShiftsContext } = await import("@/lib/open-shifts-data")
    const ctx = await loadOpenShiftsContext(db as never, "evt-a")
    expect(ctx!.openShifts.map((x) => x.id)).not.toContain("bar")
    expect(ctx!.assignedOnlyLeftOut).toBe(1)
  })

  it("dry run: previews the first person's email, creates and sends nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/open-shifts/route")
    const res = await POST(post({ shiftIds: ["bar"], volunteerIds: ["ana", "bob"], dryRun: true }), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ recipients: 2, skipped: 0, noLongerOpen: 0, newInvitations: 1, audience: "les membres choisis pour 1 créneau à compléter", previewName: "Ana", pushDevices: 0 })
    expect(body.preview.subject).toBe("Fête : on cherche encore du monde")
    expect(body.preview.html).toContain("2 places libres")
    expect(createManyAndReturn).not.toHaveBeenCalled()
    expect(enqueueNotifications).not.toHaveBeenCalled()
    expect(rateLimit).not.toHaveBeenCalled()
  })

  it("sends one email per selected person with their link, creates missing invitations, records the history", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/open-shifts/route")
    const res = await POST(post({ shiftIds: ["bar"], volunteerIds: ["ana", "bob", "reg"], note: "Merci !" }), params)
    expect(res.status).toBe(200)
    // Rémi is already on « bar »: never written to, counted as skipped.
    expect(await res.json()).toEqual({ sent: 2, skipped: 1, noLongerOpen: 0, newInvitations: 1, audience: "les membres choisis pour 1 créneau à compléter", pushRequested: false, pushDevices: 0 })

    expect(createManyAndReturn.mock.calls[0][0]).toMatchObject({ skipDuplicates: true, data: [{ eventId: "evt-a", volunteerId: "bob" }] })
    const payloads = enqueueNotifications.mock.calls[0][0]
    expect(payloads.map((p: { recipient: { email: string } }) => p.recipient.email)).toEqual(["ana@x.ch", "bob@x.ch"])
    expect(payloads[0]).toMatchObject({ kind: "open_shifts", volunteerId: "ana", data: { note: "Merci !", eventTitle: "Fête" } })
    expect(payloads[0].dedupeKey).toMatch(/^open-shifts:.+:ana$/)
    expect(payloads[0].data.signupUrl).toContain("token=inv-ana")
    expect(payloads[1].data.signupUrl).toContain("token=inv-bob")
    expect(payloads[1].data.declineUrl).toContain("decline=1")
    expect(payloads[0].data.shifts).toEqual([expect.objectContaining({ id: "bar", placesLeft: 2 })])
    expect(payloads[0].data.shiftDeclineUrls.bar).toContain("/ne-peux-pas/invitation/inv-ana/bar")
    expect(enqueueNotifications.mock.calls[0][2]).toEqual({ organizationId: "org-a", targetedMessageId: "msg-1", batch: expect.objectContaining({ kind: "open_shifts" }) })
    expect(deliverAfterResponse).toHaveBeenCalledWith(["row-1", "row-2"])

    expect(historyCreate.mock.calls[0][0].data).toEqual({
      organizationId: "org-a", eventId: "evt-a", authorId: "adm-1", authorName: "Léa Admin",
      subject: "On cherche encore du monde",
      message: "Merci !\n\nCréneaux proposés :\n- Bar : samedi 4 juillet, de 22:00 à 02:00 le lendemain, 2 places libres",
      audienceLabel: "les membres choisis pour 1 créneau à compléter",
      recipientCount: 2,
      pushRequested: false,
      pushDevices: 0,
    })
    expect(rateLimit).toHaveBeenCalledWith("org:org-a", "targeted-message", 30, 3600000)
    expect(logEvent.mock.calls.map((c) => c[0].action)).toEqual(["memberinvite.sent", "message.sent"])
  })

  it("gives members registered without an invitation the event page and their personal page", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/open-shifts/route")
    const res = await POST(post({ shiftIds: ["bar"], volunteerIds: ["ovl"] }), params)
    // Olga's own shift overlaps « bar » by 15 min: nothing to offer, refused.
    expect(res.status).toBe(400)
    // Rémi is on « bar » and « full » with no invitation: a new shift with room is offered to him.
    ;(db.event as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
      ...event, shifts: [...event.shifts, shift("acc", "Accueil", "2026-07-06", "10:00", "12:00", 2)],
    })
    const ok = await POST(post({ shiftIds: ["acc"], volunteerIds: ["reg"] }), params)
    expect(ok.status).toBe(200)
    const [payload] = enqueueNotifications.mock.calls[0][0]
    expect(payload.data).toMatchObject({ signupUrl: expect.not.stringContaining("token="), editToken: "edit-reg" })
    expect(payload.data.declineUrl).toBeUndefined()
    expect(payload.data.shiftDeclineUrls.acc).toContain("/ne-peux-pas/inscription/edit-reg/acc")
    expect(createManyAndReturn).not.toHaveBeenCalled()
  })

  it("leaves out declined members unless asked, and inactive ones always", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/open-shifts/route")
    expect((await POST(post({ shiftIds: ["bar"], volunteerIds: ["dec", "ina"] }), params)).status).toBe(400)
    const res = await POST(post({ shiftIds: ["bar"], volunteerIds: ["dec", "ina"], includeDeclined: true }), params)
    expect(await res.json()).toMatchObject({ sent: 1, skipped: 1 })
  })

  it("refuses shifts that are no longer open, closed registrations, a bad body and too many sends", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/open-shifts/route")
    expect((await POST(post({ shiftIds: ["full"], volunteerIds: ["ana"] }), params)).status).toBe(409)
    expect((await POST(post({ shiftIds: [], volunteerIds: ["ana"] }), params)).status).toBe(400)
    rateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfter: 60 })
    expect((await POST(post({ shiftIds: ["bar"], volunteerIds: ["ana"] }), params)).status).toBe(429)
    ;(db.event as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({ ...event, registrationsOpen: false })
    expect((await POST(post({ shiftIds: ["bar"], volunteerIds: ["ana"] }), params)).status).toBe(409)
    expect(enqueueNotifications).not.toHaveBeenCalled()
  })

  it("never writes to an id that isn't a member of this organization", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/open-shifts/route")
    // The members come from the organization-scoped client only: another org's id is unknown here.
    const res = await POST(post({ shiftIds: ["bar"], volunteerIds: ["mem-of-org-b"] }), params)
    expect(res.status).toBe(400)
    expect(enqueueNotifications).not.toHaveBeenCalled()
    expect(createManyAndReturn).not.toHaveBeenCalled()
  })

  it("reports a shift filled meanwhile and proposes only the others", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/open-shifts/route")
    const res = await POST(post({ shiftIds: ["bar", "full"], volunteerIds: ["ana"], dryRun: true }), params)
    expect(await res.json()).toMatchObject({ recipients: 1, noLongerOpen: 1 })
  })

  it("« Inscrits aujourd'hui » is applied again at send time (#1304)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-04T20:00:00Z")) // 22:00 in Zurich
    try {
      ;(db.event as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
        ...event,
        shifts: [...event.shifts, shift("acc", "Accueil", "2026-07-04", "10:00", "12:00", 2)],
      })
      const { POST } = await import("@/app/api/admin/events/[id]/open-shifts/route")
      const res = await POST(post({ shiftIds: ["acc"], volunteerIds: ["ana", "reg", "ovl"], registeredToday: true }), params)
      expect(res.status).toBe(200)
      // Ana has no registration today; Rémi and Olga do. The page's list is not trusted.
      expect(await res.json()).toMatchObject({ sent: 2, skipped: 1 })
      const payloads = enqueueNotifications.mock.calls[0][0]
      expect(payloads.map((p: { volunteerId: string }) => p.volunteerId)).toEqual(["ovl", "reg"])
    } finally {
      vi.useRealTimers()
    }
  })

  it("adds a push with each recipient's link and the shift's own time to live (#1304)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-04T20:00:00Z")) // 22:00 in Zurich
    try {
      push.pushDeviceCount.mockResolvedValue(2)
      const { POST } = await import("@/app/api/admin/events/[id]/open-shifts/route")
      const dry = await POST(post({ shiftIds: ["bar"], volunteerIds: ["ana", "bob"], push: true, dryRun: true }), params)
      expect(await dry.json()).toMatchObject({ recipients: 2, pushDevices: 2 })
      afterCallbacks.length = 0

      const res = await POST(post({ shiftIds: ["bar"], volunteerIds: ["ana", "bob"], push: true }), params)
      expect(await res.json()).toMatchObject({ sent: 2, pushRequested: true, pushDevices: 2 })
      expect(historyCreate.mock.calls[0][0].data).toMatchObject({ pushRequested: true, pushDevices: 2 })
      expect(push.sendTargetedPush).not.toHaveBeenCalled()
      for (const fn of afterCallbacks) await fn()
      const [messageId, targets, payload] = push.sendTargetedPush.mock.calls[0]
      expect(messageId).toBe("msg-1")
      // Its TTL ends with the need (02:00 next day), not after the three days used elsewhere.
      expect(targets.map((t: { volunteerId: string; ttlSeconds: number }) => [t.volunteerId, t.ttlSeconds])).toEqual([["ana", 14_400], ["bob", 14_400]])
      expect(targets[0].url).toContain("token=inv-ana")
      expect(targets[1].url).toContain("token=inv-bob")
      expect(payload).toMatchObject({ title: "Fête : on cherche encore du monde", body: "Bar : 2 places libres." })
      expect(payload.tag).toMatch(/^open-shifts-[0-9a-f-]+$/)
    } finally {
      vi.useRealTimers()
    }
  })

  it("serves the page's list for one shift, read-only and org-scoped (#1304)", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/open-shifts/route")
    const res = await GET(new Request("http://localhost/api/admin/events/evt-a/open-shifts?shift=bar"), params)
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    const body = await res.json()
    expect(body.shift).toMatchObject({ id: "bar", placesLeft: 2 })
    expect(body.shifts.map((s: { id: string }) => s.id)).toEqual(["bar"])
    expect(body.members.map((m: { id: string }) => m.id)).toContain("ana")
    expect((await GET(new Request("http://localhost/api/admin/events/evt-a/open-shifts"), params)).status).toBe(400)
    expect((await GET(new Request("http://localhost/api/admin/events/evt-a/open-shifts?shift=full"), params)).status).toBe(404)
  })
})
