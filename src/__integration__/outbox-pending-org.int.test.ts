import { describe, it, expect, vi, afterAll } from "vitest"

/**
 * An organisation awaiting validation (#810) emails only its own administrators, against a real
 * Postgres; only SMTP is mocked.
 */

const smtp = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/channels/email", () => ({ emailChannel: { send: smtp } }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { deliverOutbox, enqueueNotifications } from "@/lib/notifications/outbox"

const url = process.env.DATABASE_URL
const tag = `int-pending-${Date.now()}`

describe.skipIf(!url)("pending organisation on Postgres (#810)", () => {
  let orgId = ""
  const rowIds: string[] = []

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { id: { in: rowIds } } })
    if (orgId) {
      await prisma.adminUser.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.deleteMany({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  it("sends to its administrators, cancels the rest, then sends to anyone once approved", async () => {
    smtp.mockReset().mockResolvedValue({ ok: true })
    const org = await prisma.organization.create({
      // As the self-service sign-up will: both grants explicitly null.
      data: { name: tag, slug: tag, publicationApprovedAt: null, outboundEmailApprovedAt: null, admins: { create: { email: `${tag}-owner@example.org`, name: "Owner", passwordHash: "x", role: "admin" } } },
    })
    orgId = org.id
    const payload = (email: string) => ({ kind: "registration_confirmation" as const, recipient: { email }, organizationId: orgId, data: {} })
    const ids = await enqueueNotifications([payload(`${tag}-OWNER@example.org`), payload(`${tag}-volunteer@example.org`)])
    rowIds.push(...ids)

    expect(await deliverOutbox({ ids })).toEqual({ sent: 1, retried: 0, failed: 0, cancelled: 1, held: 0 })

    // Security review of #821: an invited, not yet active account does not open the door.
    await prisma.adminUser.create({ data: { organizationId: orgId, email: `${tag}-invited@example.org`, name: "Invited", passwordHash: "x", role: "organizer", isActive: false } })
    const [invite] = await enqueueNotifications([{ kind: "admin_invite" as const, recipient: { email: `${tag}-invited@example.org` }, organizationId: orgId, data: {} }])
    rowIds.push(invite)
    expect(await deliverOutbox({ ids: [invite] })).toEqual({ sent: 0, retried: 0, failed: 0, cancelled: 1, held: 0 })
    expect(smtp).toHaveBeenCalledTimes(1)
    const cancelled = await prisma.notificationOutbox.findFirstOrThrow({ where: { id: { in: ids }, status: "cancelled" } })
    expect(cancelled.lastError).toBe("org_pending")

    await prisma.organization.update({ where: { id: orgId }, data: { outboundEmailApprovedAt: new Date() } })
    const [later] = await enqueueNotifications([payload(`${tag}-volunteer2@example.org`)])
    rowIds.push(later)
    expect(await deliverOutbox({ ids: [later] })).toEqual({ sent: 1, retried: 0, failed: 0, cancelled: 0, held: 0 })
  })
})
