// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/event-log")>()), logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
const cancelShift = vi.hoisted(() => vi.fn())
vi.mock("@/lib/shift-cancel", () => ({ cancelShift }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
const enqueue = vi.hoisted(() => vi.fn().mockResolvedValue([]))
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => {
    const payloads: unknown[] = []
    return { payloads, send: async (p: unknown) => { payloads.push(p) } }
  },
  enqueueNotifications: enqueue,
  deliverAfterResponse: vi.fn(),
}))
vi.mock("@/lib/shift-swap-server", () => ({ endSwapsIn: vi.fn() }))

/**
 * « Créneau annulé » chosen as a shift's status (AUTHZ-15): the same cancellation as « Supprimer »
 * (registrations cancelled, people emailed through the outbox), unless the organiser ticked « Ne pas
 * prévenir les inscrits » (notifyVolunteers false). Never mixed with other changes. Reopening tells
 * nobody.
 */
const stored = (status = "open") => ({
  id: "s1", eventId: "evt-a", roleName: "Bar", label: "Bar", description: null, date: new Date("2030-07-04T00:00:00Z"),
  startTime: "10:00", endTime: "12:00", capacity: 5, minVolunteers: null, status, placeId: null, mealOnTheGo: false,
  waitlistEnabled: false, requiresApproval: false, minAge: null, updatedAt: new Date("2030-06-01T00:00:00Z"),
  event: { id: "evt-a", title: "Fête", slug: "fete", organizationId: "org-a", startDate: null, endDate: null, organization: { slug: "org" } },
  registrations: [{ id: "r1", status: "active", volunteerId: "v1", volunteer: { email: "emma@example.org", firstName: "Emma" } }],
})

const patch = (body: unknown) => new Request("http://localhost/api/admin/shifts/s1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "s1" }) }

describe("PATCH /api/admin/shifts/[id] with status « cancelled » (AUTHZ-15)", () => {
  let findFirst: ReturnType<typeof vi.fn>
  let update: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.clearAllMocks()
    cancelShift.mockResolvedValue({ cancelledRegistrations: 1, notified: 1, unpublished: false })
    findFirst = vi.fn(async () => stored())
    update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...stored(), ...data }))
    const db = { shift: { findFirst, findMany: vi.fn(async () => []), update }, $transaction: async (fn: (tx: unknown) => unknown) => fn(db) }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "adm-1" } } })
  })

  it("cancels through the shared cancellation and tells the people registered by default", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    const res = await PATCH(patch({ status: "cancelled" }), params)
    expect(res.status).toBe(200)
    expect(cancelShift).toHaveBeenCalledWith(expect.objectContaining({ id: "s1", registrations: [expect.objectContaining({ id: "r1" })] }), { type: "admin", id: "adm-1" }, { notify: true })
    // The pending requests are read too: they are cancelled with the places.
    expect(findFirst.mock.calls[1][0].include.registrations.where).toEqual({ status: { in: ["active", "requested"] } })
    expect(await res.json()).toMatchObject({ status: "cancelled", notified: 1, cancelledRegistrations: 1 })
    expect(update).not.toHaveBeenCalled()
  })

  it("tells nobody when the organiser chose not to", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    await PATCH(patch({ status: "cancelled", notifyVolunteers: false }), params)
    expect(cancelShift).toHaveBeenCalledWith(expect.anything(), expect.anything(), { notify: false })
  })

  it("accepts the label sent unchanged with it (the timeline does), refuses any real change alongside", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    expect((await PATCH(patch({ status: "cancelled", label: "Bar" }), params)).status).toBe(200)
    const mixed = await PATCH(patch({ status: "cancelled", capacity: 8 }), params)
    expect(mixed.status).toBe(400)
    expect(cancelShift).toHaveBeenCalledTimes(1)
  })

  it("reopening a cancelled shift only changes its status: nobody is told", async () => {
    findFirst.mockResolvedValue(stored("cancelled"))
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    const res = await PATCH(patch({ status: "open" }), params)
    expect(res.status).toBe(200)
    expect(cancelShift).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { status: "open" } })
    expect(enqueue.mock.calls[0][0]).toEqual([])
  })

  it("a shift already cancelled is not cancelled twice", async () => {
    findFirst.mockResolvedValue(stored("cancelled"))
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    await PATCH(patch({ status: "cancelled" }), params)
    expect(cancelShift).not.toHaveBeenCalled()
  })
})
