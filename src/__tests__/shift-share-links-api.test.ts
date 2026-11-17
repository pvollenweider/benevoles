// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

// Share link for one shift (#1386): the admin route creates it on first use (idempotent), toggles
// its « accepter après la fermeture » option, and logs both. A role assigned by the organisation
// only never gets a link.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn())
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "admin-1" }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const EVENT = { id: "evt-1", slug: "fete", organization: { slug: "club" } }
const SHIFT = { id: "s1", roleName: "Bar", status: "open" }

function makeDb() {
  return {
    event: { findFirst: vi.fn().mockResolvedValue(EVENT) },
    shift: {
      findFirst: vi.fn().mockResolvedValue(SHIFT),
      findMany: vi.fn().mockResolvedValue([{ roleName: "Bar", assignedOnly: false }]),
    },
    shiftShareLink: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "link-1", acceptsAfterClose: false, ...data })),
      update: vi.fn(),
    },
    registration: { count: vi.fn().mockResolvedValue(2) },
  }
}

let db: ReturnType<typeof makeDb>
const params = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ id: "evt-1", linkId: "link-1", ...extra }) })
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/admin/events/evt-1/shift-links", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  db = makeDb()
  requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "admin-1" } } })
})

describe("POST /api/admin/events/[id]/shift-links", () => {
  it("creates the shift's link with a random code, logs it, and counts the sign-ups it brought", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/shift-links/route")
    const res = await POST(req("POST", { shiftId: "s1" }), params())
    expect(res.status).toBe(201)
    const data = db.shiftShareLink.create.mock.calls[0][0].data
    expect(data).toMatchObject({ eventId: "evt-1", shiftId: "s1", createdById: "admin-1" })
    expect(data.code).toMatch(/^[a-z2-9]{8}$/)
    const body = await res.json()
    expect(body).toMatchObject({ shiftId: "s1", code: data.code, registrations: 2, acceptsAfterClose: false })
    expect(body.url).toBe(`http://localhost:3000/fete?org=club&partage=${data.code}`)
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "shiftshare.created",
      entityType: "ShiftShareLink",
      entityId: "link-1",
      changes: { acceptsAfterClose: { from: null, to: false } },
    }))
  })

  it("is idempotent: the same shift returns the existing link, creates and logs nothing", async () => {
    db.shiftShareLink.findFirst.mockResolvedValue({ id: "link-1", shiftId: "s1", code: "abcd2345", acceptsAfterClose: true })
    const { POST } = await import("@/app/api/admin/events/[id]/shift-links/route")
    const res = await POST(req("POST", { shiftId: "s1" }), params())
    expect(res.status).toBe(200)
    expect(db.shiftShareLink.create).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
    expect(await res.json()).toMatchObject({ code: "abcd2345", acceptsAfterClose: true })
  })

  it("refuses a role assigned by the organisation only", async () => {
    db.shift.findMany.mockResolvedValue([{ roleName: "Bar", assignedOnly: true }])
    const { POST } = await import("@/app/api/admin/events/[id]/shift-links/route")
    const res = await POST(req("POST", { shiftId: "s1" }), params())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Ce poste est attribué par l'organisation uniquement : il n'a pas de lien public." })
    expect(db.shiftShareLink.create).not.toHaveBeenCalled()
  })

  it("answers 404 for an unknown shift of the event, and creates nothing", async () => {
    db.shift.findFirst.mockResolvedValue(null)
    const { POST } = await import("@/app/api/admin/events/[id]/shift-links/route")
    const res = await POST(req("POST", { shiftId: "s-b" }), params())
    expect(res.status).toBe(404)
    expect(db.shiftShareLink.create).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/admin/events/[id]/shift-links/[linkId]", () => {
  it("saves the checkbox and logs the change", async () => {
    db.shiftShareLink.findFirst.mockResolvedValue({ id: "link-1", shiftId: "s1", code: "abcd2345", acceptsAfterClose: false })
    db.shiftShareLink.update.mockResolvedValue({ id: "link-1", shiftId: "s1", code: "abcd2345", acceptsAfterClose: true })
    const { PATCH } = await import("@/app/api/admin/events/[id]/shift-links/[linkId]/route")
    const res = await PATCH(req("PATCH", { acceptsAfterClose: true }), params())
    expect(res.status).toBe(200)
    expect(db.shiftShareLink.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "link-1" }, data: { acceptsAfterClose: true } }))
    expect(await res.json()).toMatchObject({ acceptsAfterClose: true, registrations: 2 })
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "shiftshare.updated",
      changes: { acceptsAfterClose: { from: false, to: true } },
    }))
  })

  it("does nothing when the value does not change", async () => {
    db.shiftShareLink.findFirst.mockResolvedValue({ id: "link-1", shiftId: "s1", code: "abcd2345", acceptsAfterClose: true })
    const { PATCH } = await import("@/app/api/admin/events/[id]/shift-links/[linkId]/route")
    const res = await PATCH(req("PATCH", { acceptsAfterClose: true }), params())
    expect(res.status).toBe(200)
    expect(db.shiftShareLink.update).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("answers 404 for another event's link", async () => {
    db.shiftShareLink.findFirst.mockResolvedValue(null)
    const { PATCH } = await import("@/app/api/admin/events/[id]/shift-links/[linkId]/route")
    const res = await PATCH(req("PATCH", { acceptsAfterClose: true }), params())
    expect(res.status).toBe(404)
    expect(db.shiftShareLink.update).not.toHaveBeenCalled()
  })
})
