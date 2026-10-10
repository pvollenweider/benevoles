import { describe, it, expect, afterAll, vi } from "vitest"

/**
 * #811 « Réactiver mon espace » against a real Postgres: the request stores a hashed link and
 * queues an email without an organisation; the link reactivates the space once, restarts the
 * check and logs it; the nightly cleanup never erases a space deactivated for inactivity.
 */

// The email delivers after the response (`after`), which needs a request: nothing to deliver here.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }))

import { prisma } from "@/lib/prisma"
import { expiredDeactivatedOrgWhere } from "@/lib/org-review"
import { openPayload } from "@/lib/notifications/outbox"
import { POST as request } from "@/app/api/public/org-reactivation/request/route"
import { POST as confirm } from "@/app/api/public/org-reactivation/confirm/route"

const url = process.env.DATABASE_URL
const tag = `int-react-${Date.now()}`

const post = (body: unknown) => new Request("http://localhost/x", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": `${tag}-${Math.random()}` },
  body: JSON.stringify(body),
})

describe.skipIf(!url)("reactivating a space deactivated for inactivity on Postgres (#811)", () => {
  const ids: string[] = []
  const outboxIds: string[] = []
  const email = `${tag}-admin@example.org`

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { id: { in: outboxIds } } })
    await prisma.adminUser.deleteMany({ where: { organizationId: { in: ids } } })
    await prisma.organization.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
  })

  it("reactivates once with the emailed link, and restarts the check", async () => {
    const org = await prisma.organization.create({ data: { name: `Comité ${tag}`, slug: `${tag}-c`, active: false, inactivityDeactivatedAt: new Date("2026-09-01T00:00:00Z") } })
    ids.push(org.id)
    await prisma.adminUser.create({ data: { email, name: "Julie", passwordHash: "x", role: "admin", isActive: true, organizationId: org.id } })

    expect((await request(post({ email }))).status).toBe(200)
    // Sealed payloads (#382): opened to find this test's row.
    const rows = await prisma.notificationOutbox.findMany({ where: { organizationId: null, createdAt: { gte: new Date(Date.now() - 60_000) } } })
    const queued = rows.map((row) => ({ row, payload: openPayload(row.payload) })).find(({ payload }) => payload.recipient.email === email)!
    outboxIds.push(queued.row.id)
    expect(queued.payload.kind).toBe("org_reactivation")
    const link = new URL((queued.payload.data as { reactivateUrl: string }).reactivateUrl)
    const secret = link.searchParams.get("token")!
    const stored = await prisma.adminUser.findUniqueOrThrow({ where: { email } })
    expect(stored.orgReactivationTokenHash).not.toBe(secret)

    const res = await confirm(post({ token: secret }))
    expect(await res.json()).toEqual({ ok: true, organizationName: `Comité ${tag}` })
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(after).toMatchObject({ active: true, inactivityDeactivatedAt: null })
    expect(Date.now() - after.lastRetentionConfirmedAt!.getTime()).toBeLessThan(60_000)
    expect(await prisma.orgLog.count({ where: { organizationId: org.id, action: "organization.reactivated_after_inactivity" } })).toBe(1)

    // Single use.
    expect((await confirm(post({ token: secret }))).status).toBe(400)
  })

  it("never erases a space deactivated for inactivity, unlike one the operator deactivated", async () => {
    const idle = await prisma.organization.create({ data: { name: `Inactif ${tag}`, slug: `${tag}-i`, active: false, inactivityDeactivatedAt: new Date("2026-01-01T00:00:00Z") } })
    const manual = await prisma.organization.create({ data: { name: `Manuel ${tag}`, slug: `${tag}-m`, active: false } })
    ids.push(idle.id, manual.id)
    const later = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    const erased = await prisma.organization.findMany({ where: { ...expiredDeactivatedOrgWhere(later), id: { in: [idle.id, manual.id] } }, select: { id: true } })
    expect(erased.map((o) => o.id)).toEqual([manual.id])
  })
})
