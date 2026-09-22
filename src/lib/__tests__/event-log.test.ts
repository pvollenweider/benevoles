import { describe, it, expect, vi, beforeEach } from "vitest"

const create = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({ prisma: { eventLog: { create } } }))

import { logEvent, diffFields, SYSTEM_ACTOR, adminActor } from "../event-log"

describe("logEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("writes an admin action with the given actor and entity, without storing a display name", async () => {
    create.mockResolvedValue({ id: "log-1" })
    const id = await logEvent({
      eventId: "evt-1",
      actor: { type: "admin", id: "admin-1" },
      action: "shift.created",
      entityType: "Shift",
      entityId: "shift-1",
    })
    expect(id).toBe("log-1")
    const data = create.mock.calls[0][0].data
    expect(data).toMatchObject({
      eventId: "evt-1",
      actorType: "admin",
      actorId: "admin-1",
      action: "shift.created",
      entityType: "Shift",
      entityId: "shift-1",
      causedByLogId: null,
    })
    expect(data).not.toHaveProperty("actorLabel")
  })

  it("defaults createdAt to now (lets the database default apply) when not given", async () => {
    create.mockResolvedValue({ id: "log-now" })
    await logEvent({
      eventId: "evt-1",
      actor: { type: "admin", id: "a" },
      action: "shift.created",
      entityType: "Shift",
      entityId: "s",
    })
    expect(create.mock.calls[0][0].data).not.toHaveProperty("createdAt")
  })

  it("overrides createdAt when given (baseline entries backdated to the entity's real creation date)", async () => {
    create.mockResolvedValue({ id: "log-backdated" })
    const backdated = new Date("2026-01-01T00:00:00.000Z")
    await logEvent({
      eventId: "evt-1",
      actor: { type: "system" },
      action: "shift.baseline",
      entityType: "Shift",
      entityId: "s",
      createdAt: backdated,
    })
    expect(create.mock.calls[0][0].data.createdAt).toEqual(backdated)
  })

  it("stores a null actorId for a volunteer action with no known volunteer record yet", async () => {
    create.mockResolvedValue({ id: "log-2" })
    await logEvent({
      eventId: "evt-1",
      actor: { type: "volunteer" },
      action: "registration.cancelled",
      entityType: "Registration",
      entityId: "reg-1",
    })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorType: "volunteer", actorId: null }) }),
    )
  })

  it("passes causedByLogId through so a chain of related entries can be followed", async () => {
    create.mockResolvedValue({ id: "log-3" })
    await logEvent({
      eventId: "evt-1",
      actor: { type: "volunteer", id: "vol-1" },
      action: "registration.waitlist_offered",
      entityType: "Registration",
      entityId: "reg-2",
      causedByLogId: "log-1",
    })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ causedByLogId: "log-1" }) }),
    )
  })

  it("labels a system-triggered action distinctly from admin/volunteer", async () => {
    create.mockResolvedValue({ id: "log-4" })
    await logEvent({
      eventId: "evt-1",
      actor: SYSTEM_ACTOR,
      action: "registration.waitlist_offered",
      entityType: "Registration",
      entityId: "reg-3",
    })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorType: "system", actorId: null }) }),
    )
  })

  it("never throws: a logging failure is swallowed and returns null", async () => {
    create.mockRejectedValue(new Error("db down"))
    const id = await logEvent({
      eventId: "evt-1",
      actor: { type: "admin", id: "a" },
      action: "shift.created",
      entityType: "Shift",
      entityId: "s",
    })
    expect(id).toBeNull()
  })
})

describe("adminActor", () => {
  it("reads the admin id off the session, with no name/label attached", () => {
    expect(adminActor({ user: { id: "admin-9" } })).toEqual({ type: "admin", id: "admin-9" })
  })

  it("falls back to an empty id when the session has none", () => {
    expect(adminActor({ user: {} })).toEqual({ type: "admin", id: "" })
  })
})

describe("diffFields", () => {
  it("keeps only fields that actually changed, among the ones listed", () => {
    const before = { capacity: 3, status: "open", label: "Accueil" }
    const after = { capacity: 4, status: "open", label: "Accueil" }
    expect(diffFields(before, after, ["capacity", "status", "label"])).toEqual({
      capacity: { from: 3, to: 4 },
    })
  })

  it("returns undefined when nothing in the given fields changed", () => {
    const before = { capacity: 3 }
    const after = { capacity: 3 }
    expect(diffFields(before, after, ["capacity"])).toBeUndefined()
  })

  it("compares Date fields by value, not by reference", () => {
    const before = { date: new Date("2026-09-20T00:00:00.000Z") }
    const after = { date: new Date("2026-09-20T00:00:00.000Z") }
    expect(diffFields(before, after, ["date"])).toBeUndefined()
  })

  it("serializes changed Date fields to ISO strings", () => {
    const before = { date: new Date("2026-09-20T00:00:00.000Z") }
    const after = { date: new Date("2026-09-21T00:00:00.000Z") }
    expect(diffFields(before, after, ["date"])).toEqual({
      date: { from: "2026-09-20T00:00:00.000Z", to: "2026-09-21T00:00:00.000Z" },
    })
  })
})
