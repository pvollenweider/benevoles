// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

/**
 * « Créneaux qui se chevauchent » (#1467): the event's setting is a strict boolean, saved by the
 * event routes that can edit the event, off when the form sends nothing.
 */

const guard = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: guard }))
vi.mock("@/lib/event-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/event-log")>()),
  adminActor: () => ({ type: "admin", id: "adm" }),
  logEvent: vi.fn(),
}))
vi.mock("@/lib/event-slug", () => ({ eventSlugFromTitle: () => ({ slug: "fete" }) }))

const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const patch = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

function makeCreateDb() {
  return {
    organization: { findUnique: vi.fn().mockResolvedValue({ shiftRosterDefault: true, sectorsDefault: false, shiftSwapsDefault: false, workloadPolicyDefault: null, timeZone: null }) },
    event: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt-new", organization: { timeZone: null }, ...data })),
    },
    shiftRecurrence: { create: vi.fn() },
    shift: { createMany: vi.fn() },
    $transaction: vi.fn(),
  }
}

describe("POST /api/admin/events — overlapsAllowed", () => {
  beforeEach(() => vi.clearAllMocks())

  it("stores the setting when the form sends it", async () => {
    const { POST } = await import("@/app/api/admin/events/route")
    const db = makeCreateDb()
    guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    expect((await POST(post("/api/admin/events", { title: "Fête", startDate: "2031-06-06", endDate: "2031-06-06", overlapsAllowed: true }))).status).toBe(201)
    expect(db.event.create.mock.calls[0][0].data).toMatchObject({ overlapsAllowed: true })
    // The event routes that edit the event, not the owner-only ones.
    expect(guard.mock.calls[0]).toEqual([])
  })

  it("leaves the column's default when the form sends nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/route")
    const db = makeCreateDb()
    guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    expect((await POST(post("/api/admin/events", { title: "Fête", startDate: "2031-06-06", endDate: "2031-06-06" }))).status).toBe(201)
    expect(db.event.create.mock.calls[0][0].data).not.toHaveProperty("overlapsAllowed")
  })

  it("refuses any value that is not a boolean", async () => {
    const { POST } = await import("@/app/api/admin/events/route")
    for (const value of ["oui", 1, null]) {
      const db = makeCreateDb()
      guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
      const res = await POST(post("/api/admin/events", { title: "Fête", startDate: "2031-06-06", endDate: "2031-06-06", overlapsAllowed: value }))
      expect(res.status, String(value)).toBe(400)
      expect(db.event.create).not.toHaveBeenCalled()
    }
  })
})

describe("PATCH /api/admin/events/[id] — overlapsAllowed", () => {
  const owned = {
    id: "evt-1", title: "Fête", publicStatus: "draft", isListed: true,
    startDate: new Date("2031-07-04T00:00:00Z"), endDate: new Date("2031-07-04T00:00:00Z"),
    publicInstructions: null, remindersEnabled: true, requirePhone: false, requireEmailConfirmation: false,
    shiftRosterEnabled: false, publicShiftView: "auto", overlapsAllowed: false, cancelDeadlineDays: null, cancelDeadlineHours: null,
    registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
    organization: { timeZone: "Europe/Zurich", publicationApprovedAt: new Date() },
  }

  function makeUpdateDb() {
    return {
      event: {
        findFirst: vi.fn().mockResolvedValue(owned),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...owned, ...data })),
      },
    }
  }

  beforeEach(() => vi.clearAllMocks())

  it("stores the setting and logs the change", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    const db = makeUpdateDb()
    guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    const res = await PATCH(patch("/api/admin/events/evt-1", { overlapsAllowed: true }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(200)
    expect(db.event.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ overlapsAllowed: true }) }))
    expect(guard.mock.calls[0]).toEqual([])
  })

  it("refuses any value that is not a boolean before reading the event", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    for (const value of ["true", 0, {}]) {
      const db = makeUpdateDb()
      guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
      const res = await PATCH(patch("/api/admin/events/evt-1", { overlapsAllowed: value }), { params: Promise.resolve({ id: "evt-1" }) })
      expect(res.status, String(value)).toBe(400)
      expect(db.event.findFirst).not.toHaveBeenCalled()
    }
  })

  it("is refused by a role the guard does not let edit the event", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    const db = makeUpdateDb()
    guard.mockResolvedValue(NextResponse.json({ error: "Non autorisé" }, { status: 403 }))
    const res = await PATCH(patch("/api/admin/events/evt-1", { overlapsAllowed: true }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(403)
    expect(db.event.update).not.toHaveBeenCalled()
  })
})
