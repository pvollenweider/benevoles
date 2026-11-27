// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32), ADMIN_NOTIFICATION_EMAIL: undefined as string | undefined } }))

const db = vi.hoisted(() => ({
  outcomes: vi.fn(), volunteers: vi.fn(), registrations: vi.fn(), organization: vi.fn(), admins: vi.fn(), enqueue: vi.fn(),
  jobRun: vi.fn(), record: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deliveryOutcome: { findMany: db.outcomes },
    volunteer: { findMany: db.volunteers },
    registration: { findMany: db.registrations },
    organization: { findUnique: db.organization },
    adminUser: { findMany: db.admins },
    jobRun: { findUnique: db.jobRun },
  },
}))
vi.mock("@/lib/job-runs", () => ({ recordJobRun: db.record }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: db.enqueue }))

import { enqueueAddressAlerts, loadAddressAlerts, runAddressAlerts } from "../address-alert-data"
import { addressHash } from "../notifications/smtp-outcome"
import { env } from "@/lib/env"

const now = new Date("2026-11-27T09:15:00Z")
const since = new Date("2026-11-27T08:45:00Z")
const hash = (email: string) => addressHash(email, env.AUTH_SECRET)
const yann = { id: "v1", firstName: "Yann", lastName: "Favre", email: "yann@example.org", phone: "079 555 01 23" }

type OutcomeArgs = { distinct?: string[]; where: { organizationId?: unknown; createdAt?: { gte?: Date; lt?: Date } } }
const isCandidates = (a: OutcomeArgs) => a.distinct?.includes("organizationId")
const isQuiet = (a: OutcomeArgs) => !!a.distinct && !isCandidates(a)

/** Routes each `deliveryOutcome.findMany` by its shape: the candidates, the quiet-period check, the history. */
function outcomesFor(history: Record<string, unknown>[], quiet: { volunteerId: string }[] = []) {
  db.outcomes.mockImplementation(async (args: OutcomeArgs) => {
    if (isCandidates(args)) return [{ organizationId: "org-a", volunteerId: "v1" }]
    if (isQuiet(args)) return quiet
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
      { organizationId: "org-a", volunteerId: "v1", addressHash: hash(yann.email), kind: "registration_confirmation", outcome: "rejected_permanent", createdAt: new Date("2026-11-19T10:00:00Z") },
      { organizationId: "org-a", volunteerId: "v1", addressHash: hash(yann.email), kind: "reminder_dd", outcome: "rejected_permanent", createdAt: new Date("2026-11-27T09:00:00Z") },
    ])
  })

  it("lists a member whose address just failed and who is expected soon, with the next shift and the phone", async () => {
    const alerts = await loadAddressAlerts(since, now)
    expect(alerts).toEqual([{
      organizationId: "org-a",
      members: [{ id: "v1", name: "Yann Favre", phone: "079 555 01 23", eventTitle: "Marché de Noël", shiftName: "Stand de vente", when: "aujourd'hui, vendredi 27 novembre, de 14 h à 16 h", refusals: "Son adresse a refusé 2 emails depuis le 19 novembre, dont la confirmation d'inscription." }],
    }])
  })

  it("scopes every read to the organisation of the failed send", async () => {
    await loadAddressAlerts(since, now)
    expect(db.volunteers.mock.calls[0][0].where).toMatchObject({ organizationId: "org-a" })
    expect(db.registrations.mock.calls[0][0].where).toMatchObject({ status: "active", shift: { event: { organizationId: "org-a" } } })
    const scoped = db.outcomes.mock.calls.map((c) => c[0] as OutcomeArgs).filter((a) => !isCandidates(a))
    // The quiet-period check, the address statuses and the history: none reads across organisations.
    expect(scoped).toHaveLength(3)
    for (const args of scoped) expect(args.where.organizationId).toBe("org-a")
  })

  it("only counts a shift that still takes place, in a published event", async () => {
    await loadAddressAlerts(since, now)
    expect(db.registrations.mock.calls[0][0].where.shift).toMatchObject({ status: { not: "cancelled" }, event: { publicStatus: "published" } })
  })

  it("reads shift days two days around the window, so a late shift west of UTC is not dropped", async () => {
    await loadAddressAlerts(since, now)
    const { gte, lte } = db.registrations.mock.calls[0][0].where.shift.date
    expect(now.getTime() - gte.getTime()).toBe(48 * 3600_000)
    expect(lte.getTime() - now.getTime()).toBe((72 + 48) * 3600_000)
  })

  it("does not alert again for someone already refused in the twelve hours before the window", async () => {
    outcomesFor([], [{ volunteerId: "v1" }])
    expect(await loadAddressAlerts(since, now)).toEqual([])
    const quiet = db.outcomes.mock.calls.map((c) => c[0] as OutcomeArgs).find(isQuiet)!
    expect(quiet.where.createdAt).toEqual({ gte: new Date(since.getTime() - 12 * 3600_000), lt: since })
    expect(db.volunteers).not.toHaveBeenCalled()
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
    outcomesFor([{ organizationId: "org-a", volunteerId: "v1", addressHash: hash(yann.email), kind: "reminder_dd", outcome: "rejected_permanent", createdAt: new Date("2026-11-27T09:00:00Z") }])
    db.admins.mockResolvedValue([{ email: "club@example.org", name: "Club" }])
    db.enqueue.mockResolvedValue(["o1"])
  })

  it("queues one email per administrator, with a key that drops a repeat of the same people that day", async () => {
    db.organization.mockResolvedValue({ timeZone: "Europe/Zurich", notificationSettings: null })
    expect(await enqueueAddressAlerts(since, now)).toEqual(["o1"])
    const [rows] = db.enqueue.mock.calls[0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: "address_to_verify_alert", organizationId: "org-a", recipient: { email: "club@example.org" }, dedupeKey: "address_to_verify_alert:org-a:2026-11-27:club@example.org:v1" })
    expect(rows[0].data.members[0]).not.toHaveProperty("id")
  })

  it("respects the organisation's choice not to receive emails about addresses to verify", async () => {
    db.organization.mockResolvedValue({ timeZone: "Europe/Zurich", notificationSettings: { addressesToVerifyAdminEmail: false } })
    expect(await enqueueAddressAlerts(since, now)).toEqual([])
    expect(db.enqueue).not.toHaveBeenCalled()
  })

  // The email carries a phone number: unlike the nightly summary, it never goes to the instance's
  // own notification address when the organisation has no active administrator.
  it("sends nothing when the organisation has no active administrator, even with a fallback address", async () => {
    db.organization.mockResolvedValue({ timeZone: "Europe/Zurich", notificationSettings: null })
    db.admins.mockResolvedValue([])
    env.ADMIN_NOTIFICATION_EMAIL = "operateur@example.org"
    expect(await enqueueAddressAlerts(since, now)).toEqual([])
    expect(db.enqueue).not.toHaveBeenCalled()
    env.ADMIN_NOTIFICATION_EMAIL = undefined
    expect(db.admins.mock.calls[0][0].where).toMatchObject({ organizationId: "org-a", isActive: true })
  })
})

describe("runAddressAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.outcomes.mockResolvedValue([])
    db.record.mockImplementation(async (_job: string, fn: () => Promise<unknown>) => fn())
  })

  it("starts its window where the previous run started and records itself as a job", async () => {
    db.jobRun.mockResolvedValue({ startedAt: new Date("2026-11-27T09:00:00Z") })
    expect(await runAddressAlerts(now)).toEqual([])
    expect(db.jobRun.mock.calls[0][0].where).toEqual({ job: "address-alerts" })
    expect(db.record.mock.calls[0][0]).toBe("address-alerts")
    expect(db.outcomes.mock.calls[0][0].where.createdAt).toEqual({ gte: new Date("2026-11-27T09:00:00Z") })
    // The previous run is read before this one overwrites its start time.
    expect(db.jobRun.mock.invocationCallOrder[0]).toBeLessThan(db.record.mock.invocationCallOrder[0])
  })
})
