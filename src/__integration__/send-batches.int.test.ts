import { describe, it, expect, vi, afterAll, afterEach } from "vitest"

/**
 * Bulk send history (#1101) against a real Postgres, only SMTP mocked: a batch is recorded with
 * its emails and its organisation log entry in one transaction, and its live summary tells the
 * emails a sending limit held back, then let go.
 */

const smtp = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/channels/email", () => ({ emailChannel: { send: smtp } }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { deliverOutbox, enqueueBatch } from "@/lib/notifications/outbox"
import { loadSendBatches } from "@/lib/send-batches-data"

const url = process.env.DATABASE_URL
const tag = `int-batch-${Date.now()}`

describe.skipIf(!url)("bulk send history on Postgres (#1101)", () => {
  let orgId = ""

  afterEach(() => { delete process.env.EMAIL_LIMIT_ORG_PER_MINUTE })
  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.emailLimitHit.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.deleteMany({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  it("records one batch with its emails and log entry, and follows its delivery through a limit", async () => {
    smtp.mockReset().mockResolvedValue({ ok: true })
    orgId = (await prisma.organization.create({ data: { name: tag, slug: tag } })).id
    const event = await prisma.event.create({ data: { organizationId: orgId, slug: "fete", title: "Fête", startDate: new Date("2026-12-01"), endDate: new Date("2026-12-01") } })
    const admin = await prisma.adminUser.create({ data: { organizationId: orgId, email: `${tag}@example.org`, name: "Marie Admin", role: "admin", passwordHash: "x" } })
    const payloads = [0, 1, 2].map((i) => ({ kind: "member_invite" as const, recipient: { email: `${tag}-${i}@example.org` }, organizationId: orgId, data: { i } }))
    const withoutAddress = { kind: "member_invite" as const, recipient: { email: "" }, organizationId: orgId, data: {} }

    // Through the organisation-scoped client, as the routes do.
    const db = getOrgClient(orgId)
    const ids = await db.$transaction((tx) => enqueueBatch([...payloads, withoutAddress], tx, { organizationId: orgId, batch: { kind: "member_invite", eventId: event.id, actorId: admin.id } }))
    expect(ids).toHaveLength(3)
    const [batch] = await prisma.sendBatch.findMany({ where: { organizationId: orgId } })
    expect(batch).toMatchObject({ kind: "member_invite", eventId: event.id, actorId: admin.id, recipientCount: 3 })
    expect(await prisma.notificationOutbox.count({ where: { sendBatchId: batch.id } })).toBe(3)
    expect(await prisma.orgLog.findMany({ where: { organizationId: orgId, entityType: "SendBatch" } })).toMatchObject([{ action: "sendbatch.queued", entityId: batch.id, actorId: admin.id }])

    // Nothing to queue (no address): no batch, no entry.
    expect(await db.$transaction((tx) => enqueueBatch([withoutAddress], tx, { organizationId: orgId, batch: { kind: "manual_reminder", eventId: event.id, actorId: admin.id } }))).toEqual([])
    expect(await prisma.sendBatch.count({ where: { organizationId: orgId } })).toBe(1)

    // One a minute: one goes, two are held.
    process.env.EMAIL_LIMIT_ORG_PER_MINUTE = "1"
    const now = new Date()
    expect(await deliverOutbox({ ids, now })).toMatchObject({ sent: 1, held: 2 })
    let [view] = await loadSendBatches(orgId, { eventId: event.id })
    expect(view).toMatchObject({ kindLabel: "Invitations", eventTitle: "Fête", actorLabel: "Marie Admin", deliveryLabel: "1 envoyé, 2 en attente" })
    expect(view.delivery).toMatchObject({ recipients: 3, sent: 1, pending: 2, heldNow: 2 })
    expect(view.heldSentence).toMatch(/^2 emails attendent leur tour à cause du plafond d'envoi/)

    // Room again: they leave, and the batch says they waited first.
    process.env.EMAIL_LIMIT_ORG_PER_MINUTE = "10"
    expect((await deliverOutbox({ ids, now: new Date(Date.now() + 5 * 60_000) })).sent).toBe(2)
    ;[view] = await loadSendBatches(orgId, { ids: [batch.id] })
    expect(view.delivery).toMatchObject({ sent: 3, heldSent: 2, pending: 0, heldNow: 0 })
    expect(view.heldSentence).toMatch(/^2 emails ont attendu jusqu'à .+ avant de partir, à cause du plafond d'envoi\.$/)

    // The record never decides whether emails go (savepoints): a batch that cannot be written
    // (here an event that does not exist) leaves the send as it was, outside any batch.
    const lone = { kind: "member_invite" as const, recipient: { email: `${tag}-lone@example.org` }, organizationId: orgId, data: {} }
    const loneIds = await db.$transaction((tx) => enqueueBatch([lone], tx, { organizationId: orgId, batch: { kind: "member_invite", eventId: "missing-event", actorId: admin.id } }))
    expect(loneIds).toHaveLength(1)
    expect(await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: loneIds[0] } })).toMatchObject({ sendBatchId: null, status: "pending" })
    expect(await prisma.sendBatch.count({ where: { organizationId: orgId } })).toBe(1)

    // Another organisation sees none of it.
    expect(await loadSendBatches("other-org", { ids: [batch.id] })).toEqual([])
  })
})
