// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32), ADMIN_NOTIFICATION_EMAIL: undefined as string | undefined } }))

const findManyDeliveryOutcome = vi.hoisted(() => vi.fn())
const findManyVolunteer = vi.hoisted(() => vi.fn())
const findManyAdminUser = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deliveryOutcome: { findMany: findManyDeliveryOutcome },
    volunteer: { findMany: findManyVolunteer },
    adminUser: { findMany: findManyAdminUser },
  },
}))

import { loadOrganizationsWithNewAddressesToVerify, loadSummaryRecipients } from "../delivery-summary-data"
import { addressHash } from "../notifications/smtp-outcome"
import { env } from "@/lib/env"

const since = new Date("2026-03-09T02:00:00Z")
const now = new Date("2026-03-10T02:00:00Z")

describe("loadOrganizationsWithNewAddressesToVerify", () => {
  beforeEach(() => vi.clearAllMocks())

  it("groups candidate volunteers by organization and keeps only those still « to verify »", async () => {
    findManyDeliveryOutcome.mockResolvedValue([
      { organizationId: "org-a", volunteerId: "vol-1" },
      { organizationId: "org-a", volunteerId: "vol-2" },
    ])
    findManyVolunteer.mockResolvedValue([
      { id: "vol-1", firstName: "Julie", lastName: "Martin", email: "julie@x.ch" },
      { id: "vol-2", firstName: "Marc", lastName: "Dupont", email: "marc@x.ch" },
    ])
    // vol-1 still has a matching recent permanent rejection; vol-2's address was since fixed.
    const hash1 = addressHash("julie@x.ch", env.AUTH_SECRET)
    const hash2 = addressHash("marc@x.ch", env.AUTH_SECRET)
    findManyDeliveryOutcome.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.volunteerId && typeof where.volunteerId === "object" && "in" in (where.volunteerId as object)) {
        // Second call, from loadDeliveryOutcomesForVolunteers inside loadAddressStatuses.
        return Promise.resolve([
          { volunteerId: "vol-1", addressHash: hash1, outcome: "rejected_permanent", createdAt: since },
          { volunteerId: "vol-2", addressHash: hash2, outcome: "accepted_by_relay", createdAt: now },
        ])
      }
      return Promise.resolve([
        { organizationId: "org-a", volunteerId: "vol-1" },
        { organizationId: "org-a", volunteerId: "vol-2" },
      ])
    })

    const result = await loadOrganizationsWithNewAddressesToVerify(since, now)
    expect(result).toEqual([{ organizationId: "org-a", members: [{ id: "vol-1", name: "Julie Martin" }] }])
  })

  it("returns nothing when there is no recent important permanent failure", async () => {
    findManyDeliveryOutcome.mockResolvedValue([])
    const result = await loadOrganizationsWithNewAddressesToVerify(since, now)
    expect(result).toEqual([])
    expect(findManyVolunteer).not.toHaveBeenCalled()
  })

  it("scopes the DeliveryOutcome query itself to one organization when asked (the dashboard)", async () => {
    findManyDeliveryOutcome.mockResolvedValue([])
    await loadOrganizationsWithNewAddressesToVerify(since, now, "org-a")
    expect(findManyDeliveryOutcome).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-a" }) }))
  })

  it("scopes the volunteer lookup to the organization, never by id alone", async () => {
    findManyDeliveryOutcome.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.volunteerId && typeof where.volunteerId === "object" && "in" in (where.volunteerId as object)) return Promise.resolve([])
      return Promise.resolve([{ organizationId: "org-a", volunteerId: "vol-1" }])
    })
    findManyVolunteer.mockResolvedValue([])
    await loadOrganizationsWithNewAddressesToVerify(since, now)
    expect(findManyVolunteer).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["vol-1"] }, organizationId: "org-a" } }))
  })
})

describe("loadSummaryRecipients", () => {
  beforeEach(() => vi.clearAllMocks())

  it("uses the organization's active admins when there are any", async () => {
    findManyAdminUser.mockResolvedValue([{ email: "a@org.ch", name: "Admin A" }])
    expect(await loadSummaryRecipients("org-a")).toEqual([{ email: "a@org.ch", name: "Admin A" }])
  })

  it("falls back to ADMIN_NOTIFICATION_EMAIL only when the org has no active admin", async () => {
    findManyAdminUser.mockResolvedValue([])
    env.ADMIN_NOTIFICATION_EMAIL = "fallback@benevol.app"
    expect(await loadSummaryRecipients("org-a")).toEqual([{ email: "fallback@benevol.app", name: "Admin" }])
    env.ADMIN_NOTIFICATION_EMAIL = undefined
    expect(await loadSummaryRecipients("org-a")).toEqual([])
  })
})
