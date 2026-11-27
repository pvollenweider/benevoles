// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

// Workload protection (#1171) runs on Postgres: off here.
vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkScheduleEdit: vi.fn(async () => []),
}))

// Public sign-up and the event setting (#1467): two overlapping shifts are refused by default and
// accepted when the event allows overlaps, in the same early check and under the lock. The
// pending-request path (confirmation by email) uses the same selection check.

const m = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  shiftFindMany: vi.fn(),
  volFindFirst: vi.fn(),
  txVolCreateMany: vi.fn(),
  txVolFindFirstOrThrow: vi.fn(),
  txQueryRaw: vi.fn(),
  txRegFindMany: vi.fn(),
  txRegFindFirst: vi.fn(),
  txCount: vi.fn(),
  txCreate: vi.fn(),
  txSignupConfirmationCreate: vi.fn(),
  topRegFindMany: vi.fn(),
  enqueueNotifications: vi.fn(),
  deliverAfterResponse: vi.fn(),
}))

vi.mock("@/lib/prisma", async () => {
  const locked = (await import("./helpers/locked-shifts")).lockedShiftReads()
  const tx = {
    $queryRaw: (...args: unknown[]) => m.txQueryRaw(...args),
    shift: { findMany: locked.tx(vi.fn().mockResolvedValue([])) },
    volunteer: { createMany: m.txVolCreateMany, findFirstOrThrow: m.txVolFindFirstOrThrow, findFirst: (...args: unknown[]) => m.volFindFirst(...args), update: vi.fn() },
    event: { findFirst: vi.fn().mockResolvedValue({ title: "Festival", organizationId: "org-a", organization: { slug: "a" } }) },
    charterVersion: { upsert: vi.fn() },
    rosterConsent: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    memberInvite: { findFirst: vi.fn().mockResolvedValue({ id: "inv-1" }) },
    shiftDecline: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    signupConfirmation: { create: m.txSignupConfirmationCreate, findFirst: vi.fn().mockResolvedValue(null) },
    registration: {
      findFirst: m.txRegFindFirst,
      findMany: m.txRegFindMany,
      count: m.txCount,
      aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }),
      create: m.txCreate,
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }
  return {
    prisma: {
      event: { findFirst: m.eventFindFirst },
      eventQuestion: { findMany: vi.fn().mockResolvedValue([]) },
      shift: { findMany: locked.top(m.shiftFindMany) },
      volunteer: { findFirst: m.volFindFirst, update: vi.fn() },
      memberInvite: { findFirst: vi.fn().mockResolvedValue({ id: "inv-1" }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      signupConfirmation: { findFirst: vi.fn().mockResolvedValue(null) },
      registration: { findMany: m.topRegFindMany, findFirst: vi.fn().mockResolvedValue(null) },
      charterVersion: { upsert: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  }
})
vi.mock("@/lib/notification-helpers", () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => ({ payloads: [], send: async () => ({ ok: true }) }),
  enqueueNotifications: m.enqueueNotifications,
  deliverAfterResponse: m.deliverAfterResponse,
}))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/org-activity", () => ({ touchOrgActivity: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))

const future = new Date("2030-06-01T00:00:00Z")
const shift = (id: string, startTime: string, endTime: string) => ({
  id, label: id, roleName: id, capacity: 5, minAge: null, waitlistEnabled: false, requiresApproval: false,
  date: future, startTime, endTime, status: "open", registrations: [], overlapAllowed: false, mealOnTheGo: false, placeId: null,
})

function post() {
  return new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
    body: JSON.stringify({
      eventId: "evt-1", shiftIds: ["shift-1", "shift-2"], firstName: "Aline", lastName: "Exemple",
      email: "aline@example.org", consent: true, charterAccepted: true,
    }),
  })
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.enqueueNotifications.mockResolvedValue(["row-1"])
  m.shiftFindMany.mockResolvedValue([shift("shift-1", "10:00", "14:00"), shift("shift-2", "12:00", "13:00")])
  m.volFindFirst.mockResolvedValue(null)
  m.txVolCreateMany.mockResolvedValue({ count: 1 })
  m.txVolFindFirstOrThrow.mockResolvedValue({ id: "vol-new" })
  m.txQueryRaw.mockResolvedValue([{ id: "vol-new" }])
  m.topRegFindMany.mockResolvedValue([])
  m.txRegFindMany.mockResolvedValue([])
  m.txRegFindFirst.mockResolvedValue(null)
  m.txCount.mockResolvedValue(0)
  m.txCreate.mockImplementation(async ({ data }: { data: { shiftId: string; status: string } }) => ({
    id: `reg-${data.shiftId}`, shiftId: data.shiftId, status: data.status, waitingPosition: null,
  }))
  m.txSignupConfirmationCreate.mockResolvedValue({ id: "conf-1" })
})

describe("POST /api/public/registrations — the event setting (#1467)", () => {
  it("refuses two overlapping shifts when the event does not allow overlaps", async () => {
    m.eventFindFirst.mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "Festival", organization: { slug: "a" }, confirmationMessage: null, overlapsAllowed: false })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("se chevauchent")
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("accepts the same two overlapping shifts when the event allows overlaps", async () => {
    m.eventFindFirst.mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "Festival", organization: { slug: "a" }, confirmationMessage: null, overlapsAllowed: true })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(201)
    expect(m.txCreate).toHaveBeenCalledTimes(2)
  })

  it("refuses an ordinary overlap with a registration already held when off, and accepts it when on", async () => {
    // A valid invitation proves the address: the refusal is precise (409), not the emailed notice.
    m.volFindFirst.mockResolvedValue({ id: "vol-existing" })
    m.txQueryRaw.mockResolvedValue([{ id: "vol-existing", erasedAt: null, email: "aline@example.org" }])
    m.topRegFindMany.mockImplementation(async (args: { where?: { shiftId?: unknown } }) =>
      args?.where?.shiftId ? [] : [{ shift: { label: "Accueil", roleName: "Accueil", date: future, startTime: "12:00", endTime: "13:00" } }])
    m.shiftFindMany.mockResolvedValue([shift("shift-1", "10:00", "14:00")])
    for (const overlapsAllowed of [false, true]) {
      m.txCreate.mockClear()
      m.eventFindFirst.mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "Festival", organization: { slug: "a" }, confirmationMessage: null, overlapsAllowed })
      const { POST } = await import("@/app/api/public/registrations/route")
      const res = await POST(new Request("http://localhost/api/public/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
        body: JSON.stringify({ eventId: "evt-1", shiftIds: ["shift-1"], firstName: "Aline", lastName: "Exemple", email: "aline@example.org", consent: true, charterAccepted: true, inviteToken: "inv-tok" }),
      }))
      expect(res.status, `overlapsAllowed=${overlapsAllowed}`).toBe(overlapsAllowed ? 201 : 409)
      expect(m.txCreate).toHaveBeenCalledTimes(overlapsAllowed ? 1 : 0)
    }
  })

  it("applies the setting on the pending-request path (confirmation by email)", async () => {
    for (const overlapsAllowed of [false, true]) {
      m.txCreate.mockClear()
      m.txSignupConfirmationCreate.mockClear()
      m.eventFindFirst.mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "Festival", organization: { slug: "a" }, confirmationMessage: null, requireEmailConfirmation: true, overlapsAllowed })
      const { POST } = await import("@/app/api/public/registrations/route")
      const res = await POST(post())
      expect(res.status, `overlapsAllowed=${overlapsAllowed}`).toBe(overlapsAllowed ? 201 : 400)
      expect(m.txSignupConfirmationCreate).toHaveBeenCalledTimes(overlapsAllowed ? 1 : 0)
    }
  })
})
