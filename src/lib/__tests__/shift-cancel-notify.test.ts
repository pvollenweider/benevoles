// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"
// Swap requests (#1174) end through their own module, tested on Postgres (src/__integration__/shift-swaps.int.test.ts).
vi.mock("@/lib/shift-swap-server", () => ({ endSwapsIn: vi.fn(), endSwapsAfter: vi.fn() }))

const tx = vi.hoisted(() => ({
  shift: { update: vi.fn(), count: vi.fn() },
  registration: { update: vi.fn() },
  event: { updateMany: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: (fn: (t: unknown) => unknown) => fn(tx) } }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-cancel"))
vi.mock("@/lib/event-log", () => ({ logEvent }))
const enqueue = vi.hoisted(() => vi.fn().mockResolvedValue([]))
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => {
    const payloads: unknown[] = []
    return { payloads, send: async (p: unknown) => { payloads.push(p) } }
  },
  enqueueNotifications: enqueue,
  deliverAfterResponse: vi.fn(),
}))

const shift = {
  id: "s1", label: "Bar", date: new Date("2030-07-04T00:00:00Z"), status: "open",
  event: { id: "evt-a", title: "Fête", slug: "fete", organizationId: "org-a", organization: { slug: "org" } },
  registrations: [
    { id: "r1", status: "active", volunteerId: "v1", volunteer: { email: "emma@example.org", firstName: "Emma" } },
    { id: "r2", status: "requested", volunteerId: "v2", volunteer: { email: "luca@example.org", firstName: "Luca" } },
  ],
}
const actor = { type: "admin", id: "a" } as never

// A shift cancelled by an organiser (AUTHZ-15): the people registered are emailed unless the
// organiser chose not to, the choice is logged, and each registration keeps its previous status.
describe("cancelShift — who is told", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tx.shift.count.mockResolvedValue(3)
  })

  it("emails every person registered by default, and logs that they were told", async () => {
    const { cancelShift } = await import("@/lib/shift-cancel")
    expect(await cancelShift(shift, actor)).toMatchObject({ cancelledRegistrations: 2, notified: 2 })
    expect(enqueue.mock.calls[0][0].map((p: { kind: string; recipient: { email: string } }) => [p.kind, p.recipient.email])).toEqual([["shift_cancelled", "emma@example.org"], ["shift_cancelled", "luca@example.org"]])
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "shift.cancelled", changes: { volunteersNotified: { from: null, to: true } } })
  })

  it("sends nothing with notify off, still cancels every registration, and logs the choice", async () => {
    const { cancelShift } = await import("@/lib/shift-cancel")
    expect(await cancelShift(shift, actor, { notify: false })).toMatchObject({ cancelledRegistrations: 2, notified: 0 })
    expect(enqueue.mock.calls[0][0]).toEqual([])
    expect(tx.registration.update).toHaveBeenCalledTimes(2)
    expect(logEvent.mock.calls[0][0].changes.volunteersNotified).toEqual({ from: null, to: false })
  })

  it("records each registration's previous status, so « Rétablir » gives a request back as a request (Codex)", async () => {
    const { cancelShift } = await import("@/lib/shift-cancel")
    await cancelShift(shift, actor)
    const regs = logEvent.mock.calls.filter((c) => c[0].action === "registration.cancelled").map((c) => [c[0].entityId, c[0].changes.status.from])
    expect(regs).toEqual([["r1", "active"], ["r2", "requested"]])
  })

  it("logs no notification choice on a shift nobody held", async () => {
    const { cancelShift } = await import("@/lib/shift-cancel")
    await cancelShift({ ...shift, registrations: [] }, actor, { notify: false })
    expect(logEvent.mock.calls[0][0].changes).toEqual({ status: { from: "open", to: "cancelled" } })
  })
})
