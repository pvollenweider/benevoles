import { describe, it, expect, vi, beforeEach } from "vitest"

const logEvent = vi.hoisted(() => vi.fn())
const enqueueNotifications = vi.hoisted(() => vi.fn())
const deliverAfterResponse = vi.hoisted(() => vi.fn())
vi.mock("../event-log", () => ({ logEvent }))
vi.mock("../notifications/outbox", () => ({
  collectNotifications: () => {
    const payloads: unknown[] = []
    return { payloads, send: async (p: unknown) => { payloads.push(p) } }
  },
  enqueueNotifications,
  deliverAfterResponse,
}))
vi.mock("../token-vault", () => ({ registrationToken: { reveal: () => "tok-1" } }))

import { ALREADY_LIVE, restoreRegistration } from "../registration-restore-action"

const reg = {
  id: "r1", eventId: "e1", shiftId: "s1", volunteerId: "v1", status: "cancelled",
  volunteer: { firstName: "Chloé", lastName: "Roy", email: "chloe@example.com" },
  shift: { id: "s1", roleName: "Bar", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00", capacity: 2, status: "open" },
  event: { id: "e1", title: "Fête", organizationId: "org-1", organization: { slug: "org", timeZone: "Europe/Zurich" } },
}

function makeDb(over: { reg?: unknown; from?: string; status?: string; occupied?: number; shiftStatus?: string; updateError?: unknown } = {}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    registration: {
      findFirst: vi.fn().mockResolvedValue({ status: over.status ?? "cancelled" }),
      count: vi.fn().mockResolvedValue(over.occupied ?? 1),
      updateMany: over.updateError ? vi.fn().mockRejectedValue(over.updateError) : vi.fn().mockResolvedValue({ count: 1 }),
    },
    shift: {
      findFirst: vi.fn().mockResolvedValue({ status: over.shiftStatus ?? "open", capacity: 2 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }
  const db = {
    registration: { findFirst: vi.fn().mockResolvedValue(over.reg === undefined ? reg : over.reg) },
    eventLog: { findFirst: vi.fn().mockResolvedValue({ changes: { status: { from: over.from ?? "active", to: "cancelled" } } }) },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  return { db: db as never, tx }
}

const actor = { type: "admin" as const, id: "a1" }
const before = new Date("2026-07-01T10:00:00Z")

describe("restoreRegistration (#809)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    enqueueNotifications.mockResolvedValue(["n1"])
    logEvent.mockResolvedValue("log-1")
  })

  it("puts a cancelled place back, fills the shift on the last spot, emails and logs it", async () => {
    const { db, tx } = makeDb()
    expect(await restoreRegistration(db, actor, "r1", before)).toEqual({ ok: true, status: "active" })
    expect(tx.registration.updateMany).toHaveBeenCalledWith({ where: { id: "r1", status: "cancelled" }, data: { status: "active" } })
    expect(tx.shift.updateMany).toHaveBeenCalledWith({ where: { id: "s1", status: "open" }, data: { status: "full" } })
    const [payloads] = enqueueNotifications.mock.calls[0]
    expect(payloads).toEqual([expect.objectContaining({
      kind: "registration_restored",
      recipient: { email: "chloe@example.com", name: "Chloé Roy" },
      organizationId: "org-1",
      data: expect.objectContaining({ status: "active", editToken: "tok-1", shift: expect.objectContaining({ date: "2026-07-04" }) }),
    })])
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "registration.restored",
      changes: { status: { from: "cancelled", to: "active" }, shiftId: { from: "s1", to: "s1" } },
    }))
    expect(deliverAfterResponse).toHaveBeenCalledWith(["n1"])
  })

  it("restores a request as a request, without filling the shift", async () => {
    const { db, tx } = makeDb({ from: "requested" })
    expect(await restoreRegistration(db, actor, "r1", before)).toEqual({ ok: true, status: "requested" })
    expect(tx.shift.updateMany).not.toHaveBeenCalled()
  })

  it("leaves the shift open while spots remain", async () => {
    const { db, tx } = makeDb({ occupied: 0 })
    await restoreRegistration(db, actor, "r1", before)
    expect(tx.shift.updateMany).not.toHaveBeenCalled()
  })

  it("409 when the spot was taken meanwhile: nothing changed, no email, no log", async () => {
    const { db, tx } = makeDb({ occupied: 2 })
    expect(await restoreRegistration(db, actor, "r1", before)).toEqual({ ok: false, httpStatus: 409, error: "Ce créneau est complet : la place a été reprise." })
    expect(tx.registration.updateMany).not.toHaveBeenCalled()
    expect(enqueueNotifications).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("409 once the shift has started, in the organisation's time zone", async () => {
    // 10:00 in Zurich in July is 08:00 UTC.
    const { db } = makeDb()
    expect(await restoreRegistration(db, actor, "r1", new Date("2026-07-04T07:59:00Z"))).toMatchObject({ ok: true })
    const second = makeDb()
    expect(await restoreRegistration(second.db, actor, "r1", new Date("2026-07-04T08:00:00Z"))).toMatchObject({ ok: false, error: "Ce créneau a déjà commencé." })
  })

  it("409 for a waitlist entry: it held no place", async () => {
    const { db } = makeDb({ from: "waiting" })
    expect(await restoreRegistration(db, actor, "r1", before)).toMatchObject({ ok: false, httpStatus: 409 })
  })

  it("409 when the person signed up again on the shift since", async () => {
    const { db } = makeDb({ updateError: Object.assign(new Error("unique"), { code: "P2002" }) })
    expect(await restoreRegistration(db, actor, "r1", before)).toEqual({ ok: false, httpStatus: 409, error: ALREADY_LIVE })
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("404 for a registration the organisation can't see", async () => {
    const { db } = makeDb({ reg: null })
    expect(await restoreRegistration(db, actor, "r1", before)).toMatchObject({ ok: false, httpStatus: 404 })
  })

  it("restores without email for a volunteer without an address", async () => {
    const { db } = makeDb({ reg: { ...reg, volunteer: { ...reg.volunteer, email: null } } })
    expect(await restoreRegistration(db, actor, "r1", before)).toMatchObject({ ok: true })
    expect(enqueueNotifications.mock.calls[0][0]).toEqual([])
  })
})
