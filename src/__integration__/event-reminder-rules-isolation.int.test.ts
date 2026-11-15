import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"

/**
 * Failure isolation of the custom-reminder run (#1139) against a real Postgres: an unexpected
 * error while loading one event must be reported and must not stop the following events. The
 * transaction timeouts are covered by `REMINDER_RULES_TRANSACTION`; this proves the loop keeps
 * going after a failure of one event.
 */

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }))
vi.mock("@/lib/push", () => ({ sendPushToVolunteer: vi.fn().mockResolvedValue(undefined) }))

const reportErrorMock = vi.hoisted(() => {
  const calls: { context: string; error: unknown }[] = []
  return {
    calls,
    reportError: (context: string) => (error: unknown) => { calls.push({ context, error }) },
  }
})
vi.mock("@/lib/report-error", () => ({ reportError: reportErrorMock.reportError }))

import { prisma } from "@/lib/prisma"
import { registrationToken } from "@/lib/token-vault"
import { queueCustomRuleReminders } from "@/lib/reminder-rules-server"

const url = process.env.DATABASE_URL
const tag = `int-reminder-isolation-${Date.now()}`
const now = new Date("2030-06-02T08:00:00Z")

describe.skipIf(!url)("custom reminder rules failure isolation (#1139)", () => {
  let orgId = ""
  let failingEventId = ""
  let healthyEventId = ""

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org isolation", slug: `${tag}-org`, timeZone: "UTC" } })
    orgId = org.id
    const makeEvent = async (slug: string) => {
      const event = await prisma.event.create({
        data: {
          organizationId: orgId, slug, title: slug, startDate: new Date("2030-06-02T00:00:00Z"),
          endDate: new Date("2030-06-02T00:00:00Z"), publicStatus: "published", remindersEnabled: true,
        },
      })
      const shift = await prisma.shift.create({
        data: { eventId: event.id, roleName: "Bar", label: "Bar", date: new Date("2030-06-02T00:00:00Z"), startTime: "10:00", endTime: "18:00", capacity: 5, status: "open" },
      })
      const volunteer = await prisma.volunteer.create({
        data: { organizationId: orgId, firstName: "Alice", lastName: "Martin", email: `${tag}-${slug}@example.com` },
      })
      await prisma.registration.create({
        data: { eventId: event.id, shiftId: shift.id, volunteerId: volunteer.id, status: "active", createdAt: new Date("2030-01-01T00:00:00Z"), ...registrationToken.data(`${tag}-${slug}`) },
      })
      await prisma.eventReminderRule.create({
        data: { eventId: event.id, unit: "hours", value: 2, enabled: true, displayOrder: 0 },
      })
      return event.id
    }
    failingEventId = await makeEvent("failing")
    healthyEventId = await makeEvent("healthy")
  })

  afterEach(() => {
    reportErrorMock.calls.length = 0
  })

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  it("reports one event's failure and still queues the next event", async () => {
    const original = prisma.registration.findMany.bind(prisma.registration)
    const spy = vi.spyOn(prisma.registration, "findMany").mockImplementation(((args: { where?: { eventId?: string } }) => {
      if (args?.where?.eventId === failingEventId) return Promise.reject(new Error("boom"))
      return original(args as never)
    }) as never)

    try {
      const run = await queueCustomRuleReminders(now)
      expect(run.queued).toBeGreaterThanOrEqual(1)
      expect(run.failed).toBeGreaterThanOrEqual(1)
      expect(reportErrorMock.calls.some((call) => call.context === "reminders.custom.event")).toBe(true)
      expect(await prisma.reminderOccurrence.count({ where: { eventId: failingEventId } })).toBe(0)
      expect(await prisma.reminderOccurrence.count({ where: { eventId: healthyEventId } })).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })
})
