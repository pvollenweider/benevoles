import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest"

/**
 * Reminder grouping (#672) against a real Postgres: the unit tests
 * (src/lib/__tests__/reminder-groups.test.ts, src/__tests__/cron-reminders-refused.test.ts) mock
 * Prisma entirely; this proves the cron route's actual query (status/window/event filters,
 * `shift.status: { not: "cancelled" }`) and the `updateMany` that marks a whole group really
 * behave this way against a real database, and that a second run sends nothing more.
 */

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }))
vi.mock("@/lib/job-runs", () => ({ recordJobRun: async (_job: string, fn: () => Promise<unknown>) => fn() }))
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))
vi.mock("@/lib/push", () => ({ sendPushToVolunteer: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/waitlist", () => ({
  promoteNextInWaitlist: vi.fn().mockResolvedValue(undefined),
  reconcileWaitlists: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/notifications/outbox", () => ({
  deliverOutbox: vi.fn().mockResolvedValue(null),
  outboxHealth: vi.fn().mockResolvedValue({ healthy: true }),
}))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))

import { prisma } from "@/lib/prisma"
import { registrationToken } from "@/lib/token-vault"

const url = process.env.DATABASE_URL
const tag = `int-reminders-${Date.now()}`

function post() {
  return new Request("http://localhost/api/cron/reminders", { method: "POST", headers: { authorization: "Bearer s3cret" } })
}

describe.skipIf(!url)("cron reminders grouping on Postgres (#672)", () => {
  let orgId = ""
  let eventId = ""
  let volunteerId = ""
  // "Now" during the test: both shifts sit in the day-of window (2-4h away).
  const now = new Date("2030-06-01T08:00:00Z")

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org reminders", slug: `${tag}-org`, timeZone: "UTC" } })
    orgId = org.id
    const event = await prisma.event.create({
      data: {
        organizationId: orgId, slug: "fete", title: "Fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-01"),
        publicStatus: "published", remindersEnabled: true,
      },
    })
    eventId = event.id
    const volunteer = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Alice", lastName: "Martin", email: `${tag}@x.ch` } })
    volunteerId = volunteer.id
  })

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  beforeEach(() => {
    sendNotificationMock.mockReset()
    sendNotificationMock.mockResolvedValue({ ok: true })
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => vi.useRealTimers())

  async function makeShiftAndRegistration(startTime: string, status: "active" | "cancelled" = "active") {
    const shift = await prisma.shift.create({
      data: { eventId, roleName: "Bar", label: "Bar", date: new Date("2030-06-01"), startTime, endTime: "23:59", capacity: 5, status: status === "cancelled" ? "cancelled" : "open" },
    })
    const reg = await prisma.registration.create({
      data: { eventId, shiftId: shift.id, volunteerId, status: "active", ...registrationToken.data(`${tag}-${shift.id}`) },
    })
    return { shift, reg }
  }

  it("sends one grouped email for two shifts the same day, marks both, and a re-run sends nothing more", async () => {
    const { reg: reg1 } = await makeShiftAndRegistration("10:00") // 2h away: inside the day-of window
    const { reg: reg2 } = await makeShiftAndRegistration("11:30") // 3.5h away: same window, later start

    const { POST } = await import("@/app/api/cron/reminders/route")
    const res = await POST(post())
    const data = await res.json()

    expect(data.totals.reminder_dd).toEqual({ eligible: 2, groups: 1, sent: 1, failed: 0 })
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)
    const sentShifts = sendNotificationMock.mock.calls[0][0].data.shifts
    expect(sentShifts).toHaveLength(2)
    expect(sentShifts[0].startTime).toBe("10:00") // sorted, earliest first

    const marked = await prisma.registration.findMany({ where: { id: { in: [reg1.id, reg2.id] } } })
    expect(marked.every((r) => r.reminderDdSent !== null)).toBe(true)

    // Re-run: the DB query no longer returns these (reminderDdSent is set), so nothing is sent again.
    sendNotificationMock.mockClear()
    const res2 = await POST(post())
    const data2 = await res2.json()
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect(data2.totals.reminder_dd).toEqual({ eligible: 0, groups: 0, sent: 0, failed: 0 })
  })

  it("excludes a cancelled shift from the group but still reminds the rest of the day", async () => {
    const { reg: active } = await makeShiftAndRegistration("10:00")
    await makeShiftAndRegistration("11:00", "cancelled")

    const { POST } = await import("@/app/api/cron/reminders/route")
    const res = await POST(post())
    const data = await res.json()

    expect(data.totals.reminder_dd).toEqual({ eligible: 1, groups: 1, sent: 1, failed: 0 })
    const marked = await prisma.registration.findUniqueOrThrow({ where: { id: active.id } })
    expect(marked.reminderDdSent).not.toBeNull()
  })

  it("a late sign-up after the day's group was already sent still gets its own reminder", async () => {
    const { reg: reg1 } = await makeShiftAndRegistration("10:00")
    const { POST } = await import("@/app/api/cron/reminders/route")
    await POST(post())
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: reg1.id } })).reminderDdSent).not.toBeNull()

    // Late sign-up, same day, also inside the window: forms its own group (the earlier one is sent).
    sendNotificationMock.mockClear()
    const { reg: lateReg } = await makeShiftAndRegistration("10:30")
    const res = await POST(post())
    const data = await res.json()
    expect(data.totals.reminder_dd).toEqual({ eligible: 1, groups: 1, sent: 1, failed: 0 })
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: lateReg.id } })).reminderDdSent).not.toBeNull()
  })
})
