// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * The event's default view of the shifts (#1407, part A): a validated setting ("auto", "frise",
 * "liste") accepted by the admin API, copied with the event's settings on duplication.
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

describe("POST /api/admin/events — publicShiftView", () => {
  beforeEach(() => vi.clearAllMocks())

  it("stores « frise » and « liste »", async () => {
    const { POST } = await import("@/app/api/admin/events/route")
    for (const setting of ["frise", "liste"] as const) {
      const db = makeCreateDb()
      guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
      expect((await POST(post("/api/admin/events", { title: "Fête", startDate: "2031-06-06", endDate: "2031-06-06", publicShiftView: setting }))).status).toBe(201)
      expect(db.event.create.mock.calls[0][0].data).toMatchObject({ publicShiftView: setting })
    }
  })

  it("defaults to « auto » when the form sends nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/route")
    const db = makeCreateDb()
    guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    expect((await POST(post("/api/admin/events", { title: "Fête", startDate: "2031-06-06", endDate: "2031-06-06" }))).status).toBe(201)
    // Absent from the body: the column's default applies.
    expect(db.event.create.mock.calls[0][0].data).not.toHaveProperty("publicShiftView")
  })

  it("refuses any other value", async () => {
    const { POST } = await import("@/app/api/admin/events/route")
    for (const value of ["Frise", "autre", 1, null]) {
      const db = makeCreateDb()
      guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
      const res = await POST(post("/api/admin/events", { title: "Fête", startDate: "2031-06-06", endDate: "2031-06-06", publicShiftView: value }))
      expect(res.status, String(value)).toBe(400)
      expect(db.event.create).not.toHaveBeenCalled()
    }
  })
})

describe("PATCH /api/admin/events/[id] — publicShiftView", () => {
  const owned = {
    id: "evt-1", title: "Fête", publicStatus: "draft", isListed: true,
    startDate: new Date("2031-07-04T00:00:00Z"), endDate: new Date("2031-07-04T00:00:00Z"),
    publicInstructions: null, remindersEnabled: true, requirePhone: false, requireEmailConfirmation: false,
    shiftRosterEnabled: false, publicShiftView: "auto", cancelDeadlineDays: null, cancelDeadlineHours: null,
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

  it("stores a valid setting", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    const db = makeUpdateDb()
    guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
    const res = await PATCH(patch("/api/admin/events/evt-1", { publicShiftView: "liste" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(200)
    expect(db.event.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ publicShiftView: "liste" }) }))
  })

  it("refuses any other value before reading the event", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    for (const value of ["liste ", "Automatique", true]) {
      const db = makeUpdateDb()
      guard.mockResolvedValue({ db, organizationId: "org-a", session: {} })
      const res = await PATCH(patch("/api/admin/events/evt-1", { publicShiftView: value }), { params: Promise.resolve({ id: "evt-1" }) })
      expect(res.status, String(value)).toBe(400)
      expect(db.event.findFirst).not.toHaveBeenCalled()
    }
  })
})
