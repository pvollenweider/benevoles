// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

// Share links per group (#947): the admin routes create, list, change and delete an event's links,
// log each change, never keep a role that isn't on the planning, and keep the code (so the printed
// QR codes) whatever is changed. The role routes carry renames and deletions into the links.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn())
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "admin-1" }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/shift-cancel", () => ({ cancelShift: vi.fn().mockResolvedValue({ cancelledRegistrations: 0, notified: 0, unpublished: false }) }))

const EVENT = { id: "evt-1", slug: "fete", organization: { slug: "club" } }

function makeDb() {
  return {
    event: { findFirst: vi.fn().mockResolvedValue(EVENT) },
    shift: {
      findMany: vi.fn().mockResolvedValue([{ roleName: "Bar" }, { roleName: "Parking" }, { roleName: "Bar" }]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    registration: {
      findMany: vi.fn().mockResolvedValue([{ groupLinkId: "link-1", volunteerId: "v1" }, { groupLinkId: "link-1", volunteerId: "v1" }]),
    },
    eventGroupLink: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "link-1", ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "link-1", code: "abcd2345", name: "Amicale", roleNames: ["Bar"], hideFull: false, ...data })),
      delete: vi.fn().mockResolvedValue({ id: "link-1" }),
    },
    eventQuestion: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  }
}

let db: ReturnType<typeof makeDb>
const params = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ id: "evt-1", linkId: "", roleName: "", ...extra }) })
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/admin/events/evt-1/group-links", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  db = makeDb()
  requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "admin-1" } } })
})

describe("POST /api/admin/events/[id]/group-links", () => {
  it("creates a link with a random code, the roles kept in the planning's order, and logs it", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/group-links/route")
    const res = await POST(req("POST", { name: "  Amicale des pompiers ", roleNames: ["Parking", "Bar", "Bar"], hideFull: true }), params())
    expect(res.status).toBe(201)
    const data = db.eventGroupLink.create.mock.calls[0][0].data
    expect(data).toMatchObject({ eventId: "evt-1", name: "Amicale des pompiers", roleNames: ["Parking", "Bar"], hideFull: true })
    expect(data.code).toMatch(/^[a-z2-9]{8}$/)
    const body = await res.json()
    expect(body.url).toBe(`http://localhost:3000/fete?org=club&groupe=${data.code}`)
    expect(body.registrations).toBe(0)
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "grouplink.created", entityType: "GroupLink", entityId: "link-1",
      changes: { name: { from: null, to: "Amicale des pompiers" }, roleNames: { from: null, to: "Parking, Bar" }, hideFull: { from: null, to: true } },
    }))
  })

  it("refuses a missing name, with a sentence naming the field", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/group-links/route")
    const res = await POST(req("POST", { name: " ", roleNames: ["Bar"] }), params())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Donnez un nom au lien, par exemple celui du club.", field: "name" })
  })

  it("refuses a name over 60 characters", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/group-links/route")
    const res = await POST(req("POST", { name: "x".repeat(61), roleNames: ["Bar"] }), params())
    expect(res.status).toBe(400)
    expect((await res.json()).field).toBe("name")
  })

  it("refuses no role, or only roles that aren't on the planning", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/group-links/route")
    for (const roleNames of [[], ["Démontage"]]) {
      const res = await POST(req("POST", { name: "Fanfare", roleNames }), params())
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "Choisissez au moins un poste.", field: "roleNames" })
    }
    expect(db.eventGroupLink.create).not.toHaveBeenCalled()
  })

  it("refuses a name another link of the event already has, case and accents aside", async () => {
    db.eventGroupLink.findMany.mockResolvedValue([{ id: "link-9", name: "Amicale des Pompiers" }])
    const { POST } = await import("@/app/api/admin/events/[id]/group-links/route")
    const res = await POST(req("POST", { name: "amicale des pompiers", roleNames: ["Bar"] }), params())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Un autre lien de cet événement porte déjà ce nom : choisissez-en un autre.", field: "name" })
    expect(db.eventGroupLink.create).not.toHaveBeenCalled()
  })

  it("retries with a new code when the generated one is already taken", async () => {
    db.eventGroupLink.create
      .mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }))
      .mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ({ id: "link-1", ...data }))
    const { POST } = await import("@/app/api/admin/events/[id]/group-links/route")
    const res = await POST(req("POST", { name: "Fanfare", roleNames: ["Bar"] }), params())
    expect(res.status).toBe(201)
    expect(db.eventGroupLink.create).toHaveBeenCalledTimes(2)
  })

  it("404s for an event the organisation doesn't own", async () => {
    db.event.findFirst.mockResolvedValue(null)
    const { POST } = await import("@/app/api/admin/events/[id]/group-links/route")
    expect((await POST(req("POST", { name: "Fanfare", roleNames: ["Bar"] }), params())).status).toBe(404)
  })
})

describe("GET /api/admin/events/[id]/group-links", () => {
  it("lists the links with their sign-ups and the roles no longer on the planning", async () => {
    db.eventGroupLink.findMany.mockResolvedValue([
      { id: "link-1", code: "abcd2345", name: "Amicale", roleNames: ["Bar", "Montage"], hideFull: false },
      { id: "link-2", code: "zzzz2222", name: "Fanfare", roleNames: ["Parking"], hideFull: true },
    ])
    const { GET } = await import("@/app/api/admin/events/[id]/group-links/route")
    const res = await GET(req("GET"), params())
    expect(res.status).toBe(200)
    const [a, b] = await res.json()
    expect(a).toMatchObject({ name: "Amicale", missingRoles: ["Montage"], registrations: 2, people: 1 })
    expect(b).toMatchObject({ name: "Fanfare", missingRoles: [], registrations: 0, people: 0 })
    // Only live sign-ups that came through a link count.
    expect(db.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: "evt-1", groupLinkId: { not: null }, status: { in: ["active", "waiting", "offered", "requested"] } },
    }))
  })
})

describe("PATCH / DELETE /api/admin/events/[id]/group-links/[linkId]", () => {
  const before = { id: "link-1", eventId: "evt-1", code: "abcd2345", name: "Amicale", roleNames: ["Bar"], hideFull: false }

  it("changes the name, roles and option, never the code, and logs only what changed", async () => {
    db.eventGroupLink.findFirst.mockResolvedValue(before)
    const { PATCH } = await import("@/app/api/admin/events/[id]/group-links/[linkId]/route")
    const res = await PATCH(req("PATCH", { name: "Amicale des pompiers", roleNames: ["Bar", "Parking"], code: "hacked00" }), params({ linkId: "link-1" }))
    expect(res.status).toBe(200)
    const data = db.eventGroupLink.update.mock.calls[0][0].data
    expect(data).toEqual({ name: "Amicale des pompiers", roleNames: ["Bar", "Parking"] })
    expect((await res.json()).url).toContain("groupe=abcd2345")
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "grouplink.updated",
      changes: { name: { from: "Amicale", to: "Amicale des pompiers" }, roleNames: { from: "Bar", to: "Bar, Parking" } },
    }))
  })

  it("keeps its own name on a change, but refuses another link's", async () => {
    db.eventGroupLink.findFirst.mockResolvedValue(before)
    db.eventGroupLink.findMany.mockResolvedValue([{ id: "link-1", name: "Amicale" }, { id: "link-2", name: "Fanfare" }])
    const { PATCH } = await import("@/app/api/admin/events/[id]/group-links/[linkId]/route")
    expect((await PATCH(req("PATCH", { name: "Amicale", hideFull: true }), params({ linkId: "link-1" }))).status).toBe(200)
    expect((await PATCH(req("PATCH", { name: "fanfare" }), params({ linkId: "link-1" }))).status).toBe(409)
  })

  it("404s for a link of another event (or organisation)", async () => {
    db.eventGroupLink.findFirst.mockResolvedValue(null)
    const { PATCH, DELETE } = await import("@/app/api/admin/events/[id]/group-links/[linkId]/route")
    expect((await PATCH(req("PATCH", { name: "X" }), params({ linkId: "other" }))).status).toBe(404)
    expect((await DELETE(req("DELETE"), params({ linkId: "other" }))).status).toBe(404)
    expect(db.eventGroupLink.findFirst).toHaveBeenCalledWith({ where: { id: "other", eventId: "evt-1" } })
    expect(db.eventGroupLink.update).not.toHaveBeenCalled()
    expect(db.eventGroupLink.delete).not.toHaveBeenCalled()
  })

  it("deletes the link and logs it; registrations are left to the foreign key (SET NULL)", async () => {
    db.eventGroupLink.findFirst.mockResolvedValue(before)
    const { DELETE } = await import("@/app/api/admin/events/[id]/group-links/[linkId]/route")
    const res = await DELETE(req("DELETE"), params({ linkId: "link-1" }))
    expect(res.status).toBe(200)
    expect(db.eventGroupLink.delete).toHaveBeenCalledWith({ where: { id: "link-1" } })
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "grouplink.deleted", changes: { name: { from: "Amicale", to: null } } }))
  })
})

describe("roles renamed or deleted are carried into the links", () => {
  it("a rename replaces the role in every link of the event that shows it", async () => {
    db.shift.findMany.mockResolvedValue([{ id: "s1", colorKey: null, capacity: 2, status: "open", maxPerVolunteer: null, reservedTags: [], _count: { registrations: 0 } }])
    db.eventGroupLink.findMany.mockResolvedValue([{ id: "link-1", roleNames: ["Bar", "Parking"] }])
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await PATCH(req("PATCH", { name: "Buvette" }), { params: Promise.resolve({ id: "evt-1", roleName: "Bar" }) })
    expect(res.status).toBe(200)
    expect(db.eventGroupLink.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "evt-1", roleNames: { has: "Bar" } } }))
    expect(db.eventGroupLink.update).toHaveBeenCalledWith({ where: { id: "link-1" }, data: { roleNames: ["Buvette", "Parking"] } })
    // A question attached to the role (#984, part 3) follows the rename.
    expect(db.eventQuestion.updateMany).toHaveBeenCalledWith({ where: { eventId: "evt-1", roleName: "Bar" }, data: { roleName: "Buvette" } })
  })

  it("a deletion removes the role from the links, keeping the others", async () => {
    db.shift.findMany.mockResolvedValue([{ id: "s1", registrations: [], event: { id: "evt-1" } }])
    db.eventGroupLink.findMany.mockResolvedValue([{ id: "link-1", roleNames: ["Bar", "Parking"] }])
    const { DELETE } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await DELETE(req("DELETE"), { params: Promise.resolve({ id: "evt-1", roleName: "Bar" }) })
    expect(res.status).toBe(200)
    expect(db.eventGroupLink.update).toHaveBeenCalledWith({ where: { id: "link-1" }, data: { roleNames: ["Parking"] } })
    // A question attached to the deleted role (#984, part 3) goes back to the organisers.
    expect(db.eventQuestion.updateMany).toHaveBeenCalledWith({ where: { eventId: "evt-1", roleName: "Bar" }, data: { roleName: null } })
  })
})

describe("GET /api/admin/events/[id]/qr?link=", () => {
  it("encodes the group link's URL and names the file after it", async () => {
    db.event.findFirst.mockResolvedValue({ slug: "fete", title: "Fête", organization: { slug: "club" } })
    db.eventGroupLink.findFirst.mockResolvedValue({ code: "abcd2345", name: "Amicale des pompiers" })
    const { GET } = await import("@/app/api/admin/events/[id]/qr/route")
    const res = await GET(new Request("http://localhost/api/admin/events/evt-1/qr?link=link-1&format=svg&download=1"), params())
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="fete-amicale-des-pompiers-qr.svg"')
    expect(db.eventGroupLink.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "link-1", eventId: "evt-1" } }))
  })

  it("404s for a link that isn't this event's", async () => {
    db.event.findFirst.mockResolvedValue({ slug: "fete", title: "Fête", organization: { slug: "club" } })
    db.eventGroupLink.findFirst.mockResolvedValue(null)
    const { GET } = await import("@/app/api/admin/events/[id]/qr/route")
    expect((await GET(new Request("http://localhost/api/admin/events/evt-1/qr?link=other"), params())).status).toBe(404)
  })
})
