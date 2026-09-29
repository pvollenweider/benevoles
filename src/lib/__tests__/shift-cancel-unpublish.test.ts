import { describe, it, expect, vi, beforeEach } from "vitest"

const tx = vi.hoisted(() => ({
  shift: { update: vi.fn(), count: vi.fn() },
  registration: { update: vi.fn() },
  event: { updateMany: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: (fn: (t: unknown) => unknown) => fn(tx) } }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-cancel"))
vi.mock("@/lib/event-log", () => ({ logEvent }))
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => ({ payloads: [], send: vi.fn() }),
  enqueueNotifications: vi.fn().mockResolvedValue([]),
  deliverAfterResponse: vi.fn(),
}))

const shift = {
  id: "s1", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), status: "open",
  event: { id: "evt-a", title: "Fête", slug: "fete", organization: { slug: "org" } },
  registrations: [],
}

// Losing the last live shift puts a published event back to draft (audit follow-up).
describe("cancelShift — last live shift of a published event", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tx.shift.update.mockResolvedValue({})
    tx.event.updateMany.mockResolvedValue({ count: 1 })
  })

  it("unpublishes in the same transaction and logs it, caused by the cancellation", async () => {
    tx.shift.count.mockResolvedValue(0)
    const { cancelShift } = await import("@/lib/shift-cancel")
    const result = await cancelShift(shift, { type: "admin", id: "a" } as never)
    expect(result.unpublished).toBe(true)
    expect(tx.event.updateMany).toHaveBeenCalledWith({ where: { id: "evt-a", publicStatus: "published" }, data: { publicStatus: "draft" } })
    const unpub = logEvent.mock.calls.find((c) => c[0].action === "event.unpublished")![0]
    expect(unpub).toMatchObject({ entityType: "Event", entityId: "evt-a", changes: { publicStatus: { from: "published", to: "draft" } }, causedByLogId: "log-cancel" })
  })

  it("leaves the event alone while other live shifts remain, or when it wasn't published", async () => {
    tx.shift.count.mockResolvedValue(2)
    const { cancelShift } = await import("@/lib/shift-cancel")
    expect((await cancelShift(shift, { type: "admin", id: "a" } as never)).unpublished).toBe(false)
    expect(tx.event.updateMany).not.toHaveBeenCalled()

    tx.shift.count.mockResolvedValue(0)
    tx.event.updateMany.mockResolvedValue({ count: 0 }) // draft: nothing matched
    expect((await cancelShift(shift, { type: "admin", id: "a" } as never)).unpublished).toBe(false)
    expect(logEvent.mock.calls.some((c) => c[0].action === "event.unpublished")).toBe(false)
  })
})
