// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"

/**
 * Invitations and their reminders through the outbox (#1105), against a real Postgres: only SMTP
 * and the session are mocked. The production incident: 150 invitees reminded at once, the first
 * 120 accepted and the rest failed for good over the per-minute limit. Now they are held and leave
 * later, and the 48 h rule plus the claim keep two reminders from emailing anyone twice.
 */

const smtp = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/channels/email", () => ({ emailChannel: { send: smtp } }))
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }))
const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { linkToken } from "@/lib/token-vault"
import { deliverOutbox, openPayload } from "@/lib/notifications/outbox"
import { POST as remind } from "@/app/api/admin/events/[id]/invitations/remind/route"
import { POST as invite } from "@/app/api/admin/events/[id]/invitations/route"

const url = process.env.DATABASE_URL
const tag = `int-inv-${Date.now()}`
const COUNT = 150
const DAY = 24 * 60 * 60 * 1000

describe.skipIf(!url)("invitations and reminders through the outbox (#1105)", () => {
  let orgId = ""
  let eventId = ""
  let otherEventId = ""
  const volunteerIds: string[] = []

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org invitations", slug: `${tag}-org`, outboundEmailApprovedAt: new Date() } })
    orgId = org.id
    const mk = (slug: string) => prisma.event.create({ data: { organizationId: orgId, slug, title: "Fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-01") } })
    eventId = (await mk("fete")).id
    otherEventId = (await mk("autre")).id
    for (let i = 0; i < COUNT; i++) {
      const v = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: `M${i}`, lastName: "L", email: `${tag}-${i}@example.org`, active: true } })
      volunteerIds.push(v.id)
    }
    requireOrgSessionMock.mockResolvedValue({ db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "adm-test", name: "Admin" } } })
  })

  afterEach(async () => {
    smtp.mockReset()
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.rateLimit.deleteMany({ where: { key: { contains: orgId } } })
      await prisma.organization.deleteMany({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  const post = (path: string, body: unknown = {}) =>
    new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const params = (id: string) => ({ params: Promise.resolve({ id }) })

  it(`reminds ${COUNT} invitees over the per-minute limit: queued, the extra ones held, none failed, none twice`, async () => {
    smtp.mockResolvedValue({ ok: true })
    // Invited three days ago, no answer.
    await prisma.memberInvite.createMany({
      data: volunteerIds.map((volunteerId, i) => ({ eventId, volunteerId, sentAt: new Date(Date.now() - 3 * DAY), ...linkToken.data(`${tag}-tok-${i}`) })),
    })

    // A double click: two reminders at the same instant.
    const [a, b] = await Promise.all([remind(post(`/api/admin/events/${eventId}/invitations/remind`), params(eventId)), remind(post(`/api/admin/events/${eventId}/invitations/remind`), params(eventId))])
    const [ra, rb] = [await a.json(), await b.json()]
    expect(ra.queued + rb.queued).toBe(COUNT)
    expect(ra.recentlySkipped + rb.recentlySkipped).toBe(COUNT)

    const rows = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId } })
    expect(rows).toHaveLength(COUNT)
    const payloads = rows.map((r) => openPayload(r.payload))
    expect(new Set(payloads.map((p) => p.recipient.email)).size).toBe(COUNT)
    expect(payloads.every((p) => p.kind === "member_invite" && typeof p.data.token === "string" && p.data.token.startsWith(`${tag}-tok-`))).toBe(true)

    // Delivery: the first 120 of the minute go, the rest wait (pending, no attempt), nothing fails.
    const delivered = await deliverOutbox({ ids: rows.map((r) => r.id), limit: 500 })
    expect(delivered).toMatchObject({ sent: 120, held: COUNT - 120, failed: 0, retried: 0 })
    expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId, status: "failed" } })).toBe(0)
    expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId, status: "pending", attempts: 0 } })).toBe(COUNT - 120)

    // One log entry per batch, with its count.
    const logs = await prisma.eventLog.findMany({ where: { eventId, action: "memberinvite.reminded" } })
    expect(logs).toHaveLength(1)
    expect(logs[0].changes).toMatchObject({ recipients: { to: COUNT } })

    // A third reminder right after: everyone was reminded less than 48 h ago.
    const again = await (await remind(post(`/api/admin/events/${eventId}/invitations/remind`), params(eventId))).json()
    expect(again).toMatchObject({ queued: 0, recentlySkipped: COUNT })
    expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId } })).toBe(COUNT)
  })

  it("invites members through the outbox and does not re-send to someone invited a minute ago", async () => {
    smtp.mockResolvedValue({ ok: true })
    const ids = volunteerIds.slice(0, 3)
    const first = await (await invite(post(`/api/admin/events/${otherEventId}/invitations`, { volunteerIds: ids }), params(otherEventId))).json()
    expect(first).toMatchObject({ invitedNew: 3, emailsQueued: 3, recentlySkipped: 0 })
    const second = await (await invite(post(`/api/admin/events/${otherEventId}/invitations`, { volunteerIds: ids }), params(otherEventId))).json()
    expect(second).toMatchObject({ invitedNew: 0, skippedExisting: 3, emailsQueued: 0, recentlySkipped: 3 })
    expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId } })).toBe(3)
    // Invited a moment ago: a reminder now skips them too.
    const r = await (await remind(post(`/api/admin/events/${otherEventId}/invitations/remind`), params(otherEventId))).json()
    expect(r).toMatchObject({ queued: 0, recentlySkipped: 3 })
  })
})
