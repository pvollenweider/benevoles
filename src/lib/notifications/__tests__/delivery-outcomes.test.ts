import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ create: vi.fn(), reported: [] as { context: string; error: unknown }[] }))
vi.mock("../../prisma", () => ({ prisma: { deliveryOutcome: { create: m.create } } }))
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))
vi.mock("../../report-error", () => ({ reportError: (context: string) => (error: unknown) => { m.reported.push({ context, error }) } }))

import { recordDeliveryOutcome, recordDeliveryOutcomes } from "../delivery-outcomes"

const create = m.create
const reported = m.reported

const ctx = { kind: "registration_confirmation", organizationId: "org-1", volunteerId: "vol-1", outboxId: "out-1" }
const outcome = { recipient: "jane.doe@example.org", outcome: "rejected_permanent" as const, reason: "mailbox_unknown" as const, responseCode: 550, enhancedStatus: "5.1.1" }

describe("recordDeliveryOutcome", () => {
  beforeEach(() => {
    create.mockReset().mockResolvedValue({ id: "do-1" })
    reported.length = 0
  })

  it("stores a hash of the address, never the address itself", async () => {
    await recordDeliveryOutcome(ctx, outcome)
    expect(create).toHaveBeenCalledOnce()
    const data = create.mock.calls[0][0].data
    expect(data.addressHash).toBeTypeOf("string")
    expect(data.addressHash).not.toContain("jane.doe")
    expect(JSON.stringify(data)).not.toContain("jane.doe@example.org")
    expect(data).toMatchObject({
      organizationId: "org-1", volunteerId: "vol-1", outboxId: "out-1", kind: "registration_confirmation",
      outcome: "rejected_permanent", reason: "mailbox_unknown", responseCode: 550, enhancedStatus: "5.1.1",
    })
  })

  it("never throws when the write fails, and reports it without PII", async () => {
    create.mockRejectedValue(new Error("db down"))
    await expect(recordDeliveryOutcome(ctx, outcome)).resolves.toBeUndefined()
    expect(reported).toHaveLength(1)
    expect(reported[0].context).toBe("delivery_outcome.record_failed")
    expect(JSON.stringify(reported[0])).not.toContain("jane.doe@example.org")
  })

  it("recordDeliveryOutcomes stores one row per outcome", async () => {
    await recordDeliveryOutcomes(ctx, [outcome, { ...outcome, recipient: "bob@example.org" }])
    expect(create).toHaveBeenCalledTimes(2)
  })

  // Decision (#598): no member is ever involved in a product-update send.
  it("does not record product_update: no member is ever involved", async () => {
    await recordDeliveryOutcome({ ...ctx, kind: "product_update", volunteerId: null }, outcome)
    expect(create).not.toHaveBeenCalled()
  })
})
