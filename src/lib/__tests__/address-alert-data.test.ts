// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32), ADMIN_NOTIFICATION_EMAIL: undefined as string | undefined } }))

const db = vi.hoisted(() => ({
  outcomes: vi.fn(), volunteers: vi.fn(), registrations: vi.fn(), organization: vi.fn(), admins: vi.fn(), enqueue: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deliveryOutcome: { findMany: db.outcomes },
    volunteer: { findMany: db.volunteers },
    registration: { findMany: db.registrations },
    organization: { findUnique: db.organization },
    adminUser: { findMany: db.admins },
  },
}))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: db.enqueue }))

import { enqueueAddressAlerts, loadAddressAlerts } from "../address-alert-data"
import { addressHash } from "../notifications/smtp-outcome"
import { env } from "@/lib/env"

const now = new Date("2026-11-27T09:15:00Z")
const since = new Date("2026-11-27T08:45:00Z")
const hash = (email: string) => addressHash(email, env.AUTH_SECRET)
const yann = { id: "v1", firstName: "Yann", lastName: "Favre", email: "yann@example.org", phone: "079 555 01 23" }

/** Routes each `deliveryOutcome.findMany` by its shape: the candidates (distinct), then the history. */
function outcomesFor(history: Record<string, unknown>[]) {
  db.outcomes.mockImplementation(async (args: { distinct?: string[]; where: { organizationId?: unknown } }) => {
    if (args.distinct) return [{ organizationId: "org-a", volunteerId: "v1" }]
    return history.filter((h) => h.organizationId === args.where.organizationId)
  })
}

describe("loadAddressAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.organization.mockResolvedValue({ timeZone: "Europe/Zurich", notificationSettings: null })
    db.volunteers.mockResolvedValue([yann])
    db.registrations.mockResolvedValue([
      { volunteerId: "v1", shift: { date: new Date("2026-11-27T00:00:00Z"), startTime: "14:00", endTime: "16:00", roleName: "Stand de vente", label: null, event: { title: "Marché de Noël" } } },
      { volunteerId: "v1", shift: { date: new Date("2026-11-28T00:00:00Z"), startTime: "14:00", endTime: "17:00", roleName: "Stand de vente", label: null, event: { title: "Marché de Noël" } } },
    ])
    outcomesFor([
      { organizationId: "org-a", volunteerId: "v1", addressHash: hash(yann.email), outcome: "accepted_by_relay", createdAt: new Date("2026-11-26T12:00:00Z"), outboxId: null, messageRef: "r1" },
      { organizationId: "org-a", volunteerId: "v1", addressHash: hash(yann.email), outcome: "rejected_permanent", createdAt: new Date("2026-11-27T09:00:00Z"), outboxId: null, messageRef: "r1" },
    ])
  })

  it("lists a member whose address just failed and who is expected soon, with the next shift and the phone", async () => {
    const alerts = await loadAddressAlerts(since, now)
    expect(alerts).toEqual([{
      organizationId: "org-a",
      members: [{ id: "v1", name: "Yann Favre", phone: "079 555 01 23", eventTitle: "Marché de Noël", shiftName: "Stand de vente", when: "aujourd'hui, vendredi 27 novembre, de 14 h à 16 h", neverReached: true }],
    }])
  })

  it("scopes every read to the organisation of the failed send", async () => {
    await loadAddressAlerts(since, now)
    expect(db.volunteers.mock.calls[0][0].where).toMatchObject({ organizationId: "org-a" })
    expect(db.registrations.mock.calls[0][0].where).toMatchObject({ status: "active", shift: { event: { organizationId: "org-a" } } })
    const history = db.outcomes.mock.calls.map((c) => c[0]).filter((a) => !a.distinct)
    expect(history.length).toBeGreaterThan(0)
    for (const args of history) expect(args.where.organizationId).toBe("org-a")
  })

  it("leaves out a member with no shift soon, and one whose address is no longer to verify", async () => {
    db.registrations.mockResolvedValue([])
    expect(await loadAddressAlerts(since, now)).toEqual([])
    db.volunteers.mockResolvedValue([{ ...yann, email: "nouvelle@example.org" }])
    expect(await loadAddressAlerts(since, now)).toEqual([])
  })
})

describe("enqueueAddressAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.volunteers.mockResolvedValue([yann])
    db.registrations.mockResolvedValue([{ volunteerId: "v1", shift: { date: new Date("2026-11-27T00:00:00Z"), startTime: "14:00", endTime: "16:00", roleName: "Stand de vente", label: null, event: { title: "Marché de Noël" } } }])
    outcomesFor([{ organizationId: "org-a", volunteerId: "v1", addressHash: hash(yann.email), outcome: "rejected_permanent", createdAt: new Date("2026-11-27T09:00:00Z"), outboxId: null, messageRef: null }])
    db.admins.mockResolvedValue([{ email: "club@example.org", name: "Club" }])
    db.enqueue.mockResolvedValue(["o1"])
  })

  it("queues one email per administrator, with a key that drops a repeat of the same people that day", async () => {
    db.organization.mockResolvedValue({ timeZone: "Europe/Zurich", notificationSettings: null })
    expect(await enqueueAddressAlerts(now)).toEqual(["o1"])
    const [rows] = db.enqueue.mock.calls[0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: "address_to_verify_alert", organizationId: "org-a", recipient: { email: "club@example.org" }, dedupeKey: "address_to_verify_alert:org-a:2026-11-27:club@example.org:v1" })
    expect(rows[0].data.members[0]).not.toHaveProperty("id")
  })

  it("respects the organisation's choice not to receive emails about addresses to verify", async () => {
    db.organization.mockResolvedValue({ timeZone: "Europe/Zurich", notificationSettings: { addressesToVerifyAdminEmail: false } })
    expect(await enqueueAddressAlerts(now)).toEqual([])
    expect(db.enqueue).not.toHaveBeenCalled()
  })
})
