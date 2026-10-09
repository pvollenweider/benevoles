import { describe, it, expect, vi, beforeEach } from "vitest"

// Withdrawing from the personal page (DELETE /api/public/registrations/[token]): every live
// registration can be withdrawn, the waitlist included. Regression: a waiting or offered entry
// answered « Inscription introuvable ou déjà annulée. » although /my showed it an « Annuler ».
// #559: a withdrawal of a held spot (active, requested) also notifies the organization.

const findFirst = vi.hoisted(() => vi.fn())
const updateMany = vi.hoisted(() => vi.fn())
const count = vi.hoisted(() => vi.fn())
const promoteNextInWaitlist = vi.hoisted(() => vi.fn())
const logEvent = vi.hoisted(() => vi.fn())
const buildWithdrawalNotifications = vi.hoisted(() => vi.fn())
const enqueueNotifications = vi.hoisted(() => vi.fn())
const deliverAfterResponse = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findFirst, updateMany, count } } }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist }))
vi.mock("@/lib/event-log", () => ({ logEvent }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))
vi.mock("@/lib/withdrawal-notifications", () => ({ buildWithdrawalNotifications }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications, deliverAfterResponse }))

const shift = { id: "s1", roleName: "Bar", label: "Bar", date: new Date("2026-07-04"), startTime: "10:00", endTime: "12:00", capacity: 2 }
const event = { id: "e1", title: "Fête", organizationId: "org-1", organization: { slug: "org", timeZone: "Europe/Zurich" } }
const volunteer = { firstName: "Chloé", lastName: "Roy", email: "chloe@example.com" }

const del = (body?: unknown) =>
  new Request("http://localhost/api/public/registrations/tok", {
    method: "DELETE",
    headers: { "x-forwarded-for": `wd-${Math.random()}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

async function withdraw(status: string, body?: unknown) {
  findFirst.mockResolvedValue({ id: "r1", eventId: "e1", shiftId: "s1", volunteerId: "v1", status, shift, event, volunteer })
  const { DELETE } = await import("@/app/api/public/registrations/[token]/route")
  return DELETE(del(body), { params: Promise.resolve({ token: "tok" }) })
}

describe("DELETE /api/public/registrations/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateMany.mockResolvedValue({ count: 1 })
    logEvent.mockResolvedValue("log-1")
    promoteNextInWaitlist.mockResolvedValue(true)
    count.mockResolvedValue(2)
    buildWithdrawalNotifications.mockResolvedValue([{ kind: "registration_cancelled", recipient: { email: "a@org.ch" }, data: {}, dedupeKey: "k1" }])
    enqueueNotifications.mockResolvedValue(["n1"])
  })

  it("looks the token up among every live status", async () => {
    await withdraw("active")
    expect(findFirst.mock.calls[0][0].where.status).toEqual({ in: ["active", "waiting", "offered", "requested"] })
  })

  it("leaves the waitlist: cancelled, logged like a cancellation, and no spot offered", async () => {
    const res = await withdraw("waiting")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "r1", status: "waiting" }, data: { status: "cancelled" } })
    expect(logEvent).toHaveBeenCalledWith({
      eventId: "e1",
      actor: { type: "volunteer", id: "v1" },
      action: "registration.cancelled",
      entityType: "Registration",
      entityId: "r1",
      changes: { status: { from: "waiting", to: "cancelled" }, shiftId: { from: "s1", to: "s1" } },
    })
    expect(promoteNextInWaitlist).not.toHaveBeenCalled()
  })

  it("refuses an offered spot: cancelled and the spot goes to the next person", async () => {
    const res = await withdraw("offered")
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "r1", status: "offered" }, data: { status: "cancelled" } })
    expect(logEvent.mock.calls[0][0].changes.status).toEqual({ from: "offered", to: "cancelled" })
    expect(promoteNextInWaitlist).toHaveBeenCalledWith("s1", "log-1")
  })

  it.each(["active", "requested"])("cancels a %s registration and offers the freed spot", async (status) => {
    const res = await withdraw(status)
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "r1", status }, data: { status: "cancelled" } })
    expect(promoteNextInWaitlist).toHaveBeenCalledWith("s1", "log-1")
  })

  it("404 when the token matches no live registration", async () => {
    findFirst.mockResolvedValue(null)
    const { DELETE } = await import("@/app/api/public/registrations/[token]/route")
    const res = await DELETE(del(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(404)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("404 without logging when the waitlist entry changed meanwhile (offered, or already left)", async () => {
    updateMany.mockResolvedValue({ count: 0 })
    const res = await withdraw("waiting")
    expect(res.status).toBe(404)
    expect(logEvent).not.toHaveBeenCalled()
    expect(promoteNextInWaitlist).not.toHaveBeenCalled()
  })

  // ── Notifying the organization (#559) ──────────────────────────────────────

  describe.each(["active", "requested"])("withdrawing a %s registration", (status) => {
    it("notifies the organization: active place, pending request", async () => {
      await withdraw(status)
      expect(buildWithdrawalNotifications).toHaveBeenCalledWith(expect.objectContaining({
        registrationId: "r1",
        event,
        shift,
        volunteerName: "Chloé Roy",
        message: null,
        waitlistTookSpot: true,
        placesMissing: 0,
      }))
      expect(enqueueNotifications).toHaveBeenCalledWith(
        [expect.objectContaining({ dedupeKey: "k1" })],
        expect.anything(),
        { organizationId: "org-1" },
      )
      expect(deliverAfterResponse).toHaveBeenCalledWith(["n1"])
    })

    it("computes the missing places from the shift's capacity and occupied count", async () => {
      count.mockResolvedValue(1) // one spot occupied out of 2: one missing
      await withdraw(status)
      expect(buildWithdrawalNotifications).toHaveBeenCalledWith(expect.objectContaining({ placesMissing: 1 }))
    })

    it("sends the trimmed optional message, dropping an empty one", async () => {
      await withdraw(status, { message: "  Paul peut me remplacer  " })
      expect(buildWithdrawalNotifications).toHaveBeenCalledWith(expect.objectContaining({ message: "Paul peut me remplacer" }))

      await withdraw(status, { message: "   " })
      expect(buildWithdrawalNotifications).toHaveBeenCalledWith(expect.objectContaining({ message: null }))
    })

    it("never writes the message to the registration update or the event log", async () => {
      await withdraw(status, { message: "Je suis malade, Paul peut me remplacer" })
      expect(JSON.stringify(updateMany.mock.calls[0][0])).not.toContain("Paul")
      expect(JSON.stringify(logEvent.mock.calls[0][0])).not.toContain("Paul")
    })

    it("rejects a message over 300 characters with 400, before anything is withdrawn", async () => {
      const res = await withdraw(status, { message: "a".repeat(301) })
      expect(res.status).toBe(400)
      expect(updateMany).not.toHaveBeenCalled()
      expect(buildWithdrawalNotifications).not.toHaveBeenCalled()
    })

    it("accepts exactly 300 characters", async () => {
      const res = await withdraw(status, { message: "a".repeat(300) })
      expect(res.status).toBe(200)
    })

    it("a notification failure does not fail the withdrawal", async () => {
      buildWithdrawalNotifications.mockRejectedValue(new Error("db down"))
      const res = await withdraw(status)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: true })
    })
  })

  it.each(["waiting", "offered"])("does not notify the organization when leaving the waitlist or declining an offer (%s)", async (status) => {
    await withdraw(status)
    expect(buildWithdrawalNotifications).not.toHaveBeenCalled()
    expect(enqueueNotifications.mock.calls.flatMap(([payloads]) => payloads).map((p: { kind: string }) => p.kind)).toEqual(["registration_withdrawn"])
  })

  // ── Telling the volunteer (#809) ───────────────────────────────────────────

  const volunteerEmail = () => enqueueNotifications.mock.calls.flatMap(([payloads]) => payloads).find((p: { kind: string }) => p.kind === "registration_withdrawn")

  it.each([
    ["active", "Ton inscription a été annulée"],
    ["requested", "Ta demande d'inscription a été retirée"],
    ["waiting", "Tu as quitté la liste d'attente"],
    ["offered", "Tu as refusé la place qui t'était proposée"],
  ])("tells the volunteer what was done from their link (%s)", async (status, what) => {
    await withdraw(status)
    expect(volunteerEmail()).toMatchObject({
      recipient: { email: "chloe@example.com", name: "Chloé Roy" },
      organizationId: "org-1",
      volunteerId: "v1",
      dedupeKey: "registration_withdrawn:r1",
      data: { what, eventTitle: "Fête", shift: { roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00" } },
    })
    expect(volunteerEmail().data.when).toMatch(/^le \d{1,2} \S+ à \d{2}:\d{2}$/)
  })

  it("sends no confirmation to a volunteer without an email", async () => {
    findFirst.mockResolvedValue({ id: "r1", eventId: "e1", shiftId: "s1", volunteerId: "v1", status: "waiting", shift, event, volunteer: { ...volunteer, email: null } })
    const { DELETE } = await import("@/app/api/public/registrations/[token]/route")
    expect((await DELETE(del(), { params: Promise.resolve({ token: "tok" }) })).status).toBe(200)
    expect(volunteerEmail()).toBeUndefined()
  })

  it("a failing confirmation does not fail the withdrawal", async () => {
    enqueueNotifications.mockRejectedValue(new Error("db down"))
    const res = await withdraw("waiting")
    expect(res.status).toBe(200)
  })

  it("a double DELETE (double click) sends one email: the second finds the registration already settled", async () => {
    findFirst.mockResolvedValue({ id: "r1", eventId: "e1", shiftId: "s1", volunteerId: "v1", status: "active", shift, event, volunteer })
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    const { DELETE } = await import("@/app/api/public/registrations/[token]/route")
    const first = await DELETE(del(), { params: Promise.resolve({ token: "tok" }) })
    const second = await DELETE(del(), { params: Promise.resolve({ token: "tok" }) })
    expect(first.status).toBe(200)
    expect(second.status).toBe(404)
    expect(buildWithdrawalNotifications).toHaveBeenCalledTimes(1)
  })
})
