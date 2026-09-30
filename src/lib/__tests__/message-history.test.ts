import { describe, it, expect } from "vitest"
import { countsToFreeze, deliveryLabel, deliveryOf } from "../message-history"

// Communications history (#467): delivery survives the outbox purge.
describe("deliveryOf", () => {
  it("adds the frozen counters to the rows still in the outbox", () => {
    expect(deliveryOf({ sentCount: 10, failedCount: 1 }, [{ status: "sent" }, { status: "failed" }, { status: "pending" }, { status: "sending" }]))
      .toEqual({ sent: 11, failed: 2, pending: 2 })
    expect(deliveryOf({ sentCount: 0, failedCount: 0 }, [])).toEqual({ sent: 0, failed: 0, pending: 0 })
  })

  it("gives the same totals before and after the cleanup moves rows into the counters", () => {
    const rows = [
      { targetedMessageId: "m1", status: "sent" }, { targetedMessageId: "m1", status: "sent" },
      { targetedMessageId: "m1", status: "failed" }, { targetedMessageId: "m1", status: "pending" },
    ]
    const before = deliveryOf({ sentCount: 0, failedCount: 0 }, rows)
    const frozen = countsToFreeze(rows.filter((r) => r.status !== "pending")).get("m1")!
    const after = deliveryOf({ sentCount: frozen.sent, failedCount: frozen.failed }, rows.filter((r) => r.status === "pending"))
    expect(after).toEqual(before)
  })
})

describe("countsToFreeze", () => {
  it("counts sent and failed rows per message, ignoring other notifications", () => {
    const map = countsToFreeze([
      { targetedMessageId: "m1", status: "sent" }, { targetedMessageId: "m1", status: "failed" },
      { targetedMessageId: "m2", status: "sent" }, { targetedMessageId: null, status: "sent" },
      { targetedMessageId: "m2", status: "pending" },
    ])
    expect(Object.fromEntries(map)).toEqual({ m1: { sent: 1, failed: 1 }, m2: { sent: 1, failed: 0 } })
  })
})

describe("deliveryLabel", () => {
  it("says it in words, leaving out zeros", () => {
    expect(deliveryLabel({ sent: 12, failed: 1, pending: 2 })).toBe("12 envoyés, 1 en échec, 2 en attente")
    expect(deliveryLabel({ sent: 1, failed: 0, pending: 0 })).toBe("1 envoyé")
    expect(deliveryLabel({ sent: 0, failed: 0, pending: 0 })).toBe("Aucun envoi")
  })
})
