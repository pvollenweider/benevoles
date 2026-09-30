import { describe, it, expect, vi, beforeEach } from "vitest"

const findMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findMany } } }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn(), SYSTEM_ACTOR: { type: "system" } }))
vi.mock("@/lib/notifications/outbox", () => ({ deliverAfterResponse: vi.fn(), enqueueNotifications: vi.fn() }))

import { reconcileWaitlists, RECONCILE_MAX_OFFERS_PER_SHIFT } from "../waitlist"

// A spot freed while the promotion failed must not stay free while people wait (audit).
describe("reconcileWaitlists", () => {
  beforeEach(() => vi.clearAllMocks())

  it("looks at upcoming, live shifts with someone waiting, once each", async () => {
    findMany.mockResolvedValue([])
    await reconcileWaitlists(new Date("2026-09-30T14:00:00Z"), vi.fn())
    expect(findMany).toHaveBeenCalledWith({
      where: { status: "waiting", shift: { status: { not: "cancelled" }, date: { gte: new Date("2026-09-30T00:00:00Z") } } },
      select: { shiftId: true },
      distinct: ["shiftId"],
    })
  })

  it("offers spots on each shift until none is free, and counts them", async () => {
    findMany.mockResolvedValue([{ shiftId: "a" }, { shiftId: "b" }, { shiftId: "c" }])
    const free: Record<string, number> = { a: 2, b: 0, c: 1 }
    const promote = vi.fn(async (id: string) => (free[id]-- > 0))
    expect(await reconcileWaitlists(new Date(), promote)).toEqual({ shifts: 3, offered: 3 })
    expect(promote.mock.calls.map((c) => c[0])).toEqual(["a", "a", "a", "b", "c", "c"])
  })

  it("stops at a safety bound per shift", async () => {
    findMany.mockResolvedValue([{ shiftId: "a" }])
    const promote = vi.fn(async () => true)
    expect((await reconcileWaitlists(new Date(), promote)).offered).toBe(RECONCILE_MAX_OFFERS_PER_SHIFT)
  })
})
