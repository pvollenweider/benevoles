// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

// Workload protection (#1171) is tested on Postgres: off here.
vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkScheduleEdit: vi.fn(async () => []),
}))

const m = vi.hoisted(() => ({
  txCreate: vi.fn(),
  confirmationCreate: vi.fn(),
  regFindMany: vi.fn().mockResolvedValue([]),
  txRegFindMany: vi.fn().mockResolvedValue([]),
  payloads: [] as { kind: string; data: Record<string, unknown> }[],
  logEvent: vi.fn(),
  leaders: vi.fn(),
  confirmation: vi.fn(),
  adminNotification: vi.fn(),
  events: [] as Record<string, unknown>[],
  txOverride: null as null | (() => Record<string, unknown>),
  previous: null as null | { id: string; registrations: { id: string; shiftId: string }[]; waitlistShiftIds: string[] },
  txRegUpdate: vi.fn().mockResolvedValue({ count: 1 }),
}))

vi.mock("@/lib/prisma", async () => {
  const { lockedShiftReads } = await import("./helpers/locked-shifts")
  const locked = lockedShiftReads()
  const tx = () => ({
    $queryRaw: vi.fn().mockResolvedValue([{ id: "locked", erasedAt: null, email: "lea@x.ch" }]),
    shift: { findMany: locked.tx(vi.fn().mockResolvedValue([])) },
    volunteer: { createMany: vi.fn().mockResolvedValue({ count: 1 }), findFirstOrThrow: vi.fn().mockResolvedValue({ id: "vol-1" }), update: vi.fn() },
    memberInvite: { findFirst: vi.fn().mockResolvedValue({ id: "inv-1" }) },
    charterVersion: { upsert: vi.fn() },
    rosterConsent: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    shiftDecline: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    registration: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: m.txRegFindMany,
      count: vi.fn().mockResolvedValue(1),
      aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }),
      create: m.txCreate,
      updateMany: m.txRegUpdate,
    },
    signupConfirmation: {
      findFirst: vi.fn(async () => m.previous),
      create: m.confirmationCreate,
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
    },
    questionAnswer: { upsert: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  })
  return ({
    prisma: {
      charterVersion: { upsert: vi.fn() },
      eventQuestion: { findMany: vi.fn().mockResolvedValue([]) },
      event: { findFirst: vi.fn(async () => m.events.shift()) },
      shift: {
        findMany: locked.top(vi.fn(async (args: { where?: { id?: { in?: string[] } }; select?: { roleName?: boolean } } | undefined) => {
          if (!args) return []
          if (args?.select?.roleName) return []
          const ids = args?.where?.id?.in ?? []
          return ids.map((id) => ({ id, label: id === "s1" ? "Accueil" : "Bar", roleName: id === "s1" ? "Accueil" : "Bar", capacity: id === "s1" ? 2 : 1, minAge: null, waitlistEnabled: true, requiresApproval: false, registrations: id === "s1" ? [] : [{ id: "other", status: "active" }], date: new Date("2030-06-01T00:00:00Z"), startTime: "08:00", endTime: "12:00" }))
        })),
      },
      volunteer: { findFirst: vi.fn().mockResolvedValue(null) },
      registration: { findMany: m.regFindMany, findFirst: vi.fn().mockResolvedValue(null) },
      memberInvite: { findFirst: vi.fn().mockResolvedValue({ id: "inv-1" }) },
      signupConfirmation: { findFirst: vi.fn(async () => m.previous) },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(m.txOverride ? m.txOverride() : tx())),
    },
  })
})
vi.mock("@/lib/notification-helpers", () => ({ sendConfirmationEmail: m.confirmation, sendAdminNotification: m.adminNotification }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => ({ payloads: m.payloads, send: async (p: { kind: string; data: Record<string, unknown> }) => { m.payloads.push(p); return { ok: true } } }),
  enqueueNotifications: vi.fn(async (payloads: { kind: string; data: Record<string, unknown> }[]) => { m.payloads.push(...payloads); return ["out-1"] }),
  deliverAfterResponse: vi.fn(),
}))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: m.leaders }))
vi.mock("@/lib/event-log", () => ({ logEvent: m.logEvent }))
vi.mock("@/lib/org-activity", () => ({ touchOrgActivity: vi.fn() }))
const promote = vi.hoisted(() => vi.fn())
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: promote }))

function event(over: Record<string, unknown> = {}) {
  return { id: "evt-1", organizationId: "org-a", title: "Fête", organization: { slug: "asso", timeZone: "Europe/Zurich" }, confirmationMessage: "Merci !", requireEmailConfirmation: true, ...over }
}

function post(extra: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `test-${Math.random()}` },
    body: JSON.stringify({ eventId: "evt-1", shiftIds: ["s1"], firstName: "Léa", lastName: "M", email: "lea@x.ch", consent: true, charterAccepted: true, ...extra }),
  })
}

describe("public sign-up confirmed by email (#1253)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.payloads.length = 0
    m.events = [event()]
    m.txOverride = null
    m.previous = null
    m.txRegUpdate.mockResolvedValue({ count: 1 })
    promote.mockResolvedValue(true)
    m.txCreate.mockImplementation(async ({ data }: { data: { shiftId: string; status: string } }) => ({ id: `reg-${data.shiftId}`, shiftId: data.shiftId, status: data.status, waitingPosition: null }))
    m.confirmationCreate.mockResolvedValue({ id: "conf-1" })
  })

  it("reserves the place provisionally, sends only the confirmation email, and says where to confirm", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(201)
    const created = m.txCreate.mock.calls[0][0].data
    expect(created.status).toBe("unconfirmed")
    expect(created.signupConfirmationId).toBe("conf-1")
    expect(m.confirmationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventId: "evt-1", email: "lea@x.ch", waitlistShiftIds: [], firstName: "Léa" }),
    }))
    // The database keeps the hash only, never the token carried by the email's link.
    const confirmationData = m.confirmationCreate.mock.calls[0][0].data
    expect(confirmationData.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(confirmationData).not.toHaveProperty("token")
    expect(m.payloads.map((p) => p.kind)).toEqual(["signup_email_confirmation"])
    const mail = m.payloads[0]
    expect(String(mail.data.confirmUrl)).toContain("/confirmation/")
    expect(mail.data.shifts).toEqual([expect.objectContaining({ label: "Accueil", waitlist: false })])
    // No usual confirmation, no admin notification, no sector leaders before the click.
    expect(m.confirmation).not.toHaveBeenCalled()
    expect(m.adminNotification).not.toHaveBeenCalled()
    expect(m.leaders).not.toHaveBeenCalled()
    expect(m.logEvent.mock.calls[0][0].action).toBe("registration.confirmation_requested")
    expect(await res.json()).toMatchObject({
      success: true, editToken: null, received: true, emailConfirmation: true,
      confirmationHeld: 1, confirmationWaiting: 0, confirmationTimeZone: "Europe/Zurich",
    })
  })

  it("does not reserve a full shift with a waitlist: only the confirmation email, entered at the click", async () => {
    m.events = [event()]
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ shiftIds: ["s2"] }))
    expect(res.status).toBe(201)
    expect(m.txCreate).not.toHaveBeenCalled()
    expect(m.confirmationCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ waitlistShiftIds: ["s2"] }) }))
    expect(m.payloads.map((p) => p.kind)).toEqual(["signup_email_confirmation"])
    expect(await res.json()).toMatchObject({ confirmationHeld: 0, confirmationWaiting: 1 })
  })

  it("with a valid personal link, follows the usual path directly: a firm place, no confirmation email", async () => {
    m.events = [event()]
    const { prisma } = await import("@/lib/prisma")
    vi.mocked(prisma.volunteer.findFirst).mockResolvedValueOnce({ id: "vol-1" } as never)
    vi.mocked(prisma.registration.findFirst).mockResolvedValueOnce({ id: "reg-old", volunteerId: "vol-1", phone: null, volunteer: { firstName: "Léa", lastName: "M", phone: null } } as never)
    // The personal link is this member's, on this event.
    m.txOverride = () => ({
      $queryRaw: vi.fn().mockResolvedValue([{ id: "vol-1", erasedAt: null, email: "lea@x.ch" }]),
      shift: { findMany: vi.fn().mockResolvedValue([{ id: "s1", status: "open", capacity: 2, waitlistEnabled: true, requiresApproval: false, date: new Date("2030-06-01T00:00:00Z"), startTime: "08:00", endTime: "12:00", label: "Accueil", roleName: "Accueil", minAge: null, overlapAllowed: false, mealOnTheGo: false, placeId: null }]) },
      volunteer: { createMany: vi.fn(), findFirstOrThrow: vi.fn(), update: vi.fn() },
      memberInvite: { findFirst: vi.fn().mockResolvedValue(null) },
      charterVersion: { upsert: vi.fn() },
      rosterConsent: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
      shiftDecline: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      registration: {
        findFirst: vi.fn(async (args: { where?: { editTokenHash?: string; volunteerId?: string; shiftId?: { in?: string[] } } }) => {
          if (args?.where?.volunteerId && args?.where?.shiftId) return null
          if (args?.where?.editTokenHash) return { id: "reg-old", volunteerId: "vol-1", phone: null, volunteer: { firstName: "Léa", lastName: "M", phone: null } }
          return null
        }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }),
        create: m.txCreate,
      },
      signupConfirmation: { findFirst: vi.fn().mockResolvedValue(null), create: m.confirmationCreate, updateMany: vi.fn() },
      eventQuestion: { findMany: vi.fn().mockResolvedValue([]) },
      questionAnswer: { upsert: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ personalToken: "tok-personal" }))
    expect(res.status).toBe(201)
    expect((m.txCreate.mock.calls[0][0] as { data: { status: string } }).data.status).toBe("active")
    expect(m.payloads.map((p) => p.kind)).not.toContain("signup_email_confirmation")
    expect(await res.json()).toMatchObject({ editToken: expect.any(String), activeShifts: 1 })
  })

  it("without the option, the immediate sign-up is unchanged", async () => {
    m.events = [event({ requireEmailConfirmation: false })]
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(201)
    expect(m.txCreate.mock.calls[0][0].data.status).toBe("active")
    expect(m.payloads.map((p) => p.kind)).not.toContain("signup_email_confirmation")
    expect(await res.json()).toMatchObject({ received: true, linkSentByEmail: true })
  })

  it("a new request for the same address replaces the previous pending one and frees its places", async () => {
    m.previous = { id: "conf-old", registrations: [{ id: "reg-old", shiftId: "s1" }], waitlistShiftIds: [] }
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(201)
    // The previous request is cancelled, its provisional place freed in the same transaction.
    expect(m.txRegUpdate).toHaveBeenCalledWith({ where: { id: { in: ["reg-old"] }, status: "unconfirmed" }, data: { status: "cancelled" } })
    expect(promote).toHaveBeenCalledWith("s1")
    expect(m.confirmationCreate).toHaveBeenCalled()
    expect(await res.json()).toMatchObject({ emailConfirmation: true, confirmationHeld: 1 })
  })
})
