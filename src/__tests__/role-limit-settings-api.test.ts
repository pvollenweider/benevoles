import { describe, it, expect, vi } from "vitest"

// Setting the limit of shifts per volunteer on a role (#466): applied to all its shifts, logged.
const { updateMany, logEvent, db } = vi.hoisted(() => {
  const updateMany = vi.fn().mockResolvedValue({ count: 2 })
  const logEvent = vi.fn()
  const db = {
  event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-1" }) },
  shift: {
    findMany: vi.fn().mockResolvedValue([
      { id: "s1", colorKey: null, capacity: 5, status: "open", maxPerVolunteer: null, reservedTags: [], _count: { registrations: 0 } },
      { id: "s2", colorKey: null, capacity: 5, status: "open", maxPerVolunteer: null, reservedTags: [], _count: { registrations: 0 } },
    ]),
    updateMany,
  },
  eventQuestion: { findMany: vi.fn().mockResolvedValue([]) },
  }
  return { updateMany, logEvent, db }
})
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/shift-cancel", () => ({ cancelShift: vi.fn() }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => ({ db, organizationId: "org-a", session: { user: { id: "adm" } } }) }))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm" }) }))

const patch = (body: unknown) => new Request("http://localhost/api/admin/events/evt-1/roles/Loge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "evt-1", roleName: "Loge" }) }

describe("PATCH /api/admin/events/[id]/roles/[roleName] — maxPerVolunteer", () => {
  it("sets the limit on every shift of the role and logs each change", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await PATCH(patch({ maxPerVolunteer: 2 }), params)
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith({ where: { eventId: "evt-1", roleName: "Loge", event: { organizationId: "org-a" } }, data: { maxPerVolunteer: 2 } })
    expect(logEvent).toHaveBeenCalledTimes(2)
    expect(logEvent.mock.calls[0][0].changes).toEqual({ maxPerVolunteer: { from: null, to: 2 } })
  })

  it("removes it with null and refuses nonsense", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(patch({ maxPerVolunteer: null }), params)).status).toBe(200)
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { maxPerVolunteer: null } }))
    expect((await PATCH(patch({ maxPerVolunteer: 0 }), params)).status).toBe(400)
    expect((await PATCH(patch({ maxPerVolunteer: 1.5 }), params)).status).toBe(400)
  })

  it("reserves the role to members with a tag (#470), cleaning the list, and reopens it with []", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(patch({ reservedTags: [" sécurité", "Sécurité", "secouriste"] }), params)).status).toBe(200)
    expect(updateMany).toHaveBeenLastCalledWith({ where: { eventId: "evt-1", roleName: "Loge", event: { organizationId: "org-a" } }, data: { reservedTags: ["sécurité", "secouriste"] } })
    expect((await PATCH(patch({ reservedTags: [] }), params)).status).toBe(200)
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { reservedTags: [] } }))
    expect((await PATCH(patch({ reservedTags: ["x".repeat(41)] }), params)).status).toBe(400)
  })
  it("sets an answer condition (#962) from a choice question asked to everyone, and clears it", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    db.eventQuestion.findMany.mockResolvedValue([
      { id: "q1", label: "Permis de conduire", type: "yesno", options: [], parentId: null, displayScope: "event" },
      { id: "q2", label: "Véhicules", type: "multiple", options: ["Voiture", "Vélo"], parentId: null, displayScope: "event" },
    ])
    expect((await PATCH(patch({ reservedQuestionId: "q1", reservedAnswers: ["Oui"] }), params)).status).toBe(200)
    expect(updateMany).toHaveBeenLastCalledWith({ where: { eventId: "evt-1", roleName: "Loge", event: { organizationId: "org-a" } }, data: { reservedQuestionId: "q1", reservedAnswers: ["Oui"] } })
    expect((await PATCH(patch({ reservedQuestionId: "q2", reservedAnswers: ["Voiture", "Vélo"] }), params)).status).toBe(200)
    expect((await PATCH(patch({ reservedQuestionId: null, reservedAnswers: [] }), params)).status).toBe(200)
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { reservedQuestionId: null, reservedAnswers: [] } }))
  })

  it("refuses a free-text, scoped or follow-up question, a missing or unknown answer (#962)", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    db.eventQuestion.findMany.mockResolvedValue([
      { id: "q-text", label: "Texte", type: "text", options: [], parentId: null, displayScope: "event" },
      { id: "q-roles", label: "Certains postes", type: "single", options: ["A"], parentId: null, displayScope: "roles" },
      { id: "q-suivi", label: "Suivi", type: "single", options: ["A"], parentId: "q1", displayScope: "event" },
      { id: "q1", label: "Permis de conduire", type: "yesno", options: [], parentId: null, displayScope: "event" },
      { id: "q2", label: "Véhicules", type: "multiple", options: ["Voiture", "Vélo"], parentId: null, displayScope: "event" },
    ])
    for (const body of [
      { reservedQuestionId: "q-text", reservedAnswers: ["Oui"] },
      { reservedQuestionId: "q-roles", reservedAnswers: ["A"] },
      { reservedQuestionId: "q-suivi", reservedAnswers: ["A"] },
      { reservedQuestionId: "q1", reservedAnswers: [] },
      { reservedQuestionId: "q2", reservedAnswers: ["Bateau"] },
      { reservedQuestionId: "unknown", reservedAnswers: ["Oui"] },
      { reservedQuestionId: "q1" },
    ]) expect((await PATCH(patch(body), params)).status).toBe(400)
    expect(db.eventQuestion.findMany).toHaveBeenCalled()
  })

  it("makes the role assigned by the organisation only (#1145) on every shift, logs it, and undoes it", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    logEvent.mockClear()
    expect((await PATCH(patch({ assignedOnly: true }), params)).status).toBe(200)
    expect(updateMany).toHaveBeenLastCalledWith({ where: { eventId: "evt-1", roleName: "Loge", event: { organizationId: "org-a" } }, data: { assignedOnly: true } })
    expect(logEvent.mock.calls.map((c) => c[0].changes)).toEqual([{ assignedOnly: { from: undefined, to: true } }, { assignedOnly: { from: undefined, to: true } }])
    expect((await PATCH(patch({ assignedOnly: false, reservedTags: [] }), params)).status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { assignedOnly: false } }))
    expect((await PATCH(patch({ assignedOnly: "oui" }), params)).status).toBe(400)
    // A day narrows places, minimum and label only: never the role's access.
    expect((await PATCH(patch({ assignedOnly: true, date: "2030-06-01" }), params)).status).toBe(400)
  })
})
