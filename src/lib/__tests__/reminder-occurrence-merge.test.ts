import { describe, it, expect } from "vitest"
import { planReminderOccurrenceMerge, type MergeOccurrence } from "../reminder-occurrence-merge"

/** Reminder occurrence keys across a member merge (#1139, #600). */

const base = {
  eventId: "evt-1",
  localDay: "2030-06-01",
  ruleId: "rule-1",
  outboxId: null as string | null,
  sentAt: null as Date | null,
}

const occurrence = (id: string, status: string, over: Partial<MergeOccurrence> = {}): MergeOccurrence => ({ ...base, id, status, ...over })

describe("reminder occurrence merge (#1139)", () => {
  it("moves an absorbed key that the kept record does not have", () => {
    expect(planReminderOccurrenceMerge([], [occurrence("b", "sent", { sentAt: new Date("2030-06-01T06:00:00Z") })])).toEqual({
      reassignIds: ["b"],
      deleteAbsorbIds: [],
      deleteKeepIds: [],
      markSent: [],
      cancelOutboxIds: [],
    })
  })

  it("keeps sent over a queued kept occurrence and cancels its superseded outbox row", () => {
    const plan = planReminderOccurrenceMerge(
      [occurrence("a", "queued", { outboxId: "out-a" })],
      [occurrence("b", "sent", { outboxId: "out-b", sentAt: new Date("2030-06-01T06:00:00Z") })],
    )
    expect(plan).toEqual({
      reassignIds: [],
      deleteAbsorbIds: ["b"],
      deleteKeepIds: [],
      markSent: [{ id: "a", sentAt: new Date("2030-06-01T06:00:00Z"), outboxId: "out-b" }],
      cancelOutboxIds: ["out-a"],
    })
  })

  it("keeps a sent kept occurrence and cancels the absorbed queued row", () => {
    const plan = planReminderOccurrenceMerge(
      [occurrence("a", "sent", { outboxId: "out-a" })],
      [occurrence("b", "queued", { outboxId: "out-b" })],
    )
    expect(plan.deleteAbsorbIds).toEqual(["b"])
    expect(plan.markSent).toEqual([])
    expect(plan.cancelOutboxIds).toEqual(["out-b"])
  })

  it("keeps the kept record's queued row over the absorbed queued row", () => {
    const plan = planReminderOccurrenceMerge(
      [occurrence("a", "queued", { outboxId: "out-a" })],
      [occurrence("b", "queued", { outboxId: "out-b" })],
    )
    expect(plan).toMatchObject({ deleteAbsorbIds: ["b"], deleteKeepIds: [], cancelOutboxIds: ["out-b"] })
  })

  it("makes an absorbed queued row the survivor when the kept record has no queued one", () => {
    const plan = planReminderOccurrenceMerge(
      [occurrence("a", "pending", { outboxId: "out-a" })],
      [occurrence("b", "queued", { outboxId: "out-b" })],
    )
    expect(plan).toMatchObject({ reassignIds: ["b"], deleteKeepIds: ["a"], cancelOutboxIds: ["out-a"] })
  })

  it("keeps the kept row when neither is sent or queued", () => {
    const plan = planReminderOccurrenceMerge(
      [occurrence("a", "pending")],
      [occurrence("b", "cancelled", { outboxId: "out-b" })],
    )
    expect(plan).toMatchObject({ reassignIds: [], deleteAbsorbIds: ["b"], deleteKeepIds: [], cancelOutboxIds: ["out-b"] })
  })

  it("keeps an absorbed failed row over a kept pending one and cancels its outbox row", () => {
    const plan = planReminderOccurrenceMerge(
      [occurrence("a", "pending", { outboxId: "out-a" })],
      [occurrence("b", "failed", { outboxId: "out-b" })],
    )
    expect(plan).toEqual({
      reassignIds: ["b"],
      deleteAbsorbIds: [],
      deleteKeepIds: ["a"],
      markSent: [],
      cancelOutboxIds: ["out-a"],
    })
  })

  it("keeps an absorbed failed row over a kept cancelled one", () => {
    const plan = planReminderOccurrenceMerge(
      [occurrence("a", "cancelled")],
      [occurrence("b", "failed")],
    )
    expect(plan).toMatchObject({ reassignIds: ["b"], deleteAbsorbIds: [], deleteKeepIds: ["a"], cancelOutboxIds: [] })
  })

  it("keeps a kept failed row over an absorbed queued one and cancels the queued outbox row", () => {
    const plan = planReminderOccurrenceMerge(
      [occurrence("a", "failed")],
      [occurrence("b", "queued", { outboxId: "out-b" })],
    )
    expect(plan).toMatchObject({ reassignIds: [], deleteAbsorbIds: ["b"], deleteKeepIds: [], cancelOutboxIds: ["out-b"] })
  })

  it("still lets sent win over failed", () => {
    const sentAt = new Date("2030-06-01T06:00:00Z")
    const plan = planReminderOccurrenceMerge(
      [occurrence("a", "failed")],
      [occurrence("b", "sent", { sentAt })],
    )
    expect(plan.markSent).toEqual([{ id: "a", sentAt, outboxId: null }])
    expect(plan.deleteAbsorbIds).toEqual(["b"])
  })
})
