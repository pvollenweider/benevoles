import { describe, it, expect, vi, beforeEach } from "vitest"

// Custom sign-up questions (#483): admin CRUD and the sign-up answers.
const guard = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: guard }))
const logEvent = vi.hoisted(() => vi.fn())
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm" }) }))

const q = { id: "q1", label: "Taille", type: "single", options: ["S", "M"], required: true, position: 0, _count: { answers: 0 } }
const db = (over: Record<string, unknown> = {}) => ({
  event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-1" }) },
  eventQuestion: {
    findMany: vi.fn().mockResolvedValue([{ id: "q1" }, { id: "q2" }]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(q),
    findFirst: vi.fn().mockResolvedValue({ ...q, answers: [] }),
    update: vi.fn().mockResolvedValue(q),
    delete: vi.fn().mockResolvedValue(q),
    ...over,
  },
  // The event's live shifts (#984, part 3): its postes.
  shift: { findMany: vi.fn().mockResolvedValue([{ roleName: "Cuisine" }, { roleName: "Bar" }]) },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
})
const json = (method: string, body?: unknown) => new Request("http://localhost/x", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
const params = { params: Promise.resolve({ id: "evt-1", questionId: "q1" }) }

describe("questions admin API", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a question at the end, refuses a sixth and a choice without two options", async () => {
    const d = db({ count: vi.fn().mockResolvedValue(2) })
    guard.mockResolvedValue({ db: d, session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/questions/route")
    expect((await POST(json("POST", { label: "Taille", type: "single", options: ["S", "M"], required: true }), params)).status).toBe(201)
    expect(d.eventQuestion.create.mock.calls[0][0].data).toMatchObject({ eventId: "evt-1", position: 2, type: "single", options: ["S", "M"] })
    expect((await POST(json("POST", { label: "X", type: "single", options: ["S"] }), params)).status).toBe(400)
    guard.mockResolvedValue({ db: db({ count: vi.fn().mockResolvedValue(5) }), session: {} })
    expect((await POST(json("POST", { label: "X", type: "text" }), params)).status).toBe(409)
  })

  it("keeps existing answers: no type change, no removal of a chosen option", async () => {
    guard.mockResolvedValue({ db: db({ findFirst: vi.fn().mockResolvedValue({ ...q, answers: [{ values: ["S"] }] }) }), session: {} })
    const { PATCH } = await import("@/app/api/admin/events/[id]/questions/[questionId]/route")
    expect((await PATCH(json("PATCH", { label: "Taille", type: "text" }), params)).status).toBe(409)
    const removed = await PATCH(json("PATCH", { label: "Taille", type: "single", options: ["M", "L"] }), params)
    expect(removed.status).toBe(409)
    expect((await removed.json()).error).toMatch(/« S »/)
    expect((await PATCH(json("PATCH", { label: "Taille de t-shirt", type: "single", options: ["S", "M", "L"] }), params)).status).toBe(200)
  })

  it("archives an answered question instead of deleting it, deletes an unanswered one", async () => {
    const answered = db({ findFirst: vi.fn().mockResolvedValue({ ...q, answers: [{ values: ["S"] }] }) })
    guard.mockResolvedValue({ db: answered, session: {} })
    const { DELETE } = await import("@/app/api/admin/events/[id]/questions/[questionId]/route")
    expect(await (await DELETE(json("DELETE"), params)).json()).toEqual({ archived: true, followUps: [] })
    expect(answered.eventQuestion.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date)
    expect(answered.eventQuestion.delete).not.toHaveBeenCalled()
    const empty = db()
    guard.mockResolvedValue({ db: empty, session: {} })
    expect(await (await DELETE(json("DELETE"), params)).json()).toEqual({ archived: false, followUps: [] })
    expect(empty.eventQuestion.delete).toHaveBeenCalled()
  })

  it("creates a follow-up of a yes/no question, placed right after it and logged with its condition (#1016)", async () => {
    const active = [
      { id: "meal", label: "Repas ?", type: "yesno", options: [], parentId: null, showIfValues: [], position: 0 },
      { id: "size", label: "Taille", type: "single", options: ["S", "M"], parentId: null, showIfValues: [], position: 1 },
    ]
    const created = { ...q, id: "count", label: "Combien ?", type: "number", options: [], parentId: "meal", showIfValues: ["Oui"], position: 2 }
    const findMany = vi.fn().mockResolvedValueOnce(active).mockResolvedValueOnce([...active, created])
    const d = db({ count: vi.fn().mockResolvedValue(2), findMany, create: vi.fn().mockResolvedValue(created), findFirst: vi.fn().mockResolvedValue({ ...created, position: 1 }) })
    guard.mockResolvedValue({ db: d, session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/questions/route")
    const res = await POST(json("POST", { label: "Combien ?", type: "number", parentId: "meal", showIfValues: ["Oui", "Oui"] }), params)
    expect(res.status).toBe(201)
    expect(d.eventQuestion.create.mock.calls[0][0].data).toMatchObject({ parentId: "meal", showIfValues: ["Oui"] })
    // Positions rewritten: the follow-up second, « Taille » third.
    expect(d.eventQuestion.update.mock.calls.map((c: { where: { id: string }; data: { position: number } }[]) => [c[0].where.id, c[0].data.position])).toEqual([["count", 1], ["size", 2]])
    expect(logEvent.mock.calls[0][0].changes.condition).toEqual({ from: null, to: "Si « Oui » à « Repas ? »" })
  })

  it("refuses a follow-up of a follow-up, of a text question, or without an accepted answer (#1016)", async () => {
    const active = [
      { id: "meal", label: "Repas ?", type: "yesno", options: [], parentId: null, showIfValues: [], position: 0 },
      { id: "count", label: "Combien ?", type: "number", options: [], parentId: "meal", showIfValues: ["Oui"], position: 1 },
      { id: "note", label: "Remarque", type: "text", options: [], parentId: null, showIfValues: [], position: 2 },
    ]
    const d = db({ findMany: vi.fn().mockResolvedValue(active) })
    guard.mockResolvedValue({ db: d, session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/questions/route")
    for (const body of [{ parentId: "count", showIfValues: ["Oui"] }, { parentId: "note", showIfValues: ["x"] }, { parentId: "meal", showIfValues: [] }, { parentId: "meal", showIfValues: ["Peut-être"] }]) {
      expect((await POST(json("POST", { label: "X", type: "text", ...body }), params)).status).toBe(400)
    }
    expect(d.eventQuestion.create).not.toHaveBeenCalled()
  })

  it("a parent keeps its type and the choices its follow-ups use; an answered follow-up keeps its parent (#1016)", async () => {
    const parent = { ...q, id: "size", type: "single", options: ["S", "M"], parentId: null, showIfValues: [], answers: [], followUps: [{ id: "f", label: "Combien ?", showIfValues: ["S"], _count: { answers: 0 } }] }
    guard.mockResolvedValue({ db: db({ findFirst: vi.fn().mockResolvedValue(parent) }), session: {} })
    const { PATCH } = await import("@/app/api/admin/events/[id]/questions/[questionId]/route")
    expect((await PATCH(json("PATCH", { label: "Taille", type: "text" }), params)).status).toBe(409)
    expect((await PATCH(json("PATCH", { label: "Taille", type: "single", options: ["M", "L"] }), params)).status).toBe(409)
    expect((await PATCH(json("PATCH", { label: "Taille", type: "single", options: ["S", "M", "L"] }), params)).status).toBe(200)
    const answered = { ...q, id: "f", type: "number", options: [], parentId: "size", showIfValues: ["S"], answers: [{ values: ["2"] }], followUps: [] }
    const active = [{ id: "size", label: "Taille", type: "single", options: ["S", "M"], parentId: null, showIfValues: [], position: 0 }, { id: "meal", label: "Repas ?", type: "yesno", options: [], parentId: null, showIfValues: [], position: 1 }]
    guard.mockResolvedValue({ db: db({ findFirst: vi.fn().mockResolvedValue(answered), findMany: vi.fn().mockResolvedValue(active) }), session: {} })
    expect((await PATCH(json("PATCH", { label: "Combien ?", type: "number", parentId: "meal", showIfValues: ["Oui"] }), params)).status).toBe(400)
    expect((await PATCH(json("PATCH", { label: "Combien ?", type: "number", parentId: "size", showIfValues: ["M"] }), params)).status).toBe(400)
    expect((await PATCH(json("PATCH", { label: "Combien ?", type: "number", parentId: "size", showIfValues: ["S", "M"] }), params)).status).toBe(200)
    expect((await PATCH(json("PATCH", { label: "Combien ?", type: "number", parentId: null }), params)).status).toBe(200)
  })

  it("removing a parent removes its follow-ups: deleted when unanswered, archived otherwise (#1016)", async () => {
    const parent = { ...q, id: "meal", answers: [{ values: ["Oui"] }], followUps: [{ id: "count", label: "Combien ?", showIfValues: ["Oui"], _count: { answers: 2 } }, { id: "diet", label: "Régime ?", showIfValues: ["Oui"], _count: { answers: 0 } }] }
    const d = db({ findFirst: vi.fn().mockResolvedValue(parent) })
    guard.mockResolvedValue({ db: d, session: {} })
    const { DELETE } = await import("@/app/api/admin/events/[id]/questions/[questionId]/route")
    const res = await DELETE(json("DELETE"), params)
    expect(await res.json()).toEqual({ archived: true, followUps: [{ id: "count", label: "Combien ?", archived: true }, { id: "diet", label: "Régime ?", archived: false }] })
    expect(d.eventQuestion.update.mock.calls.map((c: { where: { id: string } }[]) => c[0].where.id)).toEqual(["count", "q1"])
    expect(d.eventQuestion.delete.mock.calls.map((c: { where: { id: string } }[]) => c[0].where.id)).toEqual(["diet"])
    expect(logEvent).toHaveBeenCalledTimes(3)
  })

  it("reorders keeping each follow-up right after its parent (#1016)", async () => {
    const d = db({ findMany: vi.fn().mockResolvedValue([{ id: "a", parentId: null }, { id: "p", parentId: null }, { id: "f", parentId: "p" }]) })
    guard.mockResolvedValue({ db: d, session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/questions/reorder/route")
    const res = await POST(json("POST", { ids: ["f", "a", "p"] }), params)
    expect((await res.json()).ids).toEqual(["a", "p", "f"])
  })

  it("answers 404 for a question or event of another organisation (scoped client)", async () => {
    guard.mockResolvedValue({ db: db({ findFirst: vi.fn().mockResolvedValue(null) }), session: {} })
    const { PATCH, DELETE } = await import("@/app/api/admin/events/[id]/questions/[questionId]/route")
    expect((await PATCH(json("PATCH", { label: "X", type: "text" }), params)).status).toBe(404)
    expect((await DELETE(json("DELETE"), params)).status).toBe(404)
    guard.mockResolvedValue({ db: { ...db(), event: { findFirst: vi.fn().mockResolvedValue(null) } }, session: {} })
    const { GET } = await import("@/app/api/admin/events/[id]/questions/route")
    expect((await GET(json("GET"), params)).status).toBe(404)
  })

  it("attaches a question to one of the event's postes, refusing any other (#984, part 3)", async () => {
    const d = db({ create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...q, ...data })) })
    guard.mockResolvedValue({ db: d, session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/questions/route")
    const ok = await POST(json("POST", { label: "Repas ?", type: "yesno", roleName: "Cuisine" }), params)
    expect(ok.status).toBe(201)
    expect(d.shift.findMany).toHaveBeenCalledWith({ where: { eventId: "evt-1", status: { not: "cancelled" } }, select: { roleName: true }, distinct: ["roleName"] })
    expect(d.eventQuestion.create.mock.calls[0][0].data).toMatchObject({ roleName: "Cuisine" })
    expect(logEvent.mock.calls[0][0].changes).toMatchObject({ roleName: { from: null, to: "Cuisine" } })

    const refused = await POST(json("POST", { label: "Repas ?", type: "yesno", roleName: "Accueil" }), params)
    expect(refused.status).toBe(400)
    expect(await refused.json()).toEqual({ error: "Ce poste n'existe pas dans cet événement : choisissez-en un dans la liste.", field: "roleName" })
    expect(d.eventQuestion.create).toHaveBeenCalledTimes(1)
  })

  it("no poste, or an empty one, is none: no shift read", async () => {
    const d = db()
    guard.mockResolvedValue({ db: d, session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/questions/route")
    expect((await POST(json("POST", { label: "Repas ?", type: "yesno", roleName: "" }), params)).status).toBe(201)
    expect(d.eventQuestion.create.mock.calls[0][0].data.roleName).toBeNull()
    expect(d.shift.findMany).not.toHaveBeenCalled()
  })

  it("an edit keeps a poste no shift carries any more, changes or clears it, and logs the change", async () => {
    const d = db({
      findFirst: vi.fn().mockResolvedValue({ ...q, roleName: "Ancien", answers: [] }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...q, roleName: "Ancien", ...data })),
    })
    guard.mockResolvedValue({ db: d, session: {} })
    const { PATCH } = await import("@/app/api/admin/events/[id]/questions/[questionId]/route")
    const body = { label: "Taille", type: "single", options: ["S", "M"] }
    // Unchanged: accepted without reading the postes, nothing logged about it.
    expect((await PATCH(json("PATCH", { ...body, roleName: "Ancien" }), params)).status).toBe(200)
    expect(d.shift.findMany).not.toHaveBeenCalled()
    expect(logEvent.mock.calls[0][0].changes.roleName).toBeUndefined()
    // Absent: kept as it is.
    await PATCH(json("PATCH", body), params)
    expect(d.eventQuestion.update.mock.calls[1][0].data).not.toHaveProperty("roleName")
    // To another of the event's postes, then to none.
    expect((await PATCH(json("PATCH", { ...body, roleName: "Bar" }), params)).status).toBe(200)
    expect(logEvent.mock.calls[2][0].changes.roleName).toEqual({ from: "Ancien", to: "Bar" })
    expect((await PATCH(json("PATCH", { ...body, roleName: null }), params)).status).toBe(200)
    expect(d.eventQuestion.update.mock.calls[3][0].data.roleName).toBeNull()
    // A poste the event doesn't have: refused, not written.
    const refused = await PATCH(json("PATCH", { ...body, roleName: "Accueil" }), params)
    expect(refused.status).toBe(400)
    expect((await refused.json()).field).toBe("roleName")
    expect(d.eventQuestion.update).toHaveBeenCalledTimes(4)
  })

  it("creates a number question with its bounds, 0 as default minimum, refuses crossed bounds (#1015)", async () => {
    const d = db({ create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...q, ...data })) })
    guard.mockResolvedValue({ db: d, session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/questions/route")
    const ok = await POST(json("POST", { label: "Combien ?", type: "number", maxValue: 6 }), params)
    expect(ok.status).toBe(201)
    expect(d.eventQuestion.create.mock.calls[0][0].data).toMatchObject({ type: "number", options: [], minValue: 0, maxValue: 6 })
    expect(d.eventQuestion.create.mock.calls[0][0].select).toMatchObject({ minValue: true, maxValue: true })
    const crossed = await POST(json("POST", { label: "Combien ?", type: "number", minValue: 5, maxValue: 2 }), params)
    expect(crossed.status).toBe(400)
    expect((await crossed.json()).error).toBe("Le maximum doit être au moins égal au minimum.")
    expect((await POST(json("POST", { label: "Combien ?", type: "number", minValue: -1 }), params)).status).toBe(400)
  })

  it("bounds of an answered number question can widen, never leave out an answer given (#1015)", async () => {
    const n = { ...q, type: "number", options: [], minValue: 0, maxValue: 10, answers: [{ values: ["2"] }, { values: ["7"] }] }
    const d = db({ findFirst: vi.fn().mockResolvedValue(n) })
    guard.mockResolvedValue({ db: d, session: {} })
    const { PATCH } = await import("@/app/api/admin/events/[id]/questions/[questionId]/route")
    const tooLow = await PATCH(json("PATCH", { label: "Combien ?", type: "number", minValue: 0, maxValue: 5 }), params)
    expect(tooLow.status).toBe(409)
    expect((await tooLow.json()).error).toBe("Un bénévole a répondu 7 : le maximum ne peut pas être inférieur à 7.")
    expect((await PATCH(json("PATCH", { label: "Combien ?", type: "number", minValue: 3 }), params)).status).toBe(409)
    expect((await PATCH(json("PATCH", { label: "Combien ?", type: "number", minValue: 1, maxValue: 20 }), params)).status).toBe(200)
    expect(d.eventQuestion.update.mock.calls[0][0].data).toMatchObject({ minValue: 1, maxValue: 20 })
  })

  it("asks a question to some postes of this event only, at least one, logged (#1140)", async () => {
    const d = db({ create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...q, ...data })) })
    guard.mockResolvedValue({ db: d, session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/questions/route")
    const ok = await POST(json("POST", { label: "Caisse ?", type: "yesno", displayScope: "roles", displayRoleNames: ["Bar", "Bar"] }), params)
    expect(ok.status).toBe(201)
    expect(d.eventQuestion.create.mock.calls[0][0].data).toMatchObject({ displayScope: "roles", displayRoleNames: ["Bar"] })
    expect(logEvent.mock.calls[0][0].changes.displayScope).toEqual({ from: null, to: "Bar" })
    const other = await POST(json("POST", { label: "X", type: "text", displayScope: "roles", displayRoleNames: ["Parking d'un autre événement"] }), params)
    expect(other.status).toBe(400)
    expect((await other.json()).field).toBe("displayScope")
    expect((await POST(json("POST", { label: "X", type: "text", displayScope: "roles", displayRoleNames: [] }), params)).status).toBe(400)
    expect(d.eventQuestion.create).toHaveBeenCalledTimes(1)
  })

  it("a follow-up stores no scope of its own (it follows its parent's); detached, it keeps its former parent's (#1140)", async () => {
    const active = [{ id: "meal", label: "Repas ?", type: "yesno", options: [], parentId: null, showIfValues: [], position: 0, displayScope: "roles", displayRoleNames: ["Cuisine"] }]
    const followUp = { ...q, id: "q1", type: "number", options: [], parentId: "meal", showIfValues: ["Oui"], displayScope: "event", displayRoleNames: [], parent: { displayScope: "roles", displayRoleNames: ["Cuisine"] }, answers: [], followUps: [] }
    const d = db({ findMany: vi.fn().mockResolvedValue(active), findFirst: vi.fn().mockResolvedValue(followUp), update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...followUp, ...data })) })
    guard.mockResolvedValue({ db: d, session: {} })
    const { PATCH } = await import("@/app/api/admin/events/[id]/questions/[questionId]/route")
    await PATCH(json("PATCH", { label: "Combien ?", type: "number", parentId: "meal", showIfValues: ["Oui"], displayScope: "roles", displayRoleNames: ["Bar"] }), params)
    expect(d.eventQuestion.update.mock.calls[0][0].data).toMatchObject({ displayScope: "event", displayRoleNames: [] })
    await PATCH(json("PATCH", { label: "Combien ?", type: "number", parentId: null }), params)
    expect(d.eventQuestion.update.mock.calls[1][0].data).toMatchObject({ parentId: null, displayScope: "roles", displayRoleNames: ["Cuisine"] })
  })

  it("an edit keeps a scope whose postes are all gone, asked to nobody, but can't empty a live one (#1140)", async () => {
    const nobody = { ...q, displayScope: "roles", displayRoleNames: [], parentId: null, answers: [], followUps: [] }
    guard.mockResolvedValue({ db: db({ findFirst: vi.fn().mockResolvedValue(nobody) }), session: {} })
    const { PATCH } = await import("@/app/api/admin/events/[id]/questions/[questionId]/route")
    expect((await PATCH(json("PATCH", { label: "Taille", type: "single", options: ["S", "M"], displayScope: "roles", displayRoleNames: [] }), params)).status).toBe(200)
    guard.mockResolvedValue({ db: db({ findFirst: vi.fn().mockResolvedValue({ ...nobody, displayRoleNames: ["Bar"] }) }), session: {} })
    expect((await PATCH(json("PATCH", { label: "Taille", type: "single", options: ["S", "M"], displayScope: "roles", displayRoleNames: [] }), params)).status).toBe(400)
  })

  it("reorders only with the full current list", async () => {
    const d = db()
    guard.mockResolvedValue({ db: d, session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/questions/reorder/route")
    expect((await POST(json("POST", { ids: ["q2", "q1"] }), params)).status).toBe(200)
    expect(d.eventQuestion.update).toHaveBeenCalledTimes(2)
    expect((await POST(json("POST", { ids: ["q2"] }), params)).status).toBe(409)
  })
})
