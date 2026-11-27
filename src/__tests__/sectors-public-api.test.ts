// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"
import { PUBLIC_GROUPING_NOT_ADOPTED_ERROR } from "@/lib/sectors"

/**
 * « Regrouper les créneaux par secteur sur la page d'inscription » (#1469): its own route, a strict
 * boolean, only for an event that adopted sectors, logged in the event's journal when it changes.
 */

const guard = vi.hoisted(() => vi.fn())
const logEvent = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: guard }))
vi.mock("@/lib/event-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/event-log")>()),
  adminActor: () => ({ type: "admin", id: "adm" }),
  logEvent,
}))

const put = (body: unknown) =>
  new Request("http://localhost/api/admin/events/evt-a/sectors/public", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "evt-a" }) }

function dbWith(event: unknown) {
  const db = { event: { findFirst: vi.fn().mockResolvedValue(event), update: vi.fn() } }
  guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
  return db
}

const ADOPTED = { id: "evt-a", sectorsEnabled: true, sectorsAdoptedAt: new Date(), publicSectorGrouping: false }

describe("PUT /api/admin/events/[id]/sectors/public", () => {
  beforeEach(() => vi.clearAllMocks())

  it("turns the grouping on and logs it", async () => {
    const { PUT } = await import("@/app/api/admin/events/[id]/sectors/public/route")
    const db = dbWith(ADOPTED)
    const res = await PUT(put({ enabled: true }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ publicSectorGrouping: true })
    expect(db.event.update).toHaveBeenCalledWith({ where: { id: "evt-a" }, data: { publicSectorGrouping: true } })
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ changes: { publicSectorGrouping: { from: false, to: true } } }))
  })

  it("writes and logs nothing when the value does not change", async () => {
    const { PUT } = await import("@/app/api/admin/events/[id]/sectors/public/route")
    const db = dbWith(ADOPTED)
    expect((await PUT(put({ enabled: false }), params)).status).toBe(200)
    expect(db.event.update).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("refuses an event that has not adopted sectors yet", async () => {
    const { PUT } = await import("@/app/api/admin/events/[id]/sectors/public/route")
    const db = dbWith({ ...ADOPTED, sectorsAdoptedAt: null })
    const res = await PUT(put({ enabled: true }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(PUBLIC_GROUPING_NOT_ADOPTED_ERROR)
    expect(db.event.update).not.toHaveBeenCalled()
  })

  it("refuses anything but a boolean", async () => {
    const { PUT } = await import("@/app/api/admin/events/[id]/sectors/public/route")
    const db = dbWith(ADOPTED)
    expect((await PUT(put({ enabled: "yes" }), params)).status).toBe(400)
    expect(db.event.update).not.toHaveBeenCalled()
  })

  it("is open to organisers, like the sectors option", async () => {
    const { PERMISSIONS } = await import("@/lib/permissions")
    expect(PERMISSIONS["events/[id]/sectors/public"]).toEqual({ PUT: "organizer" })
  })
})
