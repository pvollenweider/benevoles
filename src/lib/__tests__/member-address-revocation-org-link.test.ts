import { describe, it, expect, vi, beforeEach } from "vitest"

// Correcting a member's address renews the organisation-wide link too (#1429): the old inbox must
// lose access, and the new address receives the new link in the same transaction.

const m = vi.hoisted(() => ({ enqueue: vi.fn().mockResolvedValue(["o1"]) }))
vi.mock("../notifications/outbox", () => ({
  enqueueNotifications: m.enqueue,
  openPayload: (p: unknown) => p,
}))
vi.mock("../shift-swap-server", () => ({ endSwapsIn: vi.fn() }))
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))

import { renewMemberLinks } from "../member-address-revocation"
import { hashToken } from "../token-hash"
import type { Tx } from "../registration-capacity"

const now = new Date("2031-05-01T12:00:00Z")

function fakeTx(orgLinkTokenHash: string | null) {
  const calls = {
    volunteerUpdateMany: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    volunteerUpdates: [] as { where: { id: string }; data: Record<string, unknown> }[],
  }
  // The one row: clearing the link is what makes the next update able to write a fresh one.
  let storedHash = orgLinkTokenHash
  const tx = {
    organization: { findUnique: vi.fn(async () => ({ name: "Asso", slug: "asso" })) },
    volunteer: {
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.volunteerUpdateMany.push(args)
        if (!storedHash) return { count: 0 }
        storedHash = null
        return { count: 1 }
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.volunteerUpdates.push(args)
        storedHash = args.data.orgLinkTokenHash as string
        return {}
      }),
    },
    registration: { findMany: vi.fn(async () => []), update: vi.fn(), updateMany: vi.fn() },
    memberInvite: { findMany: vi.fn(async () => []), update: vi.fn(), updateMany: vi.fn() },
    availabilityRequest: { findMany: vi.fn(async () => []), update: vi.fn(), updateMany: vi.fn() },
    pushSubscription: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    notificationOutbox: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) },
  }
  return { tx: tx as unknown as Tx, calls }
}

const volunteer = { id: "v1", firstName: "Léa", lastName: "M", active: true }

describe("renewMemberLinks — organisation-wide link (#1429)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("clears the issued link inside the transaction, re-issues it, and queues the new one to the new address", async () => {
    const { tx, calls } = fakeTx("old-hash")
    const result = await renewMemberLinks(tx, { organizationId: "org-a", volunteer, oldEmail: "old@example.ch", newEmail: "new@example.ch", now })
    expect(result.orgLink).toBe(true)
    // The revocation is one updateMany by volunteer id, not a hash read before the transaction.
    expect(calls.volunteerUpdateMany).toHaveLength(1)
    expect(calls.volunteerUpdateMany[0].where).toEqual({ id: "v1", orgLinkTokenHash: { not: null } })
    expect(calls.volunteerUpdateMany[0].data).toEqual({
      orgLinkTokenHash: null,
      orgLinkTokenEnc: null,
      orgLinkTokenLegacy: null,
      orgLinkIssuedAt: null,
    })
    expect(calls.volunteerUpdates).toHaveLength(1)
    expect(calls.volunteerUpdates[0].where).toEqual({ id: "v1" })
    expect(calls.volunteerUpdates[0].data.orgLinkTokenHash).toBeTruthy()
    expect(calls.volunteerUpdates[0].data.orgLinkTokenHash).not.toBe("old-hash")
    expect(m.enqueue).toHaveBeenCalledTimes(1)
    const [payloads] = m.enqueue.mock.calls[0]
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toMatchObject({
      kind: "org_personal_link",
      organizationId: "org-a",
      volunteerId: "v1",
      recipient: { email: "new@example.ch", name: "Léa M" },
      data: { organizationName: "Asso", orgSlug: "asso" },
    })
    expect(payloads[0].data.orgToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(payloads[0].data.orgToken).not.toBe("old-hash")
  })

  it("does not issue a link that never existed, and sends nothing extra", async () => {
    const { tx, calls } = fakeTx(null)
    const result = await renewMemberLinks(tx, { organizationId: "org-a", volunteer, oldEmail: "old@example.ch", newEmail: "new@example.ch", now })
    expect(result.orgLink).toBe(false)
    expect(calls.volunteerUpdateMany).toHaveLength(1)
    expect(calls.volunteerUpdates).toHaveLength(0)
    expect(m.enqueue).not.toHaveBeenCalled()
  })

  it("clears and replaces even when the address is removed, but sends nothing", async () => {
    const { tx, calls } = fakeTx("old-hash")
    const result = await renewMemberLinks(tx, { organizationId: "org-a", volunteer, oldEmail: "old@example.ch", newEmail: null, now })
    expect(result.orgLink).toBe(true)
    expect(calls.volunteerUpdates).toHaveLength(1)
    expect(hashToken("anything")).not.toBe(calls.volunteerUpdates[0].data.orgLinkTokenHash)
    expect(m.enqueue).not.toHaveBeenCalled()
  })

  it("clears a token issued after any earlier read, because it only clears by volunteer id", async () => {
    // There is no read to race: the updateMany condition is the id (and a non-null hash), so a
    // token issued just before the transaction is still the one revoked.
    const { tx, calls } = fakeTx("issued-meanwhile")
    await renewMemberLinks(tx, { organizationId: "org-a", volunteer, oldEmail: "old@example.ch", newEmail: "new@example.ch", now })
    expect(calls.volunteerUpdateMany[0].where).toEqual({ id: "v1", orgLinkTokenHash: { not: null } })
    expect(calls.volunteerUpdateMany[0].data.orgLinkTokenHash).toBeNull()
  })
})
