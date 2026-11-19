// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A general email queued with the organisation-wide link must not leave after that link was
 * replaced (#1429, lot B): a renewal, an address correction, a merge or an erasure cancels it at
 * delivery, exactly like the lost-link email itself.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  volunteerFindUnique: vi.fn(),
  registrationFindUnique: vi.fn(),
}))

vi.mock("../prisma", () => ({
  prisma: {
    volunteer: { findUnique: m.volunteerFindUnique },
    registration: { findUnique: m.registrationFindUnique },
  },
}))

import { outboxRecipientVerdict } from "../outbox-recipient-check"
import { MEMBER_ADDRESS_CHANGED_REASON, PERSONAL_LINK_REVOKED_REASON } from "../outbox-address-changed-reason"
import type { NotificationPayload } from "../notifications/types"

const payload = (): NotificationPayload => ({
  kind: "registration_confirmation",
  recipient: { email: "julie@example.com", name: "Julie Martin" },
  volunteerId: "vol-1",
  organizationId: "org-1",
  data: { volunteerName: "Julie Martin", eventTitle: "Festival", orgToken: "old-org-token", organizationName: "Rhône Rocks" },
})

beforeEach(() => {
  m.volunteerFindUnique.mockReset()
  m.registrationFindUnique.mockReset()
})

describe("outbox verdict — organisation-wide link (#1429, lot B)", () => {
  it("cancels a general email whose organisation link was replaced before sending", async () => {
    m.volunteerFindUnique.mockResolvedValue(null)
    expect(await outboxRecipientVerdict(payload())).toBe(PERSONAL_LINK_REVOKED_REASON)
  })

  it("lets it go while the token is still the member's current one", async () => {
    m.volunteerFindUnique.mockResolvedValue({ id: "vol-1", email: "julie@example.com" })
    expect(await outboxRecipientVerdict(payload())).toBeNull()
  })

  it("cancels it when the token belongs to another member", async () => {
    m.volunteerFindUnique.mockResolvedValue({ id: "vol-2", email: "julie@example.com" })
    expect(await outboxRecipientVerdict(payload())).toBe(PERSONAL_LINK_REVOKED_REASON)
  })

  it("still checks the recipient's address when the token is valid", async () => {
    m.volunteerFindUnique
      .mockResolvedValueOnce({ id: "vol-1", email: "new@example.com" })
      .mockResolvedValueOnce({ id: "vol-1", email: "new@example.com" })
    expect(await outboxRecipientVerdict(payload())).toBe(MEMBER_ADDRESS_CHANGED_REASON)
  })
})
