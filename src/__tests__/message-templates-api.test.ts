import { describe, it, expect, vi, beforeEach } from "vitest"

// Message templates (#482): CRUD within the organisation, limit, log.
const guard = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: guard }))
const logOrgEvent = vi.hoisted(() => vi.fn())
vi.mock("@/lib/org-log", () => ({ logOrgEvent, adminActor: () => ({ type: "admin", id: "adm" }) }))

const tpl = { id: "t1", name: "Merci", subject: "Merci !", body: "Merci {prénom}", updatedAt: new Date() }
const db = (over: Record<string, unknown> = {}) => ({
  messageTemplate: {
    findMany: vi.fn().mockResolvedValue([tpl]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(tpl),
    findFirst: vi.fn().mockResolvedValue({ id: "t1" }),
    update: vi.fn().mockResolvedValue(tpl),
    delete: vi.fn().mockResolvedValue(tpl),
    ...over,
  },
})
const json = (method: string, body?: unknown) => new Request("http://localhost/x", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
const params = { params: Promise.resolve({ id: "t1" }) }

describe("message templates API", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a template for the caller's organisation and logs it", async () => {
    const d = db()
    guard.mockResolvedValue({ db: d, organizationId: "org-a", session: {} })
    const { POST } = await import("@/app/api/admin/settings/message-templates/route")
    const res = await POST(json("POST", { name: " Merci ", subject: "Merci !", body: "Merci {prénom}" }))
    expect(res.status).toBe(201)
    expect(d.messageTemplate.create.mock.calls[0][0].data).toEqual({ organizationId: "org-a", name: "Merci", subject: "Merci !", body: "Merci {prénom}" })
    expect(logOrgEvent.mock.calls[0][0]).toMatchObject({ action: "template.created", entityType: "MessageTemplate" })
  })

  it("refuses an empty field and more than the limit", async () => {
    guard.mockResolvedValue({ db: db({ count: vi.fn().mockResolvedValue(20) }), organizationId: "org-a", session: {} })
    const { POST } = await import("@/app/api/admin/settings/message-templates/route")
    expect((await POST(json("POST", { name: "", subject: "x", body: "y" }))).status).toBe(400)
    expect((await POST(json("POST", { name: "A", subject: "x", body: "y" }))).status).toBe(409)
  })

  it("answers 404 for another organisation's template, changing nothing (scoped client)", async () => {
    const d = db({ findFirst: vi.fn().mockResolvedValue(null) })
    guard.mockResolvedValue({ db: d, organizationId: "org-a", session: {} })
    const { PATCH, DELETE } = await import("@/app/api/admin/settings/message-templates/[id]/route")
    expect((await PATCH(json("PATCH", { name: "A", subject: "x", body: "y" }), params)).status).toBe(404)
    expect((await DELETE(json("DELETE"), params)).status).toBe(404)
    expect(d.messageTemplate.update).not.toHaveBeenCalled()
    expect(d.messageTemplate.delete).not.toHaveBeenCalled()
  })

  it("updates and deletes its own template", async () => {
    const d = db()
    guard.mockResolvedValue({ db: d, organizationId: "org-a", session: {} })
    const { PATCH, DELETE } = await import("@/app/api/admin/settings/message-templates/[id]/route")
    expect((await PATCH(json("PATCH", { name: "A", subject: "x", body: "y" }), params)).status).toBe(200)
    expect((await DELETE(json("DELETE"), params)).status).toBe(200)
    expect(logOrgEvent.mock.calls.map((c) => c[0].action)).toEqual(["template.updated", "template.deleted"])
  })
})
