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
    expect(await (await DELETE(json("DELETE"), params)).json()).toEqual({ archived: true })
    expect(answered.eventQuestion.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date)
    expect(answered.eventQuestion.delete).not.toHaveBeenCalled()
    const empty = db()
    guard.mockResolvedValue({ db: empty, session: {} })
    expect(await (await DELETE(json("DELETE"), params)).json()).toEqual({ archived: false })
    expect(empty.eventQuestion.delete).toHaveBeenCalled()
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

  it("reorders only with the full current list", async () => {
    const d = db()
    guard.mockResolvedValue({ db: d, session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/questions/reorder/route")
    expect((await POST(json("POST", { ids: ["q2", "q1"] }), params)).status).toBe(200)
    expect(d.eventQuestion.update).toHaveBeenCalledTimes(2)
    expect((await POST(json("POST", { ids: ["q2"] }), params)).status).toBe(409)
  })
})
