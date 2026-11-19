import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// #597: a refused send (SMTP down, mistyped address) must be counted as `failed`, never as
// `sent`, and must not mark the reminder field — otherwise the volunteer never gets a retry
// (manual or via the outbox) because the cron thinks this reminder already went out.
//
// #672: reminders are now grouped by volunteer, event and local day — one email (and one push)
// per group, marking every included registration in the same pass.
//
// The group is marked before the send and given back when the send fails
// (src/lib/reminder-claims.ts): a call running at the same time finds it taken and sends nothing.

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
vi.mock("@/lib/token-vault", () => ({
  registrationToken: { reveal: (r: { id: string }) => `tok-${r.id}` },
  // The organisation-wide link of the reminder (#1429, lot B), issued without a key here.
  sealToken: (token: string) => ({ hash: `hash-${token}`, enc: null, legacy: token }),
  revealToken: ({ legacy }: { legacy: string | null }) => legacy,
}))
vi.mock("@/lib/reminder-rules-server", () => ({ queueCustomRuleReminders: vi.fn().mockResolvedValue({ events: 0, rules: 0, eligible: 0, queued: 0, deferred: 0, cancelled: 0, handled: 0, failed: 0 }) }))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))

// Every statement finds its rows free: a claim (one registration per statement) marks its row.
type UpdateManyArgs = { where: { id?: string | { in: string[] }; reminderDdSent?: null }; data: Record<string, Date | null> }
const everyRow = async ({ where }: UpdateManyArgs) => ({ count: typeof where.id === "string" ? 1 : (where.id?.in.length ?? 0) })
const calls = () => registrationUpdateMany.mock.calls.map((c) => c[0] as UpdateManyArgs)
const registrationUpdateMany = vi.hoisted(() => vi.fn())
const registrationFindMany = vi.hoisted(() => vi.fn())
const volunteerFindFirst = vi.hoisted(() => vi.fn())
const volunteerUpdateMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => {
  const prisma = {
    registration: {
      findMany: registrationFindMany,
      updateMany: registrationUpdateMany,
    },
    // The organisation-wide link of the reminder (#1429, lot B): an existing token, no issue.
    volunteer: {
      findFirst: volunteerFindFirst,
      updateMany: volunteerUpdateMany,
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
  }
  // The reminder reads the current address and token in one transaction (#1429, lot B).
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma))
  return { prisma }
})

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
    registrationUpdateMany.mockImplementation(everyRow)
    volunteerFindFirst.mockImplementation(async (args: { select: Record<string, unknown> }) => {
      if ("organization" in args.select) return { organization: { name: "Org" } }
      const tokenRow = { orgLinkTokenHash: "current-hash", orgLinkTokenEnc: null, orgLinkTokenLegacy: "current-token", orgLinkIssuedAt: null }
      // The transactional re-read (#1429, lot B) asks for the address and the token together.
      if ("email" in args.select) return { email: "v@x.ch", ...tokenRow }
      return tokenRow
    })
    volunteerUpdateMany.mockResolvedValue({ count: 1 })
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-10T00:00:00Z"))
    // Only the J-day window (2-4h) matches this shift (starts at 03:00 the same day); the other
    // two windows' candidate queries return the same row but it falls outside their bounds.
    registrationFindMany.mockImplementation(async ({ where }: { where: { status: string } }) =>
      where.status === "active" ? [baseReg()] : [],
    )
  })
  afterEach(() => vi.useRealTimers())

  it("keeps the legacy candidate query for events without any custom rule (#1139)", async () => {
    sendNotificationMock.mockResolvedValue({ ok: true })
    const { POST } = await import("@/app/api/cron/reminders/route")
    await POST(post())
    // An event with a rule row is left to the custom path; no row means exactly the old query.
    expect(registrationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "active",
        event: { remindersEnabled: true, publicStatus: "published", reminderRules: { none: { archivedAt: null } } },
      }),
    }))
  })

  it("asks only for the days around each window, never the whole history", async () => {
    sendNotificationMock.mockResolvedValue({ ok: true })
    const { POST } = await import("@/app/api/cron/reminders/route")
    await POST(post())
    const dates = registrationFindMany.mock.calls
      .map((c) => (c[0] as { where: { status?: string; shift?: { date?: { gte: Date; lte: Date } } } }).where)
      .filter((w) => w.status === "active")
      .map((w) => w.shift?.date)
    // One candidate query per window (J-2, J-1, day-of), each bounded on the shift's stored day.
    expect(dates).toHaveLength(3)
    for (const d of dates) {
      expect(d?.gte).toBeInstanceOf(Date)
      expect(d?.lte).toBeInstanceOf(Date)
      // Five stored days at most: the window's day and two either side.
      expect(d!.lte.getTime() - d!.gte.getTime()).toBeLessThanOrEqual(5 * 86_400_000)
    }
    // "Now" is 2026-01-10T00:00Z: the day-of window (2 to 4 h) looks at the 8th to the 12th.
    expect(dates.map((d) => d!.gte.toISOString().slice(0, 10))).toContain("2026-01-08")
  })

  it("counts a refused send as failed and does not mark the reminder sent", async () => {
    sendNotificationMock.mockResolvedValue({ ok: false, reason: "smtp down" })
    const { POST } = await import("@/app/api/cron/reminders/route")
    const res = await POST(post())
    const data = await res.json()
    expect(data.totals.reminder_dd).toEqual({ eligible: 1, groups: 1, sent: 0, failed: 1 })
    // Claimed, then given back: the field ends empty and the next run retries.
    expect(calls()).toEqual([
      { where: { id: "reg-1", reminderDdSent: null }, data: { reminderDdSent: expect.any(Date) } },
      { where: { id: { in: ["reg-1"] } }, data: { reminderDdSent: null } },
    ])
  })

  it("never sends a token issued now to the old address when it changed after selection (#1429, lot B)", async () => {
    sendNotificationMock.mockResolvedValue({ ok: true })
    // The candidate row was read with v@x.ch; the member has another address by the time the
    // reminder is built, so the token issued for that row must not reach the old inbox.
    volunteerFindFirst.mockImplementation(async (args: { select: Record<string, unknown> }) => {
      if ("organization" in args.select) return { organization: { name: "Org" } }
      const tokenRow = { orgLinkTokenHash: "current-hash", orgLinkTokenEnc: null, orgLinkTokenLegacy: "current-token", orgLinkIssuedAt: null }
      if ("email" in args.select) return { email: "nouvelle@x.ch", ...tokenRow }
      return tokenRow
    })
    const { POST } = await import("@/app/api/cron/reminders/route")
    const res = await POST(post())
    const data = await res.json()
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect(data.totals.reminder_dd).toEqual({ eligible: 1, groups: 1, sent: 0, failed: 0 })
    // Claimed, then given back: a later run writes to the current address.
    expect(calls().at(-1)).toEqual({ where: { id: { in: ["reg-1"] } }, data: { reminderDdSent: null } })
  })

  it("marks the group before the send, so a call running at the same time finds it taken", async () => {
    const order: string[] = []
    registrationUpdateMany.mockImplementation(async (args: UpdateManyArgs) => {
      order.push("claim")
      return everyRow(args)
    })
    sendNotificationMock.mockImplementation(async () => {
      order.push("send")
      return { ok: true }
    })
    const { POST } = await import("@/app/api/cron/reminders/route")
    await POST(post())
    expect(order).toEqual(["claim", "send"])
  })

  it("sends nothing for a group another call already holds, and counts it neither sent nor failed", async () => {
    registrationUpdateMany.mockResolvedValue({ count: 0 })
    const { POST } = await import("@/app/api/cron/reminders/route")
    const res = await POST(post())
    const data = await res.json()
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect(data.totals.reminder_dd).toEqual({ eligible: 1, groups: 1, sent: 0, failed: 0 })
    // Nothing was marked by this call, so nothing is given back.
    expect(registrationUpdateMany).toHaveBeenCalledTimes(1)
  })

  it("gives back its part of a group another call holds in part, and sends nothing", async () => {
    const regs = [
      { ...baseReg(), id: "reg-1", shift: shift({ startTime: "03:00" }) },
      { ...baseReg(), id: "reg-2", shift: shift({ startTime: "02:30" }) },
    ]
    registrationFindMany.mockImplementation(async ({ where }: { where: { status: string } }) =>
      where.status === "active" ? regs : [],
    )
    // The first registration is free, the second is held by another call.
    registrationUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    const { POST } = await import("@/app/api/cron/reminders/route")
    await POST(post())
    expect(sendNotificationMock).not.toHaveBeenCalled()
    const [first, second, release] = calls()
    // Only the row this call marked is given back: the other call's mark is never touched.
    expect(release).toEqual({ where: { id: { in: [first.where.id] } }, data: { reminderDdSent: null } })
    expect(second.where.id).not.toBe(first.where.id)
    expect(registrationUpdateMany).toHaveBeenCalledTimes(3)
  })

  it("gives the group back when the send throws, and lets the error through", async () => {
    sendNotificationMock.mockRejectedValue(new Error("boom"))
    const { POST } = await import("@/app/api/cron/reminders/route")
    await expect(POST(post())).rejects.toThrow("boom")
    expect(calls().at(-1)).toEqual({ where: { id: { in: ["reg-1"] } }, data: { reminderDdSent: null } })
  })

  it("gives the group back when building the email throws, before any send", async () => {
    // A registration without its volunteer: reading the address throws while the payload is built.
    registrationFindMany.mockImplementation(async ({ where }: { where: { status: string } }) =>
      where.status === "active" ? [{ ...baseReg(), volunteer: null }] : [],
    )
    const { POST } = await import("@/app/api/cron/reminders/route")
    await expect(POST(post())).rejects.toThrow()
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect(calls().at(-1)).toEqual({ where: { id: { in: ["reg-1"] } }, data: { reminderDdSent: null } })
  })

  it("counts a successful send as sent and marks every registration of the group", async () => {
    sendNotificationMock.mockResolvedValue({ ok: true })
    const { POST } = await import("@/app/api/cron/reminders/route")
    const res = await POST(post())
    const data = await res.json()
    expect(data.totals.reminder_dd).toEqual({ eligible: 1, groups: 1, sent: 1, failed: 0 })
    expect(calls()).toEqual([{ where: { id: "reg-1", reminderDdSent: null }, data: { reminderDdSent: expect.any(Date) } }])
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
    // One claim per registration, nothing given back.
    expect(calls().map((c) => c.where.id).sort()).toEqual(["reg-1", "reg-2"])
    expect(calls().every((c) => c.where.reminderDdSent === null && c.data.reminderDdSent instanceof Date)).toBe(true)
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
    // Both were claimed, both are given back in one statement.
    const last = calls().at(-1)!
    expect(last.data).toEqual({ reminderDdSent: null })
    expect((last.where.id as { in: string[] }).in.sort()).toEqual(["reg-1", "reg-2"])
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
