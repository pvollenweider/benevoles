import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"

/**
 * Custom reminder rules against a real Postgres (#1139). The unit tests of
 * `src/lib/__tests__/reminder-rules.test.ts` are pure; these prove the parts only a database can
 * prove: two concurrent queue runs claim one occurrence, and a time change between queueing and
 * delivery moves or cancels the unsent occurrence instead of sending a stale email.
 *
 * Not run here (no PostgreSQL in this worktree): `npm run test:integration` needs `DATABASE_URL`.
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
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    sendNotificationMock.mockReset()
    sendNotificationMock.mockResolvedValue({ ok: true })
    await prisma.reminderOccurrence.deleteMany({ where: { eventId } })
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
    await prisma.shift.update({ where: { id: shiftId }, data: { startTime: "10:00", status: "open" } })
    await prisma.registration.update({ where: { id: registrationId }, data: { status: "active" } })
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
    await deliverOutbox({ now })
    expect(sendNotificationMock).not.toHaveBeenCalled()
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
})
