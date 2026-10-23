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

  it("queues the largest allowed invitation (500 members) in one transaction, within its timeout", async () => {
    const bigEvent = (await prisma.event.create({ data: { organizationId: orgId, slug: "grande", title: "Grande fête", startDate: new Date("2030-07-01"), endDate: new Date("2030-07-01") } })).id
    await prisma.volunteer.createMany({ data: Array.from({ length: 500 }, (_, i) => ({ organizationId: orgId, firstName: `B${i}`, lastName: "L", email: `${tag}-big-${i}@example.org`, active: true })) })
    const ids = (await prisma.volunteer.findMany({ where: { organizationId: orgId, email: { startsWith: `${tag}-big-` } }, select: { id: true } })).map((v) => v.id)
    const started = Date.now()
    const res = await invite(post(`/api/admin/events/${bigEvent}/invitations`, { volunteerIds: ids }), params(bigEvent))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ invitedNew: 500, emailsQueued: 500 })
    expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId } })).toBe(500)
    console.log(`500 invitations queued in ${Date.now() - started} ms`)
  })

  it("cancels a held invitation whose member's address was corrected, and the re-invitation reaches the new address", async () => {
    const ev = (await prisma.event.create({ data: { organizationId: orgId, slug: "adresse", title: "Fête", startDate: new Date("2030-08-01"), endDate: new Date("2030-08-01") } })).id
    const member = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Typo", lastName: "L", email: `${tag}-typo@example.org`, active: true } })
    await invite(post(`/api/admin/events/${ev}/invitations`, { volunteerIds: [member.id] }), params(ev))
    await prisma.volunteer.update({ where: { id: member.id }, data: { email: `${tag}-right@example.org` } })
    // The old row is still pending (held); inviting again a few minutes later queues the new address.
    await prisma.memberInvite.updateMany({ where: { eventId: ev }, data: { sentAt: new Date(Date.now() - 10 * 60 * 1000) } })
    const again = await (await invite(post(`/api/admin/events/${ev}/invitations`, { volunteerIds: [member.id] }), params(ev))).json()
    expect(again).toMatchObject({ emailsQueued: 1, recentlySkipped: 0 })

    smtp.mockResolvedValue({ ok: true })
    // The first test filled this minute's window (in-memory limiter): room for this delivery.
    process.env.EMAIL_LIMIT_ORG_PER_MINUTE = "100000"
    const rows = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } })
    expect(await deliverOutbox({ ids: rows.map((r) => r.id) })).toMatchObject({ sent: 1, cancelled: 1 })
    expect(smtp).toHaveBeenCalledTimes(1)
    expect(smtp.mock.calls[0][0].recipient.email).toBe(`${tag}-right@example.org`)
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: rows[0].id } })).lastError).toBe("member_address_changed")
    delete process.env.EMAIL_LIMIT_ORG_PER_MINUTE
  })

  it("« Renvoyer » refuses a failed invitation email once a newer copy was queued or sent", async () => {
    const { retryOutboxRow } = await import("@/lib/outbox-data")
    const ev = (await prisma.event.create({ data: { organizationId: orgId, slug: "renvoi", title: "Fête", startDate: new Date("2030-09-01"), endDate: new Date("2030-09-01") } })).id
    const member = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Retry", lastName: "L", email: `${tag}-retry@example.org`, active: true } })
    await invite(post(`/api/admin/events/${ev}/invitations`, { volunteerIds: [member.id] }), params(ev))
    const [first] = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId } })
    await prisma.notificationOutbox.update({ where: { id: first.id }, data: { status: "failed", lastError: "smtp:temporary" } })
    // Alone, the failed copy can be put back.
    expect(await retryOutboxRow(first.id, orgId)).toBe(true)
    await prisma.notificationOutbox.update({ where: { id: first.id }, data: { status: "failed", lastError: "smtp:temporary" } })
    // A newer copy queued later (a re-invitation past the 5 minutes): the failed one stays failed.
    await prisma.memberInvite.updateMany({ where: { eventId: ev }, data: { sentAt: new Date(Date.now() - 10 * 60 * 1000) } })
    await invite(post(`/api/admin/events/${ev}/invitations`, { volunteerIds: [member.id] }), params(ev))
    expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId } })).toBe(2)
    expect(await retryOutboxRow(first.id, orgId)).toBe(false)
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("failed")

    // Both copies failed: the first « Renvoyer » wins, the second is refused while the first waits,
    // and still refused once the first has gone out.
    const second = (await prisma.notificationOutbox.findMany({ where: { organizationId: orgId, id: { not: first.id } } }))[0]
    await prisma.notificationOutbox.update({ where: { id: second.id }, data: { status: "failed", lastError: "smtp:temporary" } })
    expect(await retryOutboxRow(first.id, orgId)).toBe(true)
    expect(await retryOutboxRow(second.id, orgId)).toBe(false)
    await prisma.notificationOutbox.update({ where: { id: first.id }, data: { status: "sent", sentAt: new Date() } })
    expect(await retryOutboxRow(second.id, orgId)).toBe(false)
    // Concurrent retries of two failed copies: exactly one is put back.
    await prisma.notificationOutbox.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { status: "failed", lastError: "smtp:temporary", sentAt: null } })
    const both = await Promise.all([retryOutboxRow(first.id, orgId), retryOutboxRow(second.id, orgId)])
    expect(both.filter(Boolean)).toHaveLength(1)
  })

  it("« Renvoyer » of a failed copy and a new invitation at the same instant: one copy, never two", async () => {
    const { retryOutboxRow } = await import("@/lib/outbox-data")
    const ev = (await prisma.event.create({ data: { organizationId: orgId, slug: "course", title: "Fête", startDate: new Date("2030-11-01"), endDate: new Date("2030-11-01") } })).id
    const member = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Race", lastName: "L", email: `${tag}-race@example.org`, active: true } })
    await invite(post(`/api/admin/events/${ev}/invitations`, { volunteerIds: [member.id] }), params(ev))
    const [a] = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId } })
    await prisma.notificationOutbox.update({ where: { id: a.id }, data: { status: "failed", lastError: "smtp:temporary" } })
    await prisma.memberInvite.updateMany({ where: { eventId: ev }, data: { sentAt: new Date(Date.now() - 10 * 60 * 1000) } })
    for (let round = 0; round < 5; round++) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId, id: { not: a.id } } })
      await prisma.notificationOutbox.update({ where: { id: a.id }, data: { status: "failed" } })
      await prisma.memberInvite.updateMany({ where: { eventId: ev }, data: { lastRemindedAt: null } })
      await Promise.all([retryOutboxRow(a.id, orgId), invite(post(`/api/admin/events/${ev}/invitations`, { volunteerIds: [member.id] }), params(ev))])
      expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId, status: { in: ["pending", "sending"] } } })).toBe(1)
    }
  })

  it("« Renvoyer » still works for a later copy when an older one went out before it was queued", async () => {
    const { retryOutboxRow } = await import("@/lib/outbox-data")
    const ev = (await prisma.event.create({ data: { organizationId: orgId, slug: "ancien", title: "Fête", startDate: new Date("2030-10-01"), endDate: new Date("2030-10-01") } })).id
    const member = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Old", lastName: "L", email: `${tag}-old@example.org`, active: true } })
    await invite(post(`/api/admin/events/${ev}/invitations`, { volunteerIds: [member.id] }), params(ev))
    const [old] = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId } })
    await prisma.notificationOutbox.update({ where: { id: old.id }, data: { status: "sent", sentAt: new Date(Date.now() - 1000) } })
    await prisma.memberInvite.updateMany({ where: { eventId: ev }, data: { sentAt: new Date(Date.now() - 10 * 60 * 1000) } })
    await invite(post(`/api/admin/events/${ev}/invitations`, { volunteerIds: [member.id] }), params(ev))
    const later = (await prisma.notificationOutbox.findMany({ where: { organizationId: orgId, id: { not: old.id } } }))[0]
    await prisma.notificationOutbox.update({ where: { id: later.id }, data: { status: "failed", lastError: "smtp:temporary" } })
    expect(await retryOutboxRow(later.id, orgId)).toBe(true)
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
