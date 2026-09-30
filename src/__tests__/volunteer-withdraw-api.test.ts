import { describe, it, expect, vi, beforeEach } from "vitest"

// Withdrawing from the personal page (DELETE /api/public/registrations/[token]): every live
// registration can be withdrawn, the waitlist included. Regression: a waiting or offered entry
// answered « Inscription introuvable ou déjà annulée. » although /my showed it an « Annuler ».

const findFirst = vi.hoisted(() => vi.fn())
const updateMany = vi.hoisted(() => vi.fn())
const promoteNextInWaitlist = vi.hoisted(() => vi.fn())
const logEvent = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findFirst, updateMany } } }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist }))
vi.mock("@/lib/event-log", () => ({ logEvent }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))

const del = () =>
  new Request("http://localhost/api/public/registrations/tok", { method: "DELETE", headers: { "x-forwarded-for": `wd-${Math.random()}` } })

async function withdraw(status: string) {
  findFirst.mockResolvedValue({ id: "r1", eventId: "e1", shiftId: "s1", volunteerId: "v1", status })
  const { DELETE } = await import("@/app/api/public/registrations/[token]/route")
  return DELETE(del(), { params: Promise.resolve({ token: "tok" }) })
}

describe("DELETE /api/public/registrations/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateMany.mockResolvedValue({ count: 1 })
    logEvent.mockResolvedValue("log-1")
    promoteNextInWaitlist.mockResolvedValue(true)
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
})
