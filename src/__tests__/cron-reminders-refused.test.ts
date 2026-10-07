import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// #597: a refused send (SMTP down, mistyped address) must be counted as `failed`, never as
// `sent`, and must not mark the reminder field — otherwise the volunteer never gets a retry
// (manual or via the outbox) because the cron thinks this reminder already went out.
//
// #672: reminders are now grouped by volunteer, event and local day — one email (and one push)
// per group, marking every included registration in the same pass.

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
  outboxHealth: vi.fn().mockResolvedValue({ healthy: true, stuck: false }),
}))
vi.mock("@/lib/token-vault", () => ({ registrationToken: { reveal: (r: { id: string }) => `tok-${r.id}` } }))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))

const registrationUpdateMany = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 0 }))
const registrationFindMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: {
      findMany: registrationFindMany,
      updateMany: registrationUpdateMany,
    },
  },
}))

const shift = (over: Partial<{ startTime: string; label: string; roleName: string }> = {}) => ({
  date: new Date("2026-01-10T00:00:00Z"),
  startTime: over.startTime ?? "03:00",
  endTime: "05:00",
  label: over.label ?? "Accueil",
  roleName: over.roleName ?? "Rôle",
  locationDetails: null,
  contactName: null,
  contactPhone: null,
  instructions: null,
  latitude: null,
  longitude: null,
  status: "open",
})

const event = () => ({
  id: "event-1",
  organizationId: "org-1",
  title: "Fête",
  remindersEnabled: true,
  organization: { name: "Org", slug: "org", timeZone: "UTC", notificationSettings: null },
  latitude: null,
  longitude: null,
})

const baseReg = () => ({
  id: "reg-1",
  eventId: "event-1",
  volunteerId: "vol-1",
  volunteer: { email: "v@x.ch", firstName: "Val" },
  shift: shift(),
  event: event(),
})

function post() {
  return new Request("http://localhost/api/cron/reminders", { method: "POST", headers: { authorization: "Bearer s3cret" } })
}

describe("POST /api/cron/reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registrationUpdateMany.mockResolvedValue({ count: 0 })
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
    expect(data.totals.reminder_dd).toEqual({ eligible: 1, groups: 1, sent: 0, failed: 1 })
    expect(registrationUpdateMany).not.toHaveBeenCalled()
  })

  it("counts a successful send as sent and marks every registration of the group", async () => {
    sendNotificationMock.mockResolvedValue({ ok: true })
    const { POST } = await import("@/app/api/cron/reminders/route")
    const res = await POST(post())
    const data = await res.json()
    expect(data.totals.reminder_dd).toEqual({ eligible: 1, groups: 1, sent: 1, failed: 0 })
    expect(registrationUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ["reg-1"] } }, data: { reminderDdSent: expect.any(Date) } })
  })

  it("sends one email for several shifts of the same volunteer, event and day, and marks all of them", async () => {
    sendNotificationMock.mockResolvedValue({ ok: true })
    const regs = [
      { ...baseReg(), id: "reg-1", shift: shift({ startTime: "03:00", label: "Accueil" }) },
      { ...baseReg(), id: "reg-2", shift: shift({ startTime: "02:30", label: "Bar" }) },
    ]
    registrationFindMany.mockImplementation(async ({ where }: { where: { status: string } }) =>
      where.status === "active" ? regs : [],
    )
    const { POST } = await import("@/app/api/cron/reminders/route")
    const res = await POST(post())
    const data = await res.json()
    expect(data.totals.reminder_dd).toEqual({ eligible: 2, groups: 1, sent: 1, failed: 0 })
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)
    const payload = sendNotificationMock.mock.calls[0][0]
    // Sorted by start: "Bar" (02:30) before "Accueil" (03:00).
    expect(payload.data.shifts.map((s: { label: string }) => s.label)).toEqual(["Bar", "Accueil"])
    expect(registrationUpdateMany).toHaveBeenCalledWith(
      { where: { id: { in: expect.arrayContaining(["reg-1", "reg-2"]) } }, data: { reminderDdSent: expect.any(Date) } },
    )
    expect(registrationUpdateMany.mock.calls[0][0].where.id.in).toHaveLength(2)
  })

  it("does not mark any registration of a group when the send fails (retried as a whole)", async () => {
    sendNotificationMock.mockResolvedValue({ ok: false, reason: "smtp down" })
    const regs = [
      { ...baseReg(), id: "reg-1", shift: shift({ startTime: "03:00" }) },
      { ...baseReg(), id: "reg-2", shift: shift({ startTime: "02:30" }) },
    ]
    registrationFindMany.mockImplementation(async ({ where }: { where: { status: string } }) =>
      where.status === "active" ? regs : [],
    )
    const { POST } = await import("@/app/api/cron/reminders/route")
    await POST(post())
    expect(registrationUpdateMany).not.toHaveBeenCalled()
  })

  it("is idempotent: a re-run with the same registrations (now excluded by the DB query) sends nothing more", async () => {
    sendNotificationMock.mockResolvedValue({ ok: true })
    const { POST } = await import("@/app/api/cron/reminders/route")
    await POST(post())
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)

    // A real re-run's query would no longer return reg-1 (its reminderDdSent is now set): the
    // candidate query returning nothing models that.
    sendNotificationMock.mockClear()
    registrationFindMany.mockImplementation(async () => [])
    const res = await POST(post())
    const data = await res.json()
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect(data.totals.reminder_dd).toEqual({ eligible: 0, groups: 0, sent: 0, failed: 0 })
  })
})
