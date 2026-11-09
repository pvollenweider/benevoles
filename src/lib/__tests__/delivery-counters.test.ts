import { describe, it, expect } from "vitest"
import {
  addDeliveryCount,
  cancelReasonClass,
  deliveryDay,
  deliveryOutcome,
  PLATFORM_ORGANIZATION_KEY,
  type DeliveryCountBucket,
} from "../delivery-counters"

// #1269: the classes kept for a cancelled email, and the buckets the purge folds rows into.
describe("cancelReasonClass", () => {
  it("keeps a sending limit code as it is", () => {
    expect(cancelReasonClass("limit:recipient_per_hour")).toBe("limit:recipient_per_hour")
    expect(cancelReasonClass("limit:org_per_day")).toBe("limit:org_per_day")
    expect(cancelReasonClass("limit:signup_per_hour")).toBe("limit:signup_per_hour")
  })

  it("keeps the known cancellation codes", () => {
    for (const code of [
      "org_inactive", "org_pending", "member_address_changed", "member_deleted", "merged_member",
      "personal_link_revoked", "account_link_revoked", "leader_link_revoked", "availability_link_revoked",
    ]) expect(cancelReasonClass(code)).toBe(code)
  })

  it("turns the outbox's fixed sentences into a code, never the sentence", () => {
    expect(cancelReasonClass("Plus aucune inscription à annoncer.")).toBe("nothing_left")
    expect(cancelReasonClass("Vérification d'inactivité arrêtée : message annulé.")).toBe("inactivity_stopped")
    expect(cancelReasonClass("Plus organisateur à cette adresse : message de la vérification d'inactivité annulé.")).toBe("inactivity_no_admin")
  })

  it("never stores raw text: anything unrecognized is `other`, a missing reason `unknown`", () => {
    expect(cancelReasonClass("SMTP 550 5.1.1 mailbox unavailable for jane@example.org")).toBe("other")
    expect(cancelReasonClass("limit:Recipient Per Hour")).toBe("other")
    expect(cancelReasonClass("limit:recipient_per_hour extra")).toBe("other")
    expect(cancelReasonClass(null)).toBe("unknown")
    expect(cancelReasonClass("   ")).toBe("unknown")
  })
})

describe("delivery buckets", () => {
  const bucket = (over: Partial<DeliveryCountBucket> = {}): DeliveryCountBucket => ({
    organizationId: "org-a", organizationKey: "org-a", day: new Date("2026-11-08T00:00:00Z"),
    kind: "registration_confirmation", outcome: "sent", reason: "", count: 1, ...over,
  })
  const row = (over: Partial<{ status: string; lastError: string | null; createdAt: Date; organizationId: string | null; kind: string }> = {}) => ({
    status: "sent", lastError: null, createdAt: new Date("2026-11-08T21:16:00Z"), organizationId: "org-a", kind: "registration_confirmation", ...over,
  })

  it("groups by the UTC day the email was queued, not by its local day", () => {
    // 00:30 on 9 November in Zurich is still 8 November in UTC.
    expect(deliveryDay(new Date("2026-11-08T23:30:00Z")).toISOString()).toBe("2026-11-08T00:00:00.000Z")
    expect(deliveryDay(new Date("2026-11-09T00:30:00+01:00")).toISOString()).toBe("2026-11-08T00:00:00.000Z")
    expect(deliveryDay(new Date("2026-11-09T00:00:00Z")).toISOString()).toBe("2026-11-09T00:00:00.000Z")
  })

  it("maps only the statuses the purge selects", () => {
    expect(deliveryOutcome("sent")).toBe("sent")
    expect(deliveryOutcome("failed")).toBe("failed")
    expect(deliveryOutcome("cancelled")).toBe("cancelled")
    expect(deliveryOutcome("pending")).toBeNull()
    expect(deliveryOutcome("sending")).toBeNull()
  })

  it("adds one to the same bucket, and keeps the reason only for a cancelled email", () => {
    const buckets = new Map<string, DeliveryCountBucket>()
    expect(addDeliveryCount(buckets, row())).toBe(true)
    addDeliveryCount(buckets, row({ createdAt: new Date("2026-11-08T21:17:00Z") }))
    addDeliveryCount(buckets, row({ status: "cancelled", lastError: "limit:recipient_per_hour" }))
    expect([...buckets.values()]).toEqual([
      bucket({ count: 2 }),
      bucket({ outcome: "cancelled", reason: "limit:recipient_per_hour", count: 1 }),
    ])
    addDeliveryCount(buckets, row({ status: "pending" }))
    expect(buckets.size).toBe(2)
  })

  it("keys emails without organisation under `platform`, so NULL never creates a second row", () => {
    const buckets = new Map<string, DeliveryCountBucket>()
    addDeliveryCount(buckets, row({ organizationId: null }))
    addDeliveryCount(buckets, row({ organizationId: null, createdAt: new Date("2026-11-08T22:00:00Z") }))
    expect([...buckets.values()]).toEqual([bucket({ organizationId: null, organizationKey: PLATFORM_ORGANIZATION_KEY, count: 2 })])
  })

  it("counts an unreadable payload under `unknown`", () => {
    const buckets = new Map<string, DeliveryCountBucket>()
    addDeliveryCount(buckets, row({ kind: "unknown" }))
    expect([...buckets.values()]).toEqual([bucket({ kind: "unknown" })])
  })
})
