import { describe, it, expect, vi } from "vitest"

/**
 * #1191: which sign-ups join the grouped confirmation, and which grouped rows the delivery
 * resolves. The queue and the delivery run on Postgres in
 * src/__integration__/added-shifts-confirmation.int.test.ts.
 */

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { groupsConfirmation, isAddedShiftsConfirmation, queueAddedShiftsConfirmation } from "../added-shifts-confirmation"
import { openPayload } from "../outbox"

describe("groupsConfirmation", () => {
  it("confirms a first sign-up at once", () => {
    expect(groupsConfirmation([])).toBe(false)
  })

  it.each(["active", "requested"])("groups once the volunteer holds a %s registration (its email carried the link)", (status) => {
    expect(groupsConfirmation([{ status }])).toBe(true)
  })

  it.each(["waiting", "offered"])("does not group after a %s entry only: its email has no personal link", (status) => {
    expect(groupsConfirmation([{ status }])).toBe(false)
  })
})

describe("isAddedShiftsConfirmation", () => {
  const recipient = { email: "a@x.org" }
  it("recognises only the grouped rows, never an ordinary or older confirmation", () => {
    expect(isAddedShiftsConfirmation({ kind: "registration_confirmation", recipient, data: { addedShifts: true, registrationIds: ["r1"] } })).toBe(true)
    expect(isAddedShiftsConfirmation({ kind: "registration_confirmation", recipient, data: { shifts: [], editToken: "t" } })).toBe(false)
    expect(isAddedShiftsConfirmation({ kind: "registration_added_by_organizer", recipient, data: { addedShifts: true } })).toBe(false)
  })
})

describe("queueAddedShiftsConfirmation", () => {
  const data = { volunteerName: "Ana Rossi", eventTitle: "Fête", orgSlug: "village", eventId: "ev1" }
  const base = { volunteerId: "v1", organizationId: "org1", recipient: { email: "ana@example.org", name: "Ana Rossi" }, data, now: new Date("2026-07-01T10:00:00Z"), delayMs: 300_000 }

  function tx(pending: { id: string; payload: unknown } | null, updated = 1) {
    return {
      notificationOutbox: {
        findFirst: vi.fn().mockResolvedValue(pending),
        updateMany: vi.fn().mockResolvedValue({ count: updated }),
        create: vi.fn().mockResolvedValue({ id: "new-row" }),
      },
    }
  }

  it("starts a row keyed per volunteer and event, sent after the delay", async () => {
    const t = tx(null)
    expect(await queueAddedShiftsConfirmation(t as never, { ...base, registrationIds: ["r2"] })).toBeNull()
    const created = t.notificationOutbox.create.mock.calls[0][0].data
    expect(created.dedupeKey).toBe("registration_confirmation:added:ev1:v1:r2")
    expect(created.nextAttemptAt).toEqual(new Date("2026-07-01T10:05:00Z"))
    expect(openPayload(created.payload)).toMatchObject({ kind: "registration_confirmation", volunteerId: "v1", data: { addedShifts: true, registrationIds: ["r2"] } })
  })

  it("joins the pending row, once per registration, and pushes it back", async () => {
    const t = tx(null)
    await queueAddedShiftsConfirmation(t as never, { ...base, registrationIds: ["r2"] })
    const pending = { id: "row-1", payload: t.notificationOutbox.create.mock.calls[0][0].data.payload }
    const t2 = tx(pending)
    await queueAddedShiftsConfirmation(t2 as never, { ...base, registrationIds: ["r2", "r3"], now: new Date("2026-07-01T10:02:00Z") })
    const update = t2.notificationOutbox.updateMany.mock.calls[0][0]
    expect(update.where).toEqual({ id: "row-1", status: "pending", attempts: 0 })
    expect(update.data.nextAttemptAt).toEqual(new Date("2026-07-01T10:07:00Z"))
    expect((openPayload(update.data.payload).data as { registrationIds: string[] }).registrationIds).toEqual(["r2", "r3"])
    expect(t2.notificationOutbox.create).not.toHaveBeenCalled()
  })

  it("starts its own row when a delivery claimed the pending one meanwhile", async () => {
    const t = tx(null)
    await queueAddedShiftsConfirmation(t as never, { ...base, registrationIds: ["r2"] })
    const t2 = tx({ id: "row-1", payload: t.notificationOutbox.create.mock.calls[0][0].data.payload }, 0)
    await queueAddedShiftsConfirmation(t2 as never, { ...base, registrationIds: ["r3"] })
    expect(t2.notificationOutbox.create).toHaveBeenCalledTimes(1)
    expect((openPayload(t2.notificationOutbox.create.mock.calls[0][0].data.payload).data as { registrationIds: string[] }).registrationIds).toEqual(["r3"])
  })

  it("returns the row to deliver at once without a delay", async () => {
    expect(await queueAddedShiftsConfirmation(tx(null) as never, { ...base, delayMs: 0, registrationIds: ["r2"] })).toBe("new-row")
  })
})
