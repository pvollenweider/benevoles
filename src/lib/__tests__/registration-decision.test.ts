import { describe, it, expect, vi, beforeEach } from "vitest"

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

const actor = { type: "admin" as const, id: "admin-1", name: "Admin" }
const request = (status = "requested") => ({
  id: "reg-1", status, eventId: "evt-1", shiftId: "sh-1",
  volunteer: { firstName: "Marc", lastName: "D", email: "marc@x.ch" },
  shift: { label: "Chauffeur navette", roleName: "Chauffeur", date: new Date("2026-07-04T00:00:00Z"), startTime: "08:00", endTime: "12:00" },
  event: { title: "Fête", slug: "fete", organizationId: "org-a", confirmationMessage: null, organization: { slug: "asso" } },
})

function db(reg: ReturnType<typeof request> | null, updated = 1) {
  const updateMany = vi.fn().mockResolvedValue({ count: updated })
  return {
    updateMany,
    db: {
      registration: { findFirst: vi.fn().mockResolvedValue(reg) },
      $transaction: async (fn: (tx: unknown) => unknown) => fn({ registration: { updateMany } }),
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
