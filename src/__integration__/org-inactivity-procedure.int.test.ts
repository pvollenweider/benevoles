import { describe, it, expect, afterAll, vi } from "vitest"

/**
 * #811 with ORG_INACTIVITY=on against a real Postgres: an idle space gets the first email (one
 * « Conserver » link per administrator), the reminders at +30 and +60 days, and is deactivated at
 * +75 days with its links deleted and a deactivation email sent without an organisation; a
 * « Conserver » click stops the procedure; nothing is ever erased.
 */

// Emails deliver after the response (`after`), which needs a request: nothing to deliver here.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }))
vi.mock("@/lib/operator-alerts", () => ({ notifyOperator: vi.fn(async () => {}) }))

import { prisma } from "@/lib/prisma"
import { openPayload } from "@/lib/notifications/outbox"
import { runInactivityProcedure } from "@/lib/org-inactivity-procedure"
import { POST as keep } from "@/app/api/public/org-keep/route"

const url = process.env.DATABASE_URL
const tag = `int-inact-on-${Date.now()}`
const DAY = 86_400_000

describe.skipIf(!url)("periodic check, ORG_INACTIVITY=on, on Postgres (#811)", () => {
  const ids: string[] = []

  afterAll(async () => {
    const rows = await prisma.notificationOutbox.findMany({ where: { createdAt: { gte: new Date(Date.now() - 3_600_000) } } })
    const mine = rows.filter((r) => openPayload(r.payload).recipient.email?.startsWith(tag)).map((r) => r.id)
    await prisma.notificationOutbox.deleteMany({ where: { id: { in: mine } } })
    await prisma.adminUser.deleteMany({ where: { organizationId: { in: ids } } })
    await prisma.organization.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
  })

  async function emailsTo(email: string) {
    const rows = await prisma.notificationOutbox.findMany({ where: { createdAt: { gte: new Date(Date.now() - 3_600_000) } }, orderBy: { createdAt: "asc" } })
    return rows.map((row) => ({ row, payload: openPayload(row.payload) })).filter(({ payload }) => payload.recipient.email === email)
  }

  async function space(suffix: string) {
    const org = await prisma.organization.create({ data: { name: `Comité ${tag} ${suffix}`, slug: `${tag}-${suffix}`, lastMeaningfulActivityAt: new Date("2024-01-01T00:00:00Z") } })
    ids.push(org.id)
    const email = `${tag}-${suffix}@example.org`
    await prisma.adminUser.create({ data: { email, name: "Julie", passwordHash: "x", role: "admin", isActive: true, organizationId: org.id } })
    return { org, email }
  }

  it("emails three times, then deactivates without an answer, and erases nothing", async () => {
    const { org, email } = await space("idle")
    const start = new Date("2026-10-11T02:00:00Z")
    const at = (days: number) => new Date(start.getTime() + days * DAY)

    expect(await runInactivityProcedure(start, [org.id])).toMatchObject({ first: 1 })
    let state = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(state).toMatchObject({ inactivityNoticeAt: start, inactivityEmailsSent: 1, active: true })
    expect(await prisma.orgKeepLink.count({ where: { organizationId: org.id } })).toBe(1)

    // Nothing more the next night.
    expect(await runInactivityProcedure(at(1), [org.id])).toMatchObject({ first: 0, second: 0 })
    expect(await runInactivityProcedure(at(30), [org.id])).toMatchObject({ second: 1 })
    expect(await runInactivityProcedure(at(60), [org.id])).toMatchObject({ last: 1 })
    expect((await emailsTo(email)).map(({ payload }) => (payload.data as { step: string }).step)).toEqual(["first", "second", "last"])
    expect(await prisma.orgKeepLink.count({ where: { organizationId: org.id } })).toBe(3)

    expect(await runInactivityProcedure(at(75), [org.id])).toMatchObject({ deactivated: 1 })
    state = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(state).toMatchObject({ active: false, inactivityDeactivatedAt: at(75), inactivityNoticeAt: null })
    expect(await prisma.orgKeepLink.count({ where: { organizationId: org.id } })).toBe(0)
    const last = (await emailsTo(email)).at(-1)!
    expect(last.payload.kind).toBe("org_inactivity_deactivated")
    expect(last.row.organizationId).toBeNull()
    expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.deactivated_for_inactivity" } })).toBe(1)
  })

  it("stops when an administrator presses « Conserver mon organisation »", async () => {
    const { org, email } = await space("kept")
    const start = new Date("2026-10-11T02:00:00Z")
    await runInactivityProcedure(start, [org.id])
    const [{ payload }] = await emailsTo(email)
    const secret = new URL((payload.data as { keepUrl: string }).keepUrl).searchParams.get("token")!

    const res = await keep(new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": tag }, body: JSON.stringify({ token: secret }) }))
    expect(res.status).toBe(200)
    const state = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(state).toMatchObject({ inactivityNoticeAt: null, inactivityEmailsSent: 0, active: true })
    expect(state.lastRetentionConfirmedAt).not.toBeNull()
    expect(await prisma.orgKeepLink.count({ where: { organizationId: org.id } })).toBe(0)

    // The next nights do nothing: the 18 months start over from the answer.
    expect(await runInactivityProcedure(new Date(start.getTime() + 75 * DAY), [org.id])).toMatchObject({ first: 0, deactivated: 0 })
  })

  it("stops when the space is used again during the procedure", async () => {
    const { org } = await space("busy")
    const start = new Date("2026-10-11T02:00:00Z")
    await runInactivityProcedure(start, [org.id])
    await prisma.organization.update({ where: { id: org.id }, data: { lastMeaningfulActivityAt: new Date(start.getTime() + 5 * DAY) } })
    expect(await runInactivityProcedure(new Date(start.getTime() + 6 * DAY), [org.id])).toMatchObject({ stopped: 1 })
    expect(await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ inactivityNoticeAt: null, active: true })
    expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.inactivity_check_stopped" } })).toBe(1)
  })
})
