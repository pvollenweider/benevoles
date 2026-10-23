import { describe, it, expect, afterAll, afterEach, vi } from "vitest"

/**
 * #811 / #1114 with ORG_INACTIVITY=on against a real Postgres: each of the three messages is
 * queued once and confirmed when the relay accepts a copy (the confirmation outlives the purge of
 * sent rows), no step starts before the previous one is confirmed, the deactivation comes 15 full
 * days after the last one and not before the first + 75 days, an unconfirmed step blocks the
 * procedure (one operator alert), a « Conserver » click cancels the queued reminder, and an older
 * procedure without steps is left for manual handling. Nothing is ever erased.
 *
 * Only `Date` is faked, set to each simulated night (02:00 UTC): send times, confirmations and
 * decisions then all use the same clock, whatever the time the test runs at.
 */

// Emails deliver after the response (`after`), which needs a request: delivered by hand here.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }))
const alerts = vi.hoisted(() => ({ notifyOperator: vi.fn(async (alert: { key: string; message: string }) => { void alert }) }))
vi.mock("@/lib/operator-alerts", () => alerts)

import { prisma } from "@/lib/prisma"
import { deliverOutbox, openPayload } from "@/lib/notifications/outbox"
import { runInactivityProcedure } from "@/lib/org-inactivity-procedure"
import { POST as keep } from "@/app/api/public/org-keep/route"

const url = process.env.DATABASE_URL
const tag = `int-inact-on-${Date.now()}`
const DAY = 86_400_000
// Tomorrow 02:00 UTC, the nightly cleanup's time: never before the rows' real `nextAttemptAt`.
const real = new Date()
const start = new Date(Date.UTC(real.getUTCFullYear(), real.getUTCMonth(), real.getUTCDate() + 1, 2, 0, 0))
const at = (days: number, seconds = 0) => new Date(start.getTime() + days * DAY + seconds * 1000)

describe.skipIf(!url)("periodic check, ORG_INACTIVITY=on, on Postgres (#811, #1114)", () => {
  const ids: string[] = []

  afterEach(() => { vi.useRealTimers(); alerts.notifyOperator.mockClear() })

  afterAll(async () => {
    vi.useRealTimers()
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ organizationId: { in: ids } }, ...ids.map((id) => ({ dedupeKey: { contains: id } }))] } })
    await prisma.adminUser.deleteMany({ where: { organizationId: { in: ids } } })
    await prisma.organization.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
  })

  /** Sets the clock to `when`, then runs the night. */
  async function night(when: Date, orgId: string) {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(when)
    return runInactivityProcedure(when, [orgId])
  }

  /** Payloads delivered, kept here: the sent rows are purged right after. */
  const delivered: ReturnType<typeof openPayload>[] = []

  /** Delivers the organisation's waiting copies a few seconds later, then purges sent rows like the cleanup. */
  async function deliver(orgId: string, when: Date) {
    vi.setSystemTime(new Date(when.getTime() + 5_000))
    const rows = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId, status: "pending" }, select: { id: true, payload: true } })
    delivered.push(...rows.map((r) => openPayload(r.payload)))
    await deliverOutbox({ ids: rows.map((r) => r.id), now: new Date() })
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId, status: "sent" } })
  }

  async function emailsOf(orgId: string) {
    const rows = await prisma.notificationOutbox.findMany({ where: { OR: [{ organizationId: orgId }, { dedupeKey: { contains: orgId } }] }, orderBy: { createdAt: "asc" } })
    return rows.map((row) => ({ row, payload: openPayload(row.payload) }))
  }

  const steps = (orgId: string) => prisma.orgInactivityStep.findMany({ where: { organizationId: orgId }, orderBy: { queuedAt: "asc" } })

  async function space(suffix: string, admins = 1) {
    const org = await prisma.organization.create({ data: { name: `Comité ${tag} ${suffix}`, slug: `${tag}-${suffix}`, lastMeaningfulActivityAt: new Date("2024-01-01T00:00:00Z"), timeZone: "Europe/Zurich" } })
    ids.push(org.id)
    const emails: string[] = []
    for (let i = 0; i < admins; i++) {
      const email = `${tag}-${suffix}-${i}@example.org`
      emails.push(email)
      await prisma.adminUser.create({ data: { email, name: "Julie", passwordHash: "x", role: "admin", isActive: true, organizationId: org.id } })
    }
    return { org, email: emails[0], emails }
  }

  it("sends three confirmed messages in order, then deactivates after the announced day, and erases nothing", async () => {
    const { org } = await space("idle")

    expect(await night(at(0), org.id)).toMatchObject({ first: 1 })
    let state = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(state).toMatchObject({ inactivityNoticeAt: at(0), active: true })
    const planned = state.inactivityPlannedAt!
    // Midnight in Zurich after the first email + 75 days; the keep link is valid until then.
    expect(planned.getTime()).toBeGreaterThanOrEqual(at(75).getTime())
    expect(planned.getTime()).toBeLessThan(at(76).getTime())
    expect((await prisma.orgKeepLink.findFirstOrThrow({ where: { organizationId: org.id } })).expiresAt).toEqual(planned)

    // Queued is not sent: no confirmation before the relay accepts the copy.
    expect((await steps(org.id))[0].confirmedAt).toBeNull()
    await deliver(org.id, at(0))
    // Confirmed durably, though the sent row itself is gone.
    expect((await steps(org.id))[0].confirmedAt).toEqual(at(0, 5))
    expect(await prisma.notificationOutbox.count({ where: { organizationId: org.id, status: "sent" } })).toBe(0)

    expect(await night(at(1), org.id)).toMatchObject({ first: 0, second: 0 })
    expect(await night(at(29), org.id)).toMatchObject({ second: 0 })
    expect(await night(at(30, -3), org.id)).toMatchObject({ second: 1 })
    await deliver(org.id, at(30, -3))
    expect(await night(at(60, 2), org.id)).toMatchObject({ last: 1 })
    await deliver(org.id, at(60, 2))
    expect((await steps(org.id)).map((s) => [s.step, s.confirmedAt !== null])).toEqual([["first", true], ["second", true], ["last", true]])
    expect(await prisma.orgKeepLink.count({ where: { organizationId: org.id } })).toBe(3)

    // The planned date did not move: every email gave the same last day.
    const notices = delivered.filter((p) => p.organizationId === org.id && p.kind === "org_inactivity_notice").map((p) => p.data as { step: string; deactivationOn: string; previousSentOn: string | null; previousDeactivationOn: string | null })
    expect(notices.map((d) => d.step)).toEqual(["first", "second", "last"])
    expect(new Set(notices.map((d) => d.deactivationOn)).size).toBe(1)
    expect(notices.map((d) => d.previousDeactivationOn)).toEqual([null, null, null])
    // Each reminder dates the previous message instead of « a month ago ».
    expect(notices[1].previousSentOn).toBe(at(0).toLocaleDateString("fr-FR", { timeZone: "Europe/Zurich", day: "numeric", month: "long", year: "numeric" }))
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).inactivityPlannedAt).toEqual(planned)

    // Not on the 75th night (still the announced day in Zurich), the night after.
    expect(await night(at(75), org.id)).toMatchObject({ deactivated: 0 })
    expect(await night(at(76), org.id)).toMatchObject({ deactivated: 1 })
    state = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(state).toMatchObject({ active: false, inactivityDeactivatedAt: at(76), inactivityNoticeAt: null, inactivityPlannedAt: null })
    expect(await prisma.orgKeepLink.count({ where: { organizationId: org.id } })).toBe(0)
    expect(await steps(org.id)).toEqual([])
    const last = (await emailsOf(org.id)).at(-1)!
    expect(last.payload.kind).toBe("org_inactivity_deactivated")
    expect(last.row.organizationId).toBeNull()
    expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.deactivated_for_inactivity" } })).toBe(1)
  })

  it("never starts the next step nor deactivates while a step is unconfirmed, and alerts once", async () => {
    const { org } = await space("held")
    await night(at(0), org.id)
    // The copy is never sent (held, then failed): no second reminder, ever, and no deactivation.
    await prisma.notificationOutbox.updateMany({ where: { organizationId: org.id }, data: { status: "failed" } })
    expect(await night(at(1), org.id)).toMatchObject({ blocked: 1 })
    expect(await night(at(31), org.id)).toMatchObject({ second: 0, blocked: 1 })
    expect(await night(at(90), org.id)).toMatchObject({ last: 0, deactivated: 0, blocked: 1 })
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).active).toBe(true)
    expect(await steps(org.id)).toHaveLength(1)
    // One alert for the block, not one per night.
    const blockedAlerts = alerts.notifyOperator.mock.calls.filter(([a]) => a.key.startsWith("inactivity-blocked:"))
    expect(blockedAlerts).toHaveLength(1)
    expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.inactivity_check_blocked" } })).toBe(1)
  })

  it("is confirmed by one administrator's copy, and never sends to an administrator removed meanwhile", async () => {
    const { org, emails } = await space("team", 2)
    await night(at(0), org.id)
    // One administrator leaves before the delivery: their copy is cancelled, the other one confirms.
    await prisma.adminUser.updateMany({ where: { email: emails[1] }, data: { isActive: false } })
    await deliver(org.id, at(0))
    expect((await steps(org.id))[0].confirmedAt).not.toBeNull()
    const copies = await prisma.notificationOutbox.findMany({ where: { organizationId: org.id } })
    expect(copies.map((c) => [openPayload(c.payload).recipient.email, c.status])).toEqual([[emails[1], "cancelled"]])
    // An administrator added later gets the current step once; after its confirmation, nothing more.
    const late = `${tag}-team-late@example.org`
    await prisma.adminUser.create({ data: { email: late, name: "Paul", passwordHash: "x", role: "admin", isActive: true, organizationId: org.id } })
    expect(await night(at(30), org.id)).toMatchObject({ second: 1 })
    const second = (await emailsOf(org.id)).filter(({ payload }) => (payload.data as { step?: string }).step === "second")
    expect(second.map(({ payload }) => payload.recipient.email).sort()).toEqual([emails[0], late].sort())
  })

  it("stops when an administrator presses « Conserver mon organisation », cancelling the queued reminder", async () => {
    const { org } = await space("kept")
    await night(at(0), org.id)
    await deliver(org.id, at(0))
    await night(at(30), org.id)
    // The second reminder is still queued (the first one's row was purged once sent) when its link is used.
    vi.useRealTimers()
    const all = await prisma.notificationOutbox.findMany({ where: { organizationId: org.id } })
    expect(all.map((r) => [(openPayload(r.payload).data as { step: string }).step, r.status])).toEqual([["second", "pending"]])
    const secret = new URL((openPayload(all[0].payload).data as { keepUrl: string }).keepUrl).searchParams.get("token")!
    const res = await keep(new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": tag }, body: JSON.stringify({ token: secret }) }))
    expect(res.status).toBe(200)
    const state = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(state).toMatchObject({ inactivityNoticeAt: null, inactivityEmailsSent: 0, inactivityPlannedAt: null, active: true })
    expect(state.lastRetentionConfirmedAt).not.toBeNull()
    expect(await prisma.orgKeepLink.count({ where: { organizationId: org.id } })).toBe(0)
    expect(await steps(org.id)).toEqual([])
    expect((await prisma.notificationOutbox.findFirstOrThrow({ where: { organizationId: org.id } })).status).toBe("cancelled")

    // The next nights do nothing: the 18 months start over from the answer.
    expect(await night(at(90), org.id)).toMatchObject({ first: 0, deactivated: 0 })
  })

  it("stops when the space is used again during the procedure", async () => {
    const { org } = await space("busy")
    await night(at(0), org.id)
    await prisma.organization.update({ where: { id: org.id }, data: { lastMeaningfulActivityAt: at(5) } })
    expect(await night(at(6), org.id)).toMatchObject({ stopped: 1 })
    expect(await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ inactivityNoticeAt: null, inactivityPlannedAt: null, active: true })
    expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.inactivity_check_stopped" } })).toBe(1)
  })

  it("leaves a procedure started before the steps existed for manual handling: no restart, no deactivation", async () => {
    const { org } = await space("legacy")
    await prisma.organization.update({ where: { id: org.id }, data: { inactivityNoticeAt: at(0), inactivityEmailsSent: 3 } })
    expect(await night(at(100), org.id)).toMatchObject({ first: 0, deactivated: 0, blocked: 1 })
    const state = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(state).toMatchObject({ active: true, inactivityNoticeAt: at(0) })
    expect(state.inactivityBlockedAt).not.toBeNull()
    expect(state.inactivityPlannedAt!.getTime()).toBeGreaterThanOrEqual(at(75).getTime())
    expect(await emailsOf(org.id)).toEqual([])
  })
})
