// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  checkDutyChange: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/lib/signup-notifications", () => ({
  buildSignupNotifications: vi.fn(async () => [{
    kind: "registration_confirmation", recipient: { email: "lea@x.ch" }, organizationId: "org-a",
    data: { shifts: [], editToken: "tok" }, dedupeKey: "registration_confirmation:reg-1:lea@x.ch",
  }]),
}))
vi.mock("@/lib/roster-consent-write", () => ({ applySignupRosterChoice: vi.fn() }))
vi.mock("@/lib/shift-decline-clear", () => ({ clearShiftDeclines: vi.fn() }))
vi.mock("@/lib/event-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/event-log")>()),
  logEvent: vi.fn(),
}))

const m = vi.hoisted(() => ({
  top: vi.fn(),
  tx: vi.fn(),
  claim: vi.fn(),
  regUpdate: vi.fn(),
  create: vi.fn(),
  enqueue: vi.fn(),
  deliver: vi.fn(),
  log: vi.fn(),
  due: vi.fn(),
  shiftReopen: vi.fn(),
  current: null as ReturnType<typeof row> | null,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    signupConfirmation: { findUnique: m.top, findMany: m.due },
    shift: { findMany: vi.fn(async () => [shift]), findUnique: vi.fn(async () => ({ capacity: 2, status: "full" })), updateMany: m.shiftReopen },
    registration: { count: vi.fn(async () => 0) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(m.tx())),
  },
}))

vi.mock("@/lib/notifications/outbox", () => ({
  enqueueNotifications: m.enqueue,
  deliverAfterResponse: m.deliver,
}))
vi.mock("@/lib/event-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/event-log")>()),
  logEvent: m.log,
}))

const now = new Date("2026-11-10T10:00:00Z")
const shift = {
  id: "s1", eventId: "evt-1", label: "Accueil", roleName: "Accueil", date: new Date("2026-11-14T00:00:00Z"),
  startTime: "10:00", endTime: "12:00", capacity: 2, status: "open", waitlistEnabled: true,
  requiresApproval: false, mealOnTheGo: false, placeId: null, minAge: null, assignedOnly: false, place: null,
}
const org = { name: "Asso", slug: "asso", timeZone: "Europe/Zurich", active: true, suspendedAt: null }
const event = { id: "evt-1", title: "Fête", slug: "fete", publicStatus: "published", organizationId: "org-a", confirmationMessage: "Merci", cancelDeadlineDays: null, cancelDeadlineHours: null, latitude: null, longitude: null, shiftRosterEnabled: false, startDate: new Date("2026-11-14"), organization: org }
const reg = { id: "reg-1", shiftId: "s1", status: "unconfirmed", waitingPosition: null, editTokenEnc: null, editTokenLegacy: "tok-reg", shift }
const row = (over: Record<string, unknown> = {}) => ({
  id: "conf-1", eventId: "evt-1", volunteerId: "vol-1", email: "lea@x.ch", firstName: "Léa", lastName: "M",
  phone: null, birthDate: null, comment: null, expiresAt: new Date("2026-11-11T10:00:00Z"), confirmedAt: null,
  cancelledAt: null, cancelReason: null, resultActive: null, resultRequested: null, resultWaiting: null,
  charterAcceptedHash: "h", charterAcceptedAt: now, groupLinkId: null, source: "public_form",
  waitlistShiftIds: [], answers: null, rosterNameVisible: false, rosterNoticeVersion: null,
  event: { ...event, organization: org }, registrations: [reg], ...over,
})

describe("confirmation by email: the button, never the link (#1253)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.top.mockResolvedValue(row())
    m.claim.mockResolvedValue({ count: 1 })
    m.regUpdate.mockResolvedValue({ count: 1 })
    m.enqueue.mockResolvedValue(["out-1"])
    m.due.mockResolvedValue([])
    m.shiftReopen.mockResolvedValue({ count: 1 })
    m.log.mockResolvedValue({ id: "log-1" })
    m.current = row()
    m.top.mockResolvedValue(m.current)
    m.tx.mockReturnValue({
      $queryRaw: vi.fn().mockResolvedValue([{ id: "s1" }]),
      signupConfirmation: {
        findUnique: vi.fn(async () => m.current),
        updateMany: m.claim,
        update: vi.fn(),
      },
      shift: { findMany: vi.fn(async () => [shift]) },
      registration: {
        updateMany: m.regUpdate,
        count: vi.fn(async () => 0),
        aggregate: vi.fn(async () => ({ _max: { waitingPosition: null } })),
        create: m.create,
      },
      volunteer: { update: vi.fn() },
      questionAnswer: { upsert: vi.fn() },
    })
  })

  it("a POST confirms the held place and queues the usual confirmation", async () => {
    const { POST } = await import("@/app/api/public/confirmations/[token]/confirm/route")
    const res = await POST(new Request("http://localhost/api/public/confirmations/tok/confirm", { method: "POST" }), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, already: false, counts: { active: 1, requested: 0, waiting: 0 } })
    expect(m.claim).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "conf-1", confirmedAt: null }), data: { confirmedAt: expect.any(Date) } }))
    expect(m.regUpdate.mock.calls[0][0]).toMatchObject({ where: { id: "reg-1", signupConfirmationId: "conf-1", status: "unconfirmed" }, data: { status: "active" } })
    expect(m.enqueue).toHaveBeenCalled()
    expect(m.deliver).toHaveBeenCalledWith(["out-1"])
    expect(m.log.mock.calls[0][0].action).toBe("registration.confirmed_by_email")
  })

  it("a repeated POST returns the recorded result without writing again", async () => {
    m.top.mockResolvedValue(row({ confirmedAt: now, resultActive: 1, resultRequested: 0, resultWaiting: 0 }))
    const { POST } = await import("@/app/api/public/confirmations/[token]/confirm/route")
    const res = await POST(new Request("http://localhost/api/public/confirmations/tok/confirm", { method: "POST" }), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, already: true, counts: { active: 1, requested: 0, waiting: 0 } })
    expect(m.claim).not.toHaveBeenCalled()
  })

  it("an expired link changes nothing and explains how to ask again", async () => {
    m.top.mockResolvedValue(row({ expiresAt: new Date("2026-11-10T09:00:00Z") }))
    const { POST } = await import("@/app/api/public/confirmations/[token]/confirm/route")
    const res = await POST(new Request("http://localhost/api/public/confirmations/tok/confirm", { method: "POST" }), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(410)
    expect((await res.json()).error).toContain("Refais une demande")
    expect(m.claim).not.toHaveBeenCalled()
    expect(m.regUpdate).not.toHaveBeenCalled()
  })

  it("a replaced link points to the newer request, and writes nothing", async () => {
    m.top.mockResolvedValue(row({ cancelledAt: now, cancelReason: "replaced" }))
    const { POST } = await import("@/app/api/public/confirmations/[token]/confirm/route")
    const res = await POST(new Request("http://localhost/api/public/confirmations/tok/confirm", { method: "POST" }), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(410)
    expect((await res.json()).error).toContain("dernier email")
    expect(m.claim).not.toHaveBeenCalled()
  })

  it("a place reassigned is not confirmed again", async () => {
    m.top.mockResolvedValue(row({ waitlistShiftIds: [], registrations: [{ ...reg, status: "cancelled" }] }))
    const { POST } = await import("@/app/api/public/confirmations/[token]/confirm/route")
    const res = await POST(new Request("http://localhost/api/public/confirmations/tok/confirm", { method: "POST" }), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(410)
    expect((await res.json()).error).toContain("plus disponibles")
  })

  it("opening the page is read-only", async () => {
    const { signupConfirmationView } = await import("@/lib/signup-confirmation-server")
    const view = await signupConfirmationView("tok", now)
    expect(view.state).toBe("pending")
    expect(m.claim).not.toHaveBeenCalled()
    expect(m.regUpdate).not.toHaveBeenCalled()
  })

  it("the cron frees an expired provisional place and hands its shift back for the waitlist", async () => {
    m.due.mockResolvedValue([{ id: "conf-1" }])
    const { expireSignupConfirmations } = await import("@/lib/signup-confirmation-server")
    const result = await expireSignupConfirmations(new Date("2026-11-11T11:00:00Z"))
    expect(result).toEqual({ expired: 1, shifts: ["s1"] })
    expect(m.claim).toHaveBeenCalledWith(expect.objectContaining({ data: { cancelledAt: expect.any(Date), cancelReason: "expired" } }))
    expect(m.regUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "cancelled" } }))
    expect(m.shiftReopen).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "open" } }))
  })

  it("a « Sur validation » shift becomes a normal request after the click", async () => {
    const tx = m.tx()
    tx.shift.findMany = vi.fn(async () => [{ ...shift, requiresApproval: true }])
    m.tx.mockReturnValue(tx)
    const { POST } = await import("@/app/api/public/confirmations/[token]/confirm/route")
    const res = await POST(new Request("http://localhost/api/public/confirmations/tok/confirm", { method: "POST" }), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, counts: { active: 0, requested: 1, waiting: 0 } })
    expect(m.regUpdate.mock.calls[0][0].data.status).toBe("requested")
    expect(m.enqueue).toHaveBeenCalled()
  })

  it("a full shift with a waitlist enters it only now, with the rank taken at the click", async () => {
    m.current = row({ registrations: [], waitlistShiftIds: ["s2"] })
    m.top.mockResolvedValue(m.current)
    const tx = m.tx()
    tx.signupConfirmation.findUnique = vi.fn(async () => m.current)
    tx.shift.findMany = vi.fn(async () => [{ ...shift, id: "s2", label: "Bar", roleName: "Bar", capacity: 1 }])
    tx.registration.count = vi.fn(async () => 1)
    tx.registration.aggregate = vi.fn(async () => ({ _max: { waitingPosition: null } }))
    m.create.mockResolvedValue({ id: "reg-w", shiftId: "s2", status: "waiting", waitingPosition: 1 })
    m.tx.mockReturnValue(tx)
    const { POST } = await import("@/app/api/public/confirmations/[token]/confirm/route")
    const res = await POST(new Request("http://localhost/api/public/confirmations/tok/confirm", { method: "POST" }), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, counts: { active: 0, requested: 0, waiting: 1 } })
    expect(m.create.mock.calls[0][0].data).toMatchObject({ shiftId: "s2", status: "waiting", waitingPosition: 1 })
  })
})
