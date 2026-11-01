import { describe, it, expect, vi, beforeEach } from "vitest"
// Workload protection (#1171) runs on Postgres (src/__integration__/workload-policy.int.test.ts): off here.
vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkScheduleEdit: vi.fn(async () => []),
}))

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
vi.mock("../token-vault", () => ({ registrationToken: { reveal: () => "tok-1", data: (t: string) => ({ editTokenHash: `h:${t}` }) } }))
vi.mock("../utils", () => { let n = 0; return { generateToken: () => `new-${++n}` } })

import { ALREADY_LIVE, restoreRegistration } from "../registration-restore-action"
import { answerRow, availabilityShift, availabilityTx } from "./fixtures/availability-tx"

const reg = {
  id: "r1", eventId: "e1", shiftId: "s1", volunteerId: "v1", status: "cancelled",
  volunteer: { firstName: "Chloé", lastName: "Roy", email: "chloe@example.com" },
  shift: { id: "s1", roleName: "Bar", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00", capacity: 2, status: "open" },
  event: { id: "e1", title: "Fête", organizationId: "org-1", organization: { slug: "org", timeZone: "Europe/Zurich" } },
}

function makeDb(over: { reg?: unknown; from?: string; status?: string; occupied?: number; shiftStatus?: string; updateError?: unknown; availability?: ReturnType<typeof availabilityTx> } = {}) {
  const availability = over.availability ?? availabilityTx({ inUse: false })
  const tx = {
    event: availability.event,
    availabilityRequest: availability.availabilityRequest,
    eventLog: availability.eventLog,
    $queryRaw: vi.fn().mockResolvedValue([]),
    registration: {
      findFirst: vi.fn().mockResolvedValue({ status: over.status ?? "cancelled" }),
      findMany: vi.fn().mockResolvedValue([{ id: "r1" }, { id: "r2" }]),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(over.occupied ?? 1),
      updateMany: over.updateError ? vi.fn().mockRejectedValue(over.updateError) : vi.fn().mockResolvedValue({ count: 1 }),
    },
    shift: {
      findFirst: vi.fn().mockResolvedValue({ status: over.shiftStatus ?? "open", capacity: 2 }),
      // The full or closed check (AUTHZ-15) reads the status and places; the availability read the hours.
      findMany: vi.fn(async (args: { where: { id: { in: string[] } }; select?: { capacity?: boolean } }) => args?.select?.capacity
        ? [{ id: "s1", roleName: "Bar", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00", status: over.shiftStatus ?? "open", capacity: 2 }]
        : availability.shiftRows.findMany(args)),
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

  it("asks for the confirmation once the spot was taken meanwhile (AUTHZ-15): nothing changed, no email, no log", async () => {
    const { db, tx } = makeDb({ occupied: 2 })
    const out = await restoreRegistration(db, actor, "r1", before)
    expect(out).toMatchObject({ ok: false, httpStatus: 409, code: "shift_override", shifts: [{ shiftId: "s1", full: true, closed: false, occupied: 2, capacity: 2, key: "o1|restore|r1|s1|open|2|2" }] })
    expect(tx.registration.updateMany).not.toHaveBeenCalled()
    expect(enqueueNotifications).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("restores on a full shift with the confirmation, and logs the overbooking (AUTHZ-15)", async () => {
    const { db, tx } = makeDb({ occupied: 2 })
    expect(await restoreRegistration(db, actor, "r1", before, { shiftOverride: ["o1|restore|r1|s1|open|2|2"] })).toEqual({ ok: true, status: "active" })
    expect(tx.registration.updateMany).toHaveBeenCalled()
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "registration.restored", changes: expect.objectContaining({ shiftOverride: { from: null, to: "complet, 3 sur 2" } }) }))
  })

  it("a confirmation given for another count no longer applies (AUTHZ-15)", async () => {
    const { db } = makeDb({ occupied: 3 })
    expect(await restoreRegistration(db, actor, "r1", before, { shiftOverride: ["o1|restore|r1|s1|open|2|2"] })).toMatchObject({ ok: false, code: "shift_override" })
  })

  it("asks for the confirmation on a closed shift, even with places left (AUTHZ-15)", async () => {
    const { db } = makeDb({ shiftStatus: "closed" })
    expect(await restoreRegistration(db, actor, "r1", before)).toMatchObject({ ok: false, code: "shift_override", shifts: [{ closed: true, full: false }] })
  })

  it("refuses on a cancelled shift: reopen it first (AUTHZ-15)", async () => {
    const { db, tx } = makeDb({ shiftStatus: "cancelled" })
    expect(await restoreRegistration(db, actor, "r1", before)).toEqual({ ok: false, httpStatus: 409, error: "Ce créneau est annulé\u00a0: rien n'a été fait. Rouvrez d'abord le créneau." })
    expect(tx.registration.updateMany).not.toHaveBeenCalled()
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

  it("keeps the links by default", async () => {
    const { db, tx } = makeDb()
    await restoreRegistration(db, actor, "r1", before)
    expect(tx.registration.update).not.toHaveBeenCalled()
    expect(enqueueNotifications.mock.calls[0][0][0].data).toMatchObject({ editToken: "tok-1", newLink: false })
  })

  it("with a new link: replaces every live link of the person on the event, emails the new one, logs it", async () => {
    const { db, tx } = makeDb()
    await restoreRegistration(db, actor, "r1", before, { newLink: true })
    expect(tx.registration.findMany).toHaveBeenCalledWith({ where: { volunteerId: "v1", eventId: "e1", status: { in: ["active", "waiting", "offered", "requested"] } }, select: { id: true } })
    expect(tx.registration.update).toHaveBeenCalledTimes(2)
    const tokens = tx.registration.update.mock.calls.map(([a]) => a.data.editTokenHash)
    expect(new Set(tokens).size).toBe(2)
    const data = enqueueNotifications.mock.calls[0][0][0].data
    expect(data.newLink).toBe(true)
    expect(tokens).toContain(`h:${data.editToken}`)
    expect(data.editToken).not.toBe("tok-1")
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ changes: expect.objectContaining({ personalLink: { from: "(ancien)", to: "(renouvelé)" } }) }))
  })
})

// Dated availability (#1146, lot B): « Rétablir » on hours the person said they are not available
// for needs the organiser's acknowledgement, a place as well as a request (it holds a spot again).
describe("restoreRegistration on an event collecting availability", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    enqueueNotifications.mockResolvedValue(["n1"])
    logEvent.mockResolvedValue("log-1")
  })
  // Chloé's place on s1, the 11th 14:00–20:00: she said she is free 09:00–12:00 only.
  const later = { ...reg, shift: { ...reg.shift, date: new Date("2030-07-11T00:00:00Z"), startTime: "14:00", endTime: "20:00" } }
  const inUse = () => availabilityTx({ answers: { v1: answerRow("v1") }, shifts: [availabilityShift("s1")] })
  const key = "a1|e1|v1|s1|1910001600000|1910023200000|req-v1|2|Europe/Zurich"
  const early = new Date("2030-07-01T10:00:00Z")

  it("refuses without the acknowledgement: nothing restored, no email, no log", async () => {
    const { db, tx } = makeDb({ reg: later, availability: inUse() })
    const out = await restoreRegistration(db, actor, "r1", early)
    expect(out).toMatchObject({ ok: false, httpStatus: 409, code: "availability", outside: [{ volunteerId: "v1", shiftId: "s1", key }] })
    expect((out as { error: string }).error).toContain("cochez la confirmation pour rétablir son inscription quand même. Rien n'a été rétabli.")
    expect(tx.registration.updateMany).not.toHaveBeenCalled()
    expect(enqueueNotifications).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("restores with the acknowledgement, its evidence in the same transaction", async () => {
    const availability = inUse()
    const { db } = makeDb({ reg: later, availability })
    expect(await restoreRegistration(db, actor, "r1", early, { availabilityAck: [key] })).toEqual({ ok: true, status: "active" })
    expect(availability.eventLog.create.mock.calls[0]).toMatchObject([{ data: { action: "registration.availability_acknowledged", entityId: "r1", changes: { availabilityAck: { to: { via: "restore", outsideMinutes: 360 } } } } }])
  })

  it("asks it for a request too", async () => {
    const { db } = makeDb({ reg: later, from: "requested", availability: inUse() })
    expect(await restoreRegistration(db, actor, "r1", early)).toMatchObject({ ok: false, code: "availability" })
  })

  it("a full shift asks for its own confirmation first, before the availability one (AUTHZ-15)", async () => {
    const availability = inUse()
    const { db } = makeDb({ reg: later, occupied: 2, availability })
    expect(await restoreRegistration(db, actor, "r1", early)).toMatchObject({ ok: false, httpStatus: 409, code: "shift_override" })
    expect(availability.availabilityRequest.findFirst).not.toHaveBeenCalled()
  })

  it("reads no answer on an event that never used the option", async () => {
    const availability = availabilityTx({ inUse: false })
    const { db } = makeDb({ reg: later, availability })
    expect(await restoreRegistration(db, actor, "r1", early)).toEqual({ ok: true, status: "active" })
    expect(availability.availabilityRequest.findFirst).not.toHaveBeenCalled()
    expect(availability.eventLog.create).not.toHaveBeenCalled()
  })
})
