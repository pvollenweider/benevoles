import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// #597: a refused send (SMTP down, mistyped address) must be counted as `failed`, never as
// `sent`, and must not mark the reminder field — otherwise the volunteer never gets a retry
// (manual or via the outbox) because the cron thinks this reminder already went out.

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
vi.mock("@/lib/token-vault", () => ({ registrationToken: { reveal: () => "tok" } }))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))

const registrationUpdate = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const registrationFindMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: {
      findMany: registrationFindMany,
      update: registrationUpdate,
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}))

const baseReg = () => ({
  id: "reg-1",
  volunteerId: "vol-1",
  volunteer: { email: "v@x.ch", firstName: "Val" },
  shift: {
    date: new Date("2026-01-10T00:00:00Z"),
    startTime: "03:00",
    endTime: "05:00",
    label: "Accueil",
    roleName: "Rôle",
    locationDetails: null,
    contactName: null,
    contactPhone: null,
    instructions: null,
    status: "open",
  },
  event: {
    title: "Fête",
    remindersEnabled: true,
    organization: { name: "Org", slug: "org", timeZone: "UTC", notificationSettings: null },
  },
})

function post() {
  return new Request("http://localhost/api/cron/reminders", { method: "POST", headers: { authorization: "Bearer s3cret" } })
}

describe("POST /api/cron/reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-10T00:00:00Z"))
    // Only the J-day window (2-4h) matches this shift (starts at 03:00 the same day); the other
    // two windows' candidate queries return the same row but it falls outside their bounds.
    registrationFindMany.mockImplementation(async ({ where }: { where: { status: string } }) =>
      where.status === "active" ? [baseReg()] : [],
    )
  })
  afterEach(() => vi.useRealTimers())

  it("counts a refused send as failed and does not mark the reminder sent", async () => {
    sendNotificationMock.mockResolvedValue({ ok: false, reason: "smtp down" })
    const { POST } = await import("@/app/api/cron/reminders/route")
    const res = await POST(post())
    const data = await res.json()
    expect(data.totals.reminder_dd).toEqual({ eligible: 1, sent: 0, failed: 1 })
    expect(registrationUpdate).not.toHaveBeenCalled()
  })

  it("counts a successful send as sent and marks the reminder field", async () => {
    sendNotificationMock.mockResolvedValue({ ok: true })
    const { POST } = await import("@/app/api/cron/reminders/route")
    const res = await POST(post())
    const data = await res.json()
    expect(data.totals.reminder_dd).toEqual({ eligible: 1, sent: 1, failed: 0 })
    expect(registrationUpdate).toHaveBeenCalledWith({ where: { id: "reg-1" }, data: { reminderDdSent: expect.any(Date) } })
  })
})
