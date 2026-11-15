import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest"

/**
 * Custom reminder rules against a real Postgres (#1139). The unit tests of
 * `src/lib/__tests__/reminder-rules.test.ts` are pure; these prove the parts only a database can
 * prove: two concurrent queue runs claim one occurrence, and a time change between queueing and
 * delivery moves or cancels the unsent occurrence instead of sending a stale email.
 */

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }))
vi.mock("@/lib/push", () => ({ sendPushToVolunteer: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))

import { prisma } from "@/lib/prisma"
import { registrationToken } from "@/lib/token-vault"
import { queueCustomRuleReminders } from "@/lib/reminder-rules-server"
import { deliverOutbox } from "@/lib/notifications/outbox"
import { retryOutboxRow } from "@/lib/outbox-data"

const url = process.env.DATABASE_URL
const tag = `int-reminder-rules-${Date.now()}`
const now = new Date("2030-06-01T08:00:00Z")

describe.skipIf(!url)("custom reminder rules on Postgres (#1139)", () => {
  let orgId = ""
  let eventId = ""
  let shiftId = ""
  let volunteerId = ""
  let registrationId = ""
  let ruleId = ""

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org règles", slug: `${tag}-org`, timeZone: "UTC" } })
    orgId = org.id
    const event = await prisma.event.create({
      data: {
        organizationId: orgId,
        slug: "fete",
        title: "Fête",
        startDate: new Date("2030-06-01T00:00:00Z"),
        endDate: new Date("2030-06-01T00:00:00Z"),
        publicStatus: "published",
        remindersEnabled: true,
      },
    })
    eventId = event.id
    const shift = await prisma.shift.create({
      data: {
        eventId,
        roleName: "Bar",
        label: "Bar",
        date: new Date("2030-06-01T00:00:00Z"),
        startTime: "10:00",
        endTime: "18:00",
        capacity: 5,
        status: "open",
      },
    })
    shiftId = shift.id
    const volunteer = await prisma.volunteer.create({
      data: { organizationId: orgId, firstName: "Alice", lastName: "Martin", email: `${tag}@example.com` },
    })
    volunteerId = volunteer.id
    const registration = await prisma.registration.create({
      data: {
        eventId,
        shiftId,
        volunteerId,
        status: "active",
        createdAt: new Date("2030-05-01T00:00:00Z"),
        ...registrationToken.data(`${tag}-reg`),
      },
    })
    registrationId = registration.id
    const rule = await prisma.eventReminderRule.create({
      data: { eventId, unit: "hours", value: 2, enabled: true, displayOrder: 0 },
    })
    ruleId = rule.id
  })

  afterAll(async () => {
    // The outbox has no foreign key to the organisation: rows left behind would later be counted
    // by the nightly cleanup of another test file against an organisation that no longer exists.
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  afterEach(async () => {
    // Also on a failed assertion: no row may leak into the next file or the next run.
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
    await prisma.reminderOccurrence.deleteMany({ where: { eventId } })
  })

  beforeEach(async () => {
    sendNotificationMock.mockReset()
    sendNotificationMock.mockResolvedValue({ ok: true })
    await prisma.reminderOccurrence.deleteMany({ where: { eventId } })
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
    await prisma.signupConfirmation.deleteMany({ where: { eventId } })
    await prisma.shift.update({ where: { id: shiftId }, data: { startTime: "10:00", status: "open" } })
    await prisma.registration.update({ where: { id: registrationId }, data: { status: "active", signupConfirmationId: null } })
    await prisma.eventReminderRule.update({ where: { id: ruleId }, data: { enabled: true, unit: "hours", value: 2 } })
  })

  async function customOutbox() {
    return prisma.notificationOutbox.findMany({
      where: { organizationId: orgId, dedupeKey: { startsWith: "reminder-rule:" } },
      orderBy: { createdAt: "asc" },
    })
  }

  it("two concurrent queue runs enqueue the occurrence once, and a re-run sends nothing more", async () => {
    const runs = await Promise.all([queueCustomRuleReminders(now), queueCustomRuleReminders(now)])
    expect(runs.reduce((n, run) => n + run.queued, 0)).toBe(1)

    const occurrences = await prisma.reminderOccurrence.findMany({ where: { eventId } })
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toMatchObject({ status: "queued", volunteerId, localDay: "2030-06-01", ruleId })
    expect((await customOutbox())).toHaveLength(1)

    const rows = await customOutbox()
    const delivered = await deliverOutbox({ now, ids: [rows[0].id] })
    expect(delivered.sent).toBe(1)
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)
    expect(sendNotificationMock.mock.calls[0][0]).toMatchObject({ kind: "reminder_rule", volunteerId })
    const sent = await prisma.reminderOccurrence.findUniqueOrThrow({ where: { id: occurrences[0].id } })
    expect(sent.status).toBe("sent")
    expect(sent.sentAt).not.toBeNull()

    sendNotificationMock.mockClear()
    const again = await queueCustomRuleReminders(now)
    expect(again.queued).toBe(0)
    // The whole outbox is delivered here, as the cron does: rows other test files left pending
    // may go out too, so only this volunteer's reminder is looked at.
    await deliverOutbox({ now })
    const mine = sendNotificationMock.mock.calls.filter(([payload]) => payload.kind === "reminder_rule" && payload.volunteerId === volunteerId)
    expect(mine).toHaveLength(0)
  })

  it("a concurrent time change between queueing and delivery never sends the old time", async () => {
    // Queue and the shift update race; whichever commits first, delivery runs after both.
    await Promise.all([
      queueCustomRuleReminders(now),
      prisma.shift.update({ where: { id: shiftId }, data: { startTime: "12:00" } }),
    ])
    await deliverOutbox({ now })
    expect(sendNotificationMock).not.toHaveBeenCalled()
    const occurrence = await prisma.reminderOccurrence.findFirst({ where: { eventId } })
    if (occurrence) {
      // Queued before the change: deferred to the new due instant, not sent at the old one.
      expect(["pending", "queued"]).toContain(occurrence.status)
      expect(occurrence.dueAt.toISOString()).toBe("2030-06-01T10:00:00.000Z")
    }
    // At the new due instant, the email carries the new start time (whether the occurrence was
    // deferred or never claimed because the change won the race).
    await queueCustomRuleReminders(new Date("2030-06-01T10:00:00Z"))
    sendNotificationMock.mockClear()
    await deliverOutbox({ now: new Date("2030-06-01T10:00:00Z") })
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)
    expect(sendNotificationMock.mock.calls[0][0].data.shifts[0].startTime).toBe("12:00")
  })

  it("a shift moved later after queueing defers the occurrence instead of failing it", async () => {
    await queueCustomRuleReminders(now)
    const [row] = await customOutbox()
    await prisma.shift.update({ where: { id: shiftId }, data: { startTime: "12:00" } })

    const result = await deliverOutbox({ now, ids: [row.id] })
    expect(result).toMatchObject({ sent: 0, held: 1 })
    expect(sendNotificationMock).not.toHaveBeenCalled()
    const occurrence = await prisma.reminderOccurrence.findFirstOrThrow({ where: { eventId } })
    expect(occurrence).toMatchObject({ status: "queued" })
    expect(occurrence.dueAt.toISOString()).toBe("2030-06-01T10:00:00.000Z")
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("pending")
  })

  it("a shift moved earlier after queueing sends at the new time", async () => {
    await queueCustomRuleReminders(now)
    const [row] = await customOutbox()
    await prisma.shift.update({ where: { id: shiftId }, data: { startTime: "09:00" } })

    const result = await deliverOutbox({ now, ids: [row.id] })
    expect(result.sent).toBe(1)
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)
    expect(sendNotificationMock.mock.calls[0][0].data.shifts[0].startTime).toBe("09:00")
  })

  it("brings a deferred reminder forward when the shift moves back earlier", async () => {
    // 08:00Z: a 2 h rule for a 10:00Z shift is due. The shift moves to 18:00, so delivery defers
    // the outbox row to 16:00; moving it back to 10:00 must bring that row forward, not leave the
    // reminder waiting for 16:00 where it would be cancelled because the shift has started.
    await queueCustomRuleReminders(now)
    const [row] = await customOutbox()
    await prisma.shift.update({ where: { id: shiftId }, data: { startTime: "18:00" } })
    const deferred = await deliverOutbox({ now, ids: [row.id] })
    expect(deferred).toMatchObject({ sent: 0, held: 1 })
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).nextAttemptAt.toISOString())
      .toBe("2030-06-01T16:00:00.000Z")

    await prisma.shift.update({ where: { id: shiftId }, data: { startTime: "10:00" } })
    const earlier = new Date("2030-06-01T08:30:00Z")
    const run = await queueCustomRuleReminders(earlier)
    expect(run.rescheduled).toBeGreaterThanOrEqual(1)
    const forwarded = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })
    expect(forwarded.nextAttemptAt.getTime()).toBeLessThanOrEqual(earlier.getTime())

    sendNotificationMock.mockClear()
    const delivered = await deliverOutbox({ now: earlier, ids: [row.id] })
    expect(delivered.sent).toBe(1)
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)
    expect(sendNotificationMock.mock.calls[0][0].data.shifts[0].startTime).toBe("10:00")
  })

  it("does not queue a reminder for a place confirmed after its due instant", async () => {
    // Requested on 1 May (before the 08:00Z due instant) but confirmed by email at 08:15Z: the
    // confirmation timestamp, not the request date, decides.
    const confirmation = await prisma.signupConfirmation.create({
      data: {
        eventId,
        volunteerId,
        email: `${tag}@example.com`,
        firstName: "Alice",
        lastName: "Martin",
        tokenHash: `${tag}-late-confirmation`,
        expiresAt: new Date("2030-06-01T09:00:00Z"),
        confirmedAt: new Date("2030-06-01T08:15:00Z"),
        charterAcceptedHash: "test",
        charterAcceptedAt: new Date("2030-05-01T00:00:00Z"),
      },
    })
    await prisma.registration.update({ where: { id: registrationId }, data: { signupConfirmationId: confirmation.id } })

    const run = await queueCustomRuleReminders(new Date("2030-06-01T08:30:00Z"))
    expect(run.queued).toBe(0)
    expect(await prisma.reminderOccurrence.findMany({ where: { eventId } })).toHaveLength(0)
    expect(await customOutbox()).toHaveLength(0)
  })

  it("cancels at delivery when the place was confirmed after the due instant", async () => {
    await queueCustomRuleReminders(now)
    const [row] = await customOutbox()
    const confirmation = await prisma.signupConfirmation.create({
      data: {
        eventId,
        volunteerId,
        email: `${tag}@example.com`,
        firstName: "Alice",
        lastName: "Martin",
        tokenHash: `${tag}-late-delivery`,
        expiresAt: new Date("2030-06-01T09:00:00Z"),
        confirmedAt: new Date("2030-06-01T08:15:00Z"),
        charterAcceptedHash: "test",
        charterAcceptedAt: new Date("2030-05-01T00:00:00Z"),
      },
    })
    await prisma.registration.update({ where: { id: registrationId }, data: { signupConfirmationId: confirmation.id } })

    const result = await deliverOutbox({ now: new Date("2030-06-01T08:30:00Z"), ids: [row.id] })
    expect(result).toMatchObject({ sent: 0, cancelled: 1 })
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect((await prisma.reminderOccurrence.findFirstOrThrow({ where: { eventId } })).status).toBe("cancelled")
  })

  it("does not queue a terminal delivery failure again on the next run", async () => {
    await queueCustomRuleReminders(now)
    const [row] = await customOutbox()
    sendNotificationMock.mockResolvedValueOnce({ ok: false, reason: "550 permanent rejection", permanent: true })

    const failed = await deliverOutbox({ now, ids: [row.id] })
    expect(failed).toMatchObject({ sent: 0, failed: 1 })
    expect((await prisma.reminderOccurrence.findFirstOrThrow({ where: { eventId } })).status).toBe("failed")
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("failed")

    sendNotificationMock.mockClear()
    const next = new Date("2030-06-01T08:30:00Z")
    const again = await queueCustomRuleReminders(next)
    expect(again.queued).toBe(0)
    // No fresh outbox row with zero attempts: the failed occurrence is terminal, not a cancellation.
    expect((await customOutbox()).filter((r) => r.status !== "failed")).toHaveLength(0)
    expect((await prisma.reminderOccurrence.findFirstOrThrow({ where: { eventId } })).status).toBe("failed")
    const delivered = await deliverOutbox({ now: next })
    expect(delivered.sent).toBe(0)
    expect(sendNotificationMock).not.toHaveBeenCalled()
  })

  it("an administrator's retry reopens the failed occurrence and the next delivery sends it once (#1139)", async () => {
    await queueCustomRuleReminders(now)
    const [row] = await customOutbox()
    sendNotificationMock.mockResolvedValueOnce({ ok: false, reason: "550 permanent rejection", permanent: true })
    expect(await deliverOutbox({ now, ids: [row.id] })).toMatchObject({ failed: 1 })
    expect((await prisma.reminderOccurrence.findFirstOrThrow({ where: { eventId } })).status).toBe("failed")

    // Without reopening the occurrence, the resolver would cancel the retried row: the
    // administrator's « Renvoyer » would silently send nothing.
    expect(await retryOutboxRow(row.id, orgId)).toBe(true)
    expect(await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } }))
      .toMatchObject({ status: "pending", attempts: 0, claimedAt: null })
    const reopened = await prisma.reminderOccurrence.findFirstOrThrow({ where: { eventId } })
    expect(reopened).toMatchObject({ status: "queued", outboxId: row.id, lastError: null })
    expect(reopened.sentAt).toBeNull()

    sendNotificationMock.mockClear()
    const later = new Date("2030-06-01T08:30:00Z")
    expect(await deliverOutbox({ now: later, ids: [row.id] })).toMatchObject({ sent: 1 })
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)
    expect((await prisma.reminderOccurrence.findFirstOrThrow({ where: { eventId } })).status).toBe("sent")
    const sent = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })
    expect(sent.status).toBe("sent")
    expect(sent.deliveryNotBefore).toBeNull()

    // Once, not twice: nothing is due any more.
    sendNotificationMock.mockClear()
    expect(await deliverOutbox({ now: later, ids: [row.id] })).toMatchObject({ sent: 0 })
    expect(sendNotificationMock).not.toHaveBeenCalled()
  })

  it("a cancellation that empties the group cancels the reminder", async () => {
    await queueCustomRuleReminders(now)
    const [row] = await customOutbox()
    await prisma.registration.update({ where: { id: registrationId }, data: { status: "cancelled" } })

    const result = await deliverOutbox({ now, ids: [row.id] })
    expect(result).toMatchObject({ sent: 0, cancelled: 1 })
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect((await prisma.reminderOccurrence.findFirstOrThrow({ where: { eventId } })).status).toBe("cancelled")
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("cancelled")
  })

  it("brings a deferred reminder forward after a retry once the shift moves back earlier (#1139)", async () => {
    await queueCustomRuleReminders(now)
    const [row] = await customOutbox()
    // A temporary SMTP failure leaves its retry deadline on the row; the reminder must keep it
    // even after a later shift deferral, and use it when the shift comes back.
    sendNotificationMock.mockResolvedValueOnce({ ok: false, reason: "smtp down" })
    expect(await deliverOutbox({ now, ids: [row.id] })).toMatchObject({ retried: 1 })
    const retried = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })
    expect(retried.deliveryNotBefore?.toISOString()).toBe("2030-06-01T08:05:00.000Z")
    expect(retried.nextAttemptAt.toISOString()).toBe("2030-06-01T08:05:00.000Z")

    // The shift moves to 18:00: at the retry instant delivery defers to 16:00.
    await prisma.shift.update({ where: { id: shiftId }, data: { startTime: "18:00" } })
    expect(await deliverOutbox({ now: new Date("2030-06-01T08:05:00Z"), ids: [row.id] })).toMatchObject({ held: 1 })
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).nextAttemptAt.toISOString())
      .toBe("2030-06-01T16:00:00.000Z")

    // Back to 10:00: `attempts > 0` must no longer freeze the row at 16:00. The new attempt is the
    // later of the shift deadline (08:00) and the retry deadline (08:05), so 08:05.
    await prisma.shift.update({ where: { id: shiftId }, data: { startTime: "10:00" } })
    const earlier = new Date("2030-06-01T08:30:00Z")
    expect((await queueCustomRuleReminders(earlier)).rescheduled).toBeGreaterThanOrEqual(1)
    const forwarded = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })
    expect(forwarded.nextAttemptAt.toISOString()).toBe("2030-06-01T08:05:00.000Z")

    sendNotificationMock.mockClear()
    expect(await deliverOutbox({ now: earlier, ids: [row.id] })).toMatchObject({ sent: 1 })
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)
  })

  it("does not let a reschedule bypass a hold deadline (#1139)", async () => {
    await queueCustomRuleReminders(now)
    const [row] = await customOutbox()
    // A held row: markers, constraint and next attempt are already on the pending row.
    const holdUntil = new Date("2030-06-01T08:30:00Z")
    await prisma.notificationOutbox.update({
      where: { id: row.id },
      data: { firstHeldAt: now, lastHeldAt: now, deliveryNotBefore: holdUntil, nextAttemptAt: new Date("2030-06-01T16:00:00Z") },
    })
    await prisma.reminderOccurrence.updateMany({ where: { eventId }, data: { dueAt: new Date("2030-06-01T16:00:00Z") } })

    // Shift back to 10:00 (due 08:00): the row may come forward to the hold, not before it.
    const earlier = new Date("2030-06-01T08:10:00Z")
    expect((await queueCustomRuleReminders(earlier)).rescheduled).toBeGreaterThanOrEqual(1)
    const forwarded = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })
    expect(forwarded.nextAttemptAt.toISOString()).toBe("2030-06-01T08:30:00.000Z")

    // Not due before the hold ends, due once it does.
    expect(await deliverOutbox({ now: earlier, ids: [row.id] })).toMatchObject({ sent: 0 })
    expect(await deliverOutbox({ now: holdUntil, ids: [row.id] })).toMatchObject({ sent: 1 })
  })

  /** Wait until a session is blocked on a lock, so the race below is deterministic. */
  async function waitForWaitingLock(pattern: string) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const rows = await prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE ${`%${pattern}%`}
      `
      if (Number(rows[0]?.count ?? 0) > 0) return
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(`no session waited on ${pattern}`)
  }

  it("serialises two reschedules: the second reads fresh data and never moves the outbox later", async () => {
    await queueCustomRuleReminders(now)
    const [row] = await customOutbox()
    // Start from a deferred row at 16:00, as if the shift had been at 18:00.
    await prisma.notificationOutbox.update({ where: { id: row.id }, data: { nextAttemptAt: new Date("2030-06-01T16:00:00Z") } })
    await prisma.reminderOccurrence.updateMany({ where: { eventId }, data: { dueAt: new Date("2030-06-01T16:00:00Z") } })

    // Hold the outbox row in another session: the first run acquires the advisory lock, reads
    // the 10:00 shift, then blocks on the row update. While it is blocked, the shift moves to
    // 12:00 and the second run queues up behind the advisory lock.
    let releaseRow!: () => void
    let rowLocked!: () => void
    const rowGate = new Promise<void>((resolve) => { releaseRow = resolve })
    const locked = new Promise<void>((resolve) => { rowLocked = resolve })
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "NotificationOutbox" WHERE id = ${row.id} FOR UPDATE`
      rowLocked()
      await rowGate
    }, { maxWait: 10_000, timeout: 30_000 })
    await locked

    const at = new Date("2030-06-01T08:30:00Z")
    const first = queueCustomRuleReminders(at)
    await waitForWaitingLock("NotificationOutbox")
    await prisma.shift.update({ where: { id: shiftId }, data: { startTime: "12:00" } })
    const second = queueCustomRuleReminders(at)
    await waitForWaitingLock("pg_advisory_xact_lock")
    releaseRow()
    await holder
    const [firstRun, secondRun] = await Promise.all([first, second])

    expect(firstRun.rescheduled).toBeGreaterThanOrEqual(1)
    expect(secondRun.rescheduled).toBeGreaterThanOrEqual(1)
    // The first wrote 08:00 (its 10:00 read). The second then read the 12:00 shift fresh (due
    // 10:00) but its conditional write cannot move the outbox later, so it stays at 08:00.
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).nextAttemptAt.toISOString())
      .toBe("2030-06-01T08:00:00.000Z")
    expect((await prisma.reminderOccurrence.findFirstOrThrow({ where: { eventId } })).dueAt.toISOString())
      .toBe("2030-06-01T10:00:00.000Z")

    // A hold written meanwhile is never bypassed: with the shift back at 10:00, the outbox may
    // come forward to the hold (09:30), never to the bare shift instant (08:00).
    await prisma.notificationOutbox.update({
      where: { id: row.id },
      data: { deliveryNotBefore: new Date("2030-06-01T09:30:00Z"), nextAttemptAt: new Date("2030-06-01T16:00:00Z") },
    })
    await prisma.reminderOccurrence.updateMany({ where: { eventId }, data: { dueAt: new Date("2030-06-01T16:00:00Z") } })
    await prisma.shift.update({ where: { id: shiftId }, data: { startTime: "10:00" } })
    expect((await queueCustomRuleReminders(at)).rescheduled).toBeGreaterThanOrEqual(1)
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).nextAttemptAt.toISOString())
      .toBe("2030-06-01T09:30:00.000Z")
  })
})
