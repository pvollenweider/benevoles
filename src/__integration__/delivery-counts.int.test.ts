// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"

/**
 * #1269 against a real Postgres: the nightly cleanup folds the outbox rows it deletes into
 * per-kind delivery counts (organisation or platform, UTC day, kind, outcome, cancellation class),
 * without recipient, address or content. Linked rows still feed their TargetedMessage and
 * SendBatch counters; two cleanups at once never count twice; an unreadable payload becomes
 * `unknown` without blocking; expired counters are purged; and both cron routes record their
 * summary in JobRun.summary.
 */

const report = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }))
vi.mock("@/lib/report-error", () => ({ reportError: (key: string) => (e: unknown) => report.error(key, e) }))
vi.mock("@/lib/operator-alerts", () => ({ notifyOperator: vi.fn().mockResolvedValue(undefined) }))
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock("@/lib/push", () => ({ sendPushToVolunteer: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/waitlist", () => ({
  promoteNextInWaitlist: vi.fn().mockResolvedValue(undefined),
  reconcileWaitlists: vi.fn().mockResolvedValue({ shifts: 0, offered: 0 }),
}))
vi.mock("@/lib/notifications/outbox", async (orig) => ({
  ...(await orig<typeof import("@/lib/notifications/outbox")>()),
  deliverOutbox: vi.fn().mockResolvedValue({ sent: 0, retried: 0, failed: 0, cancelled: 0, held: 0 }),
  outboxHealth: vi.fn().mockResolvedValue({ failedLastDay: 0, oldestPendingMinutes: null, staleClaims: 0, healthy: true, stuck: false }),
}))

import { prisma } from "@/lib/prisma"
import { sealPayload } from "@/lib/notifications/outbox"
import { deliveryDay } from "@/lib/delivery-counters"
import type { NotificationKind } from "@/lib/notifications/types"
import { RETENTION_DAYS } from "@/lib/retention"
import { POST as cleanupRoute } from "@/app/api/cron/cleanup/route"
import { POST as remindersRoute } from "@/app/api/cron/reminders/route"

const url = process.env.DATABASE_URL
const tag = `int-delivery-counts-${Date.now()}`
const DAY_MS = 24 * 60 * 60 * 1000
const OLD = new Date(Date.now() - 40 * DAY_MS)

const post = (path: string) => new Request(`http://localhost${path}`, { method: "POST", headers: { authorization: "Bearer s3cret" } })
const cleanup = () => cleanupRoute(post("/api/cron/cleanup"))
const reminders = () => remindersRoute(post("/api/cron/reminders"))

describe.skipIf(!url)("outbox delivery counts and job summaries (#1269)", () => {
  let orgId = ""
  let eventId = ""

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Org ${tag}`, slug: tag, timeZone: "Europe/Zurich" } })
    orgId = org.id
    eventId = (await prisma.event.create({
      data: { organizationId: orgId, slug: `${tag}-fete`, title: "Fête", startDate: new Date("2031-06-01"), endDate: new Date("2031-06-02"), publicStatus: "draft" },
    })).id
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.notificationDeliveryCount.deleteMany({ where: { OR: [{ organizationId: orgId }, { organizationId: null }] } })
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: null } })
      await prisma.event.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.deleteMany({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  // Drain what other integration tests left in the outbox, so each test counts only its own rows.
  beforeEach(async () => {
    report.error.mockReset()
    expect((await cleanup()).status).toBe(200)
  })

  let seq = 0
  /** One outbox row, its payload sealed like the application stores it. */
  const seed = (over: {
    kind: string
    status: string
    createdAt?: Date
    lastError?: string | null
    organizationId?: string | null
    dedupeKey?: string | null
    targetedMessageId?: string | null
    sendBatchId?: string | null
    lastHeldAt?: Date | null
    firstHeldAt?: Date | null
    sentAt?: Date | null
  }) => prisma.notificationOutbox.create({
    data: {
      payload: sealPayload({ kind: over.kind as NotificationKind, recipient: { email: `${tag}-${++seq}@example.org` }, data: {} }),
      status: over.status,
      createdAt: over.createdAt ?? new Date(),
      lastError: over.lastError ?? null,
      organizationId: over.organizationId === undefined ? orgId : over.organizationId,
      dedupeKey: over.dedupeKey ?? null,
      targetedMessageId: over.targetedMessageId ?? null,
      sendBatchId: over.sendBatchId ?? null,
      lastHeldAt: over.lastHeldAt ?? null,
      firstHeldAt: over.firstHeldAt ?? null,
      sentAt: over.sentAt ?? null,
    },
    select: { id: true },
  })

  const counter = (organizationKey: string, day: Date, kind: string, outcome: string, reason = "") =>
    prisma.notificationDeliveryCount.findUnique({
      where: { organizationKey_day_kind_outcome_reason: { organizationKey, day, kind, outcome, reason } },
    })

  it("folds sent, failed and cancelled rows into their counts, linked and platform ones included, then deletes them", async () => {
    const message = await prisma.targetedMessage.create({
      data: { organizationId: orgId, eventId, authorName: "Org", subject: "Sujet", message: "Texte", audienceLabel: "Tous", recipientCount: 3 },
    })
    const batch = await prisma.sendBatch.create({ data: { organizationId: orgId, eventId, kind: "targeted_message" } })

    const sent = await seed({ kind: "registration_confirmation", status: "sent" })
    const failed = await seed({ kind: "reminder_j1", status: "failed", createdAt: OLD, lastError: "smtp:permanent:mailbox_unknown:550:5.1.1" })
    const limited = await seed({ kind: "reminder_j1", status: "cancelled", createdAt: OLD, lastError: "limit:recipient_per_hour" })
    const orgLimited = await seed({ kind: "registration_confirmation", status: "cancelled", createdAt: OLD, lastError: "limit:org_per_day" })
    const other = await seed({ kind: "registration_confirmation", status: "cancelled", createdAt: OLD, lastError: "SMTP 550 5.1.1 mailbox unavailable for jane@example.org" })
    const alert = await seed({ kind: "operator_alert", status: "sent", createdAt: new Date(Date.now() - 10 * DAY_MS), organizationId: null, dedupeKey: `operator_alert:${tag}` })
    const platform = await seed({ kind: "registration_confirmation", status: "sent", organizationId: null })
    const unreadable = await prisma.notificationOutbox.create({ data: { payload: { enc: "v2:missing-key:AAAA" }, status: "sent", organizationId: orgId }, select: { id: true } })
    const linkedSent = await seed({ kind: "targeted_message", status: "sent", targetedMessageId: message.id, sendBatchId: batch.id, firstHeldAt: new Date(Date.now() - 120_000), lastHeldAt: new Date(Date.now() - 60_000), sentAt: new Date() })
    const linkedFailed = await seed({ kind: "targeted_message", status: "failed", createdAt: OLD, lastError: "smtp:temporary:timeout:-:-", targetedMessageId: message.id, sendBatchId: batch.id })
    const linkedCancelled = await seed({ kind: "targeted_message", status: "cancelled", createdAt: OLD, lastError: "Plus aucune inscription à annoncer.", sendBatchId: batch.id })
    const ids = [sent, failed, limited, orgLimited, other, alert, platform, unreadable, linkedSent, linkedFailed, linkedCancelled].map((r) => r.id)

    // An expired counter goes; a recent one stays.
    const expiredDay = deliveryDay(new Date(Date.now() - (RETENTION_DAYS.deliveryCounter + 10) * DAY_MS))
    const recentDay = deliveryDay(new Date(Date.now() - 2 * DAY_MS))
    await prisma.notificationDeliveryCount.createMany({
      data: [
        { organizationKey: orgId, organizationId: orgId, day: expiredDay, kind: "reminder_j1", outcome: "sent", reason: "", count: 4 },
        { organizationKey: orgId, organizationId: orgId, day: recentDay, kind: "reminder_j1", outcome: "sent", reason: "", count: 2 },
      ],
    })

    const res = await cleanup()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(await prisma.notificationOutbox.count({ where: { id: { in: ids } } })).toBe(0)
    expect(body.deliveryCounts).toEqual({ rows: 11, buckets: expect.any(Number), unreadable: 1 })
    expect(body.deleted.notificationOutbox).toBe(11)
    expect(body.deleted.deliveryCounters).toBe(1)
    expect(typeof body.backupAlerts).toBe("number")

    const day = deliveryDay(new Date())
    const oldDay = deliveryDay(OLD)
    expect((await counter(orgId, day, "registration_confirmation", "sent"))?.count).toBe(1)
    expect((await counter(orgId, oldDay, "reminder_j1", "failed", ""))?.count).toBe(1)
    expect((await counter(orgId, oldDay, "reminder_j1", "cancelled", "limit:recipient_per_hour"))?.count).toBe(1)
    expect((await counter(orgId, oldDay, "registration_confirmation", "cancelled", "limit:org_per_day"))?.count).toBe(1)
    // Raw text never reaches the column: an unrecognized reason is `other`.
    expect((await counter(orgId, oldDay, "registration_confirmation", "cancelled", "other"))?.count).toBe(1)
    // Unreadable payload: counted, as unknown.
    expect((await counter(orgId, day, "unknown", "sent"))?.count).toBe(1)
    expect(report.error).toHaveBeenCalledWith("cleanup.delivery_counters.payload", expect.any(Error))
    // Platform rows, the operator alert included, share the "platform" key instead of a NULL.
    expect((await counter("platform", deliveryDay(new Date(Date.now() - 10 * DAY_MS)), "operator_alert", "sent"))?.count).toBe(1)
    expect((await counter("platform", day, "registration_confirmation", "sent"))?.count).toBe(1)

    // The message and batch counters keep their own behaviour.
    const m = await prisma.targetedMessage.findUniqueOrThrow({ where: { id: message.id } })
    expect({ sent: m.sentCount, failed: m.failedCount }).toEqual({ sent: 1, failed: 1 })
    const b = await prisma.sendBatch.findUniqueOrThrow({ where: { id: batch.id } })
    expect({ sent: b.sentCount, heldSent: b.heldSentCount, failed: b.failedCount, cancelled: b.cancelledCount }).toEqual({ sent: 1, heldSent: 1, failed: 1, cancelled: 1 })
    expect(b.maxHeldWaitSec).toBeGreaterThan(0)

    // The purge of the expired counter is in the summary, and the recent one is still there.
    expect(await prisma.notificationDeliveryCount.findUnique({ where: { organizationKey_day_kind_outcome_reason: { organizationKey: orgId, day: expiredDay, kind: "reminder_j1", outcome: "sent", reason: "" } } })).toBeNull()
    expect((await counter(orgId, recentDay, "reminder_j1", "sent"))?.count).toBe(2)

    // JobRun.summary now holds the counters object, not a Response.
    const job = await prisma.jobRun.findUniqueOrThrow({ where: { job: "cleanup" } })
    expect(job.summary).toEqual(body)
    expect(job.summary).toMatchObject({
      deleted: { notificationOutbox: 11, deliveryCounters: 1 },
      backupAlerts: expect.any(Number),
      deliveryCounts: { rows: 11, unreadable: 1 },
    })
    // No address in what the super-admin health page shows.
    expect(JSON.stringify(job.summary)).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  })

  it("a second cleanup the same day adds to the same counter, including for emails without organisation", async () => {
    const org = await prisma.organization.create({ data: { name: `Org ${tag} bis`, slug: `${tag}-bis`, timeZone: "Europe/Zurich" } })
    const day = deliveryDay(new Date())
    const platformBefore = (await counter("platform", day, "registration_confirmation", "sent"))?.count ?? 0
    await seed({ kind: "admin_notification", status: "sent", organizationId: org.id })
    await seed({ kind: "admin_notification", status: "sent", organizationId: org.id })
    await seed({ kind: "registration_confirmation", status: "sent", organizationId: null })

    expect((await cleanup()).status).toBe(200)
    expect((await counter(org.id, day, "admin_notification", "sent"))?.count).toBe(2)
    expect((await counter("platform", day, "registration_confirmation", "sent"))?.count).toBe(platformBefore + 1)

    // A later run the same day increments the existing row instead of creating another.
    await seed({ kind: "admin_notification", status: "sent", organizationId: org.id })
    const again = await cleanup()
    expect(again.status).toBe(200)
    expect((await counter(org.id, day, "admin_notification", "sent"))?.count).toBe(3)
    expect(await prisma.notificationDeliveryCount.count({ where: { organizationKey: org.id, day, kind: "admin_notification", outcome: "sent", reason: "" } })).toBe(1)
    await prisma.organization.delete({ where: { id: org.id } })
    // Cascade: the organisation's counters went with it.
    expect(await prisma.notificationDeliveryCount.count({ where: { organizationId: org.id } })).toBe(0)
  })

  it("two cleanups running at once count each row once", async () => {
    const org = await prisma.organization.create({ data: { name: `Org ${tag} ter`, slug: `${tag}-ter`, timeZone: "Europe/Zurich" } })
    const ids = []
    for (let i = 0; i < 5; i++) ids.push((await seed({ kind: "registration_confirmation", status: "sent", organizationId: org.id })).id)
    for (let i = 0; i < 3; i++) ids.push((await seed({ kind: "reminder_j1", status: "failed", createdAt: OLD, lastError: "smtp:temporary:timeout:-:-", organizationId: org.id })).id)
    // The row exists before either run: recordJobRun's upsert then updates it, no create race.
    await prisma.jobRun.upsert({ where: { job: "cleanup" }, create: { job: "cleanup", startedAt: new Date() }, update: {} })

    // Hold the freeze lock the cleanup takes: both runs wait, then go one after the other. Without
    // the lock they would both read (and count) the rows before either deleted them.
    let release!: () => void
    const released = new Promise<void>((resolve) => { release = resolve })
    const holding = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cleanup.outbox-freeze'))`
      await released
    }, { timeout: 20_000 })
    await new Promise((resolve) => setTimeout(resolve, 200))
    const runs = Promise.all([cleanup(), cleanup()])
    await new Promise((resolve) => setTimeout(resolve, 500))
    release()
    await holding
    const [a, b] = await runs
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    const bodies = [await a.json(), await b.json()] as { deliveryCounts: { rows: number } }[]

    expect(await prisma.notificationOutbox.count({ where: { id: { in: ids } } })).toBe(0)
    const day = deliveryDay(new Date())
    expect((await counter(org.id, day, "registration_confirmation", "sent"))?.count).toBe(5)
    expect((await counter(org.id, deliveryDay(OLD), "reminder_j1", "failed", ""))?.count).toBe(3)
    expect(bodies.reduce((n, body) => n + body.deliveryCounts.rows, 0)).toBe(8)
    await prisma.organization.delete({ where: { id: org.id } })
  })

  it("records the reminders summary too, without any address", async () => {
    const res = await reminders()
    expect(res.status).toBe(200)
    const body = await res.json()
    const job = await prisma.jobRun.findUniqueOrThrow({ where: { job: "reminders" } })
    expect(job.summary).toEqual(body)
    expect(job.summary).toMatchObject({ totals: expect.any(Object), expiredOffers: 0, outboxStatus: expect.any(Object) })
    expect(JSON.stringify(job.summary)).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  })
})
