import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"

/**
 * No email for a deactivated or deleted organisation (#814), against a real Postgres: only the
 * SMTP channel is mocked, so the send-time check (sendNotification), the outbox claim and the
 * deactivation's cancellation run as in production.
 */

const smtp = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/channels/email", () => ({ emailChannel: { send: smtp } }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { deliverOutbox, enqueueNotifications } from "@/lib/notifications/outbox"
import { sendNotification } from "@/lib/notifications"
import { cancelPendingOutboxForOrganization, ORG_INACTIVE_REASON } from "@/lib/notifications/org-send-guard"

const url = process.env.DATABASE_URL
const tag = `int-org-${Date.now()}`
let n = 0

async function newOrg(): Promise<string> {
  n++
  const org = await prisma.organization.create({ data: { name: `${tag}-${n}`, slug: `${tag}-${n}` } })
  return org.id
}

const payload = (organizationId: string, i: number) => ({
  kind: "registration_confirmation" as const,
  recipient: { email: `${tag}-${i}@example.org` },
  organizationId,
  data: { i },
})

describe.skipIf(!url)("outbox and deactivated organisations on Postgres (#814)", () => {
  const orgIds: string[] = []
  const rowIds: string[] = []

  beforeEach(() => {
    smtp.mockReset().mockResolvedValue({ ok: true })
  })

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { id: { in: rowIds } } })
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
    await prisma.$disconnect()
  })

  it("deactivated between enqueue and send: every email is cancelled, none reaches SMTP", async () => {
    const orgId = await newOrg(); orgIds.push(orgId)
    const ids = await enqueueNotifications([0, 1, 2].map((i) => payload(orgId, i)))
    rowIds.push(...ids)

    await prisma.organization.update({ where: { id: orgId }, data: { active: false } })

    expect(await deliverOutbox({ ids })).toEqual({ sent: 0, retried: 0, failed: 0, cancelled: 3, held: 0 })
    expect(smtp).not.toHaveBeenCalled()
    const rows = await prisma.notificationOutbox.findMany({ where: { id: { in: ids } } })
    expect(rows.every((r) => r.status === "cancelled" && r.lastError === ORG_INACTIVE_REASON && r.claimedAt === null)).toBe(true)
  })

  it("deactivated while a batch is being sent: the rest of the batch is cancelled", async () => {
    const orgId = await newOrg(); orgIds.push(orgId)
    const ids = await enqueueNotifications([10, 11, 12].map((i) => payload(orgId, i)))
    rowIds.push(...ids)
    // The operator deactivates the organisation right after the first email went out.
    smtp.mockImplementationOnce(async () => {
      await prisma.organization.update({ where: { id: orgId }, data: { active: false } })
      return { ok: true }
    })

    expect(await deliverOutbox({ ids })).toEqual({ sent: 1, retried: 0, failed: 0, cancelled: 2, held: 0 })
    expect(smtp).toHaveBeenCalledTimes(1)
  })

  it("a later reactivation never sends the cancelled emails", async () => {
    const orgId = await newOrg(); orgIds.push(orgId)
    const ids = await enqueueNotifications([20, 21].map((i) => payload(orgId, i)))
    rowIds.push(...ids)

    // The deactivation cancels the pending rows in its own transaction.
    await prisma.$transaction(async (tx) => {
      expect(await cancelPendingOutboxForOrganization(tx, orgId)).toBe(2)
      await tx.organization.update({ where: { id: orgId }, data: { active: false } })
    })
    await prisma.organization.update({ where: { id: orgId }, data: { active: true } })

    expect(await deliverOutbox({ ids })).toEqual({ sent: 0, retried: 0, failed: 0, cancelled: 0, held: 0 })
    expect(smtp).not.toHaveBeenCalled()
    const rows = await prisma.notificationOutbox.findMany({ where: { id: { in: ids } } })
    expect(rows.every((r) => r.status === "cancelled")).toBe(true)
  })

  it("an email waiting for a retry is cancelled by the deactivation too", async () => {
    const orgId = await newOrg(); orgIds.push(orgId)
    const [id] = await enqueueNotifications([payload(orgId, 30)])
    rowIds.push(id)
    smtp.mockResolvedValueOnce({ ok: false, reason: "smtp down" })
    expect(await deliverOutbox({ ids: [id] })).toEqual({ sent: 0, retried: 1, failed: 0, cancelled: 0, held: 0 })

    expect(await cancelPendingOutboxForOrganization(prisma, orgId)).toBe(1)
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id } })).status).toBe("cancelled")
  })

  it("an organisation deleted with emails still queued: they are cancelled, not sent", async () => {
    const orgId = await newOrg()
    const ids = await enqueueNotifications([payload(orgId, 40)])
    rowIds.push(...ids)
    await prisma.organization.delete({ where: { id: orgId } })

    expect(await deliverOutbox({ ids })).toEqual({ sent: 0, retried: 0, failed: 0, cancelled: 1, held: 0 })
    expect(smtp).not.toHaveBeenCalled()
  })

  it("a direct send is refused for a deactivated organisation, platform emails still go", async () => {
    const orgId = await newOrg(); orgIds.push(orgId)
    await prisma.organization.update({ where: { id: orgId }, data: { active: false } })

    expect(await sendNotification(payload(orgId, 50))).toMatchObject({ ok: false, blocked: true })
    expect(await sendNotification({ kind: "release_available", recipient: { email: `${tag}-ops@example.org` }, data: {} })).toEqual({ ok: true })
    expect(smtp).toHaveBeenCalledTimes(1)
  })
})
