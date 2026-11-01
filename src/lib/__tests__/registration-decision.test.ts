import { describe, it, expect, vi, beforeEach } from "vitest"
// Workload protection (#1171) runs on Postgres (src/__integration__/workload-policy.int.test.ts): off here.
vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkScheduleEdit: vi.fn(async () => []),
}))

// Sign-up approval (#484): accept or refuse a request, once, with its email and log.
const m = vi.hoisted(() => ({
  logEvent: vi.fn().mockResolvedValue("log-1"),
  enqueue: vi.fn().mockResolvedValue(["out-1"]),
  deliver: vi.fn(),
  promote: vi.fn().mockResolvedValue(true),
  leaders: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../event-log", () => ({ logEvent: m.logEvent }))
vi.mock("../notifications/outbox", () => ({
  collectNotifications: () => {
    const payloads: unknown[] = []
    return { payloads, send: async (p: unknown) => { payloads.push(p); return { ok: true } } }
  },
  enqueueNotifications: m.enqueue,
  deliverAfterResponse: m.deliver,
}))
vi.mock("../report-error", () => ({ reportError: () => () => {} }))
vi.mock("../sector-leaders", () => ({ notifySectorLeadersOfSignup: m.leaders }))
vi.mock("../waitlist", () => ({ promoteNextInWaitlist: m.promote }))
vi.mock("../token-vault", () => ({ registrationToken: { reveal: () => "tok-1" } }))

import { decideRequest, decisionSchema, ALREADY_SETTLED } from "../registration-decision"
import { answerRow, availabilityShift, availabilityTx } from "./fixtures/availability-tx"

const actor = { type: "admin" as const, id: "admin-1", name: "Admin" }
const request = (status = "requested") => ({
  id: "reg-1", status, eventId: "evt-1", shiftId: "sh-1",
  volunteer: { firstName: "Marc", lastName: "D", email: "marc@x.ch" },
  shift: { label: "Chauffeur navette", roleName: "Chauffeur", date: new Date("2026-07-04T00:00:00Z"), startTime: "08:00", endTime: "12:00" },
  event: { title: "Fête", slug: "fete", organizationId: "org-a", confirmationMessage: null, organization: { slug: "asso" } },
})

function db(reg: ReturnType<typeof request> | null, updated = 1, availability: ReturnType<typeof availabilityTx> = availabilityTx({ inUse: false }), state: { status?: string; capacity?: number; occupied?: number } = {}) {
  const updateMany = vi.fn().mockResolvedValue({ count: updated })
  const queryRaw = vi.fn().mockResolvedValue([])
  // The full or closed check (AUTHZ-15): the shift's status and places, and the spots held by others.
  const count = vi.fn().mockResolvedValue(state.occupied ?? 0)
  const shift = {
    ...availability.shiftRows,
    findMany: vi.fn(async (args: { where: { id: { in: string[] } }; select?: { capacity?: boolean } }) => args?.select?.capacity
      ? [{ id: "sh-1", roleName: "Chauffeur", label: "Chauffeur navette", date: new Date("2026-07-04T00:00:00Z"), startTime: "08:00", endTime: "12:00", status: state.status ?? "open", capacity: state.capacity ?? 5 }]
      : availability.shiftRows.findMany(args)),
  }
  const tx = { registration: { updateMany, count }, event: availability.event, shift, availabilityRequest: availability.availabilityRequest, eventLog: availability.eventLog, $queryRaw: queryRaw }
  return {
    updateMany,
    queryRaw,
    count,
    availability,
    db: {
      registration: { findFirst: vi.fn().mockResolvedValue(reg) },
      $transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
    },
  }
}

describe("decideRequest", () => {
  beforeEach(() => vi.clearAllMocks())

  it("accepts: the request becomes a place, confirmation email with the personal link, logged, no waitlist offer", async () => {
    const d = db(request())
    const out = await decideRequest(d.db as never, actor, "reg-1", { decision: "accept" })
    expect(out).toEqual({ ok: true, status: "active" })
    expect(d.updateMany).toHaveBeenCalledWith({ where: { id: "reg-1", status: "requested" }, data: { status: "active" } })
    const [payloads] = m.enqueue.mock.calls[0]
    expect(payloads[0]).toMatchObject({ kind: "registration_confirmation", recipient: { email: "marc@x.ch" }, data: { editToken: "tok-1" } })
    expect(m.leaders).toHaveBeenCalled()
    expect(m.logEvent.mock.calls[0][0]).toMatchObject({ action: "registration.accepted", changes: { status: { from: "requested", to: "active" } } })
    expect(m.promote).not.toHaveBeenCalled()
    expect(m.deliver).toHaveBeenCalledWith(["out-1"])
  })

  it("refuses: polite email with the organizer's note, the note's text never logged, the freed spot offered", async () => {
    const d = db(request())
    const out = await decideRequest(d.db as never, actor, "reg-1", { decision: "refuse", note: "  Permis requis.  " })
    expect(out).toEqual({ ok: true, status: "refused" })
    const [payloads] = m.enqueue.mock.calls[0]
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toMatchObject({ kind: "registration_refused", data: { note: "Permis requis.", shiftLabel: "Chauffeur navette" } })
    expect(JSON.stringify(m.logEvent.mock.calls[0][0])).not.toContain("Permis")
    expect(m.logEvent.mock.calls[0][0].action).toBe("registration.refused")
    expect(m.promote).toHaveBeenCalledWith("sh-1", "log-1")
  })

  it("refuses without a note: no reason in the email", async () => {
    const d = db(request())
    await decideRequest(d.db as never, actor, "reg-1", { decision: "refuse", note: "   " })
    expect(m.enqueue.mock.calls[0][0][0].data.note).toBeNull()
  })

  it("a request already settled, or withdrawn at the same moment, is decided once only", async () => {
    const settled = db(request("active"))
    expect(await decideRequest(settled.db as never, actor, "reg-1", { decision: "refuse" })).toEqual({ ok: false, httpStatus: 409, error: ALREADY_SETTLED })
    expect(settled.updateMany).not.toHaveBeenCalled()

    const raced = db(request(), 0)
    expect(await decideRequest(raced.db as never, actor, "reg-1", { decision: "accept" })).toMatchObject({ ok: false, httpStatus: 409 })
    expect(m.enqueue).not.toHaveBeenCalled()
    expect(m.logEvent).not.toHaveBeenCalled()
    expect(m.promote).not.toHaveBeenCalled()
  })

  it("another organization's registration is not found", async () => {
    expect(await decideRequest(db(null).db as never, actor, "reg-b", { decision: "accept" })).toMatchObject({ ok: false, httpStatus: 404 })
  })

  it("only accept or refuse, with a bounded note", () => {
    expect(decisionSchema.safeParse({ decision: "maybe" }).success).toBe(false)
    expect(decisionSchema.safeParse({ decision: "refuse", note: "x".repeat(1001) }).success).toBe(false)
    expect(decisionSchema.safeParse({ decision: "accept" }).success).toBe(true)
  })
})

// Dated availability (#1146, lot B): accepting a request on hours the person said they are not
// available for needs the organiser's acknowledgement, judged under the locks; nothing changes
// without it, and the evidence commits with the acceptance.
describe("decideRequest on an event collecting availability", () => {
  beforeEach(() => vi.clearAllMocks())
  // The request is on sh-1, the 11th 14:00–20:00: Marc said he is free 09:00–12:00 only.
  const inUse = () => availabilityTx({ answers: { "vol-1": answerRow("vol-1") }, shifts: [availabilityShift("sh-1")] })
  const pending = () => ({ ...request(), volunteerId: "vol-1" })
  const key = "a1|evt-1|vol-1|sh-1|1910001600000|1910023200000|req-vol-1|2|Europe/Zurich"

  it("refuses without the acknowledgement: 409 « availability », nothing accepted, no email, no log", async () => {
    const d = db(pending(), 1, inUse())
    const out = await decideRequest(d.db as never, actor, "reg-1", { decision: "accept" })
    expect(out).toMatchObject({ ok: false, httpStatus: 409, code: "availability", outside: [{ volunteerId: "vol-1", shiftId: "sh-1", state: "outside", key }] })
    expect((out as { error: string }).error).toBe("Marc D a indiqué ne pas être disponible pendant une partie de ce créneau : cochez la confirmation pour accepter sa demande quand même. La demande n'a pas été acceptée.")
    expect(d.updateMany).not.toHaveBeenCalled()
    expect(m.enqueue).not.toHaveBeenCalled()
    expect(m.logEvent).not.toHaveBeenCalled()
    // The shift is locked before the answer is read, even with the workload protection off.
    expect(String(d.queryRaw.mock.calls[0][0].join("?"))).toContain('FROM "Shift"')
  })

  it("accepts with the acknowledgement and writes its evidence in the same transaction", async () => {
    const d = db(pending(), 1, inUse())
    expect(await decideRequest(d.db as never, actor, "reg-1", { decision: "accept", availabilityAck: [key] })).toEqual({ ok: true, status: "active" })
    expect(d.availability.eventLog.create).toHaveBeenCalledTimes(1)
    expect(d.availability.eventLog.create.mock.calls[0]).toMatchObject([{ data: {
      action: "registration.availability_acknowledged", entityId: "reg-1", actorType: "admin", actorId: "admin-1",
      changes: { shiftId: { from: "sh-1", to: "sh-1" }, availabilityAck: { to: { v: 1, via: "accept", requestId: "req-vol-1", revision: 2, outsideMinutes: 360 } } },
    } }])
  })

  it("an acknowledgement given on an older answer no longer applies", async () => {
    const d = db(pending(), 1, availabilityTx({ answers: { "vol-1": answerRow("vol-1", 3) }, shifts: [availabilityShift("sh-1")] }))
    expect(await decideRequest(d.db as never, actor, "reg-1", { decision: "accept", availabilityAck: [key] })).toMatchObject({ ok: false, code: "availability" })
    expect(d.updateMany).not.toHaveBeenCalled()
  })

  it("a request settled meanwhile writes no acknowledgement", async () => {
    const d = db(pending(), 0, inUse())
    expect(await decideRequest(d.db as never, actor, "reg-1", { decision: "accept", availabilityAck: [key] })).toMatchObject({ ok: false, httpStatus: 409, error: ALREADY_SETTLED })
    expect(d.availability.eventLog.create).not.toHaveBeenCalled()
  })

  it("asks nothing for a person free then, or a refusal", async () => {
    const free = availabilityTx({ answers: { "vol-1": { ...answerRow("vol-1"), days: [{ date: new Date("2030-07-11T00:00:00Z"), ranges: [{ startTime: "08:00", endTime: "22:00", startsAt: new Date("2030-07-11T06:00:00Z"), endsAt: new Date("2030-07-11T20:00:00Z") }] }] } }, shifts: [availabilityShift("sh-1")] })
    expect(await decideRequest(db(pending(), 1, free).db as never, actor, "reg-1", { decision: "accept" })).toEqual({ ok: true, status: "active" })
    const refusing = db(pending(), 1, inUse())
    expect(await decideRequest(refusing.db as never, actor, "reg-1", { decision: "refuse" })).toEqual({ ok: true, status: "refused" })
    expect(refusing.availability.availabilityRequest.findFirst).not.toHaveBeenCalled()
  })

  it("locks the shift only (AUTHZ-15) and reads no answer on an event that never used the option", async () => {
    const d = db(pending())
    expect(await decideRequest(d.db as never, actor, "reg-1", { decision: "accept" })).toEqual({ ok: true, status: "active" })
    expect(d.queryRaw).toHaveBeenCalledTimes(1)
    expect(d.availability.availabilityRequest.findFirst).not.toHaveBeenCalled()
  })

  it("bounds the acknowledgements sent", () => {
    expect(decisionSchema.safeParse({ decision: "accept", availabilityAck: ["a", "b"] }).success).toBe(false)
    expect(decisionSchema.safeParse({ decision: "accept", availabilityAck: ["x".repeat(401)] }).success).toBe(false)
  })
})

// A full or closed shift (AUTHZ-15): accepting is the organiser's call, confirmed; a cancelled shift
// is refused until it is reopened. The request's own spot never counts against it.
describe("decideRequest on a full, closed or cancelled shift", () => {
  beforeEach(() => vi.clearAllMocks())

  it("accepts without asking when the request holds its spot", async () => {
    const d = db(request(), 1, undefined, { capacity: 5, occupied: 4 })
    expect(await decideRequest(d.db as never, actor, "reg-1", { decision: "accept" })).toEqual({ ok: true, status: "active" })
    expect(d.count).toHaveBeenCalledWith({ where: { shiftId: "sh-1", status: { in: ["active", "offered", "requested"] }, id: { notIn: ["reg-1"] } } })
  })

  it("asks first when the places held by others fill the shift: nothing accepted, no email, no log", async () => {
    const d = db(request(), 1, undefined, { capacity: 5, occupied: 5 })
    const out = await decideRequest(d.db as never, actor, "reg-1", { decision: "accept" })
    expect(out).toMatchObject({ ok: false, httpStatus: 409, code: "shift_override", shifts: [{ shiftId: "sh-1", full: true, occupied: 5, capacity: 5, key: "o1|accept|reg-1|sh-1|open|5|5" }] })
    expect(d.updateMany).not.toHaveBeenCalled()
    expect(m.enqueue).not.toHaveBeenCalled()
    expect(m.logEvent).not.toHaveBeenCalled()
  })

  it("asks first on a closed shift, and accepts with the confirmation, logged", async () => {
    const d = db(request(), 1, undefined, { status: "closed", capacity: 5, occupied: 2 })
    expect(await decideRequest(d.db as never, actor, "reg-1", { decision: "accept" })).toMatchObject({ ok: false, code: "shift_override", shifts: [{ closed: true, full: false }] })
    const again = db(request(), 1, undefined, { status: "closed", capacity: 5, occupied: 2 })
    expect(await decideRequest(again.db as never, actor, "reg-1", { decision: "accept", shiftOverride: ["o1|accept|reg-1|sh-1|closed|2|5"] })).toEqual({ ok: true, status: "active" })
    expect(m.logEvent.mock.calls[0][0].changes.shiftOverride).toEqual({ from: null, to: "inscriptions fermées, 3 sur 5" })
  })

  it("refuses on a cancelled shift, whatever is sent", async () => {
    const d = db(request(), 1, undefined, { status: "cancelled" })
    expect(await decideRequest(d.db as never, actor, "reg-1", { decision: "accept", shiftOverride: ["o1|accept|reg-1|sh-1|cancelled|0|5"] })).toMatchObject({ ok: false, httpStatus: 409, code: "shift_cancelled" })
    expect(d.updateMany).not.toHaveBeenCalled()
  })

  it("a refusal never asks", async () => {
    const d = db(request(), 1, undefined, { status: "closed", occupied: 9 })
    expect(await decideRequest(d.db as never, actor, "reg-1", { decision: "refuse" })).toEqual({ ok: true, status: "refused" })
  })
})
