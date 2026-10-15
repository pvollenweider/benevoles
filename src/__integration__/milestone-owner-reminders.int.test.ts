import { describe, it, expect, vi, afterAll } from "vitest"

/**
 * Reminder to a milestone's owner (#985) against a real Postgres: who gets it, in which window
 * (organisation zone), once only, and again after a new due date.
 */

vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { openPayload } from "@/lib/notifications/outbox"
import { sendMilestoneOwnerReminders } from "@/lib/milestone-reminders"

const url = process.env.DATABASE_URL
const tag = `int-ms-${Date.now()}`
// 06:00 in Zurich on Wednesday 14 October 2026.
const NOW = new Date("2026-10-14T04:00:00Z")
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`)

describe.skipIf(!url)("milestone owner reminders on Postgres (#985)", () => {
  let orgId = ""

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.event.deleteMany({ where: { organizationId: orgId } })
      await prisma.adminUser.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  it("emails the active owner once, in the window, and again after a new due date", async () => {
    orgId = (await prisma.organization.create({ data: { name: `Comité ${tag}`, slug: tag, timeZone: "Europe/Zurich" } })).id
    const event = await prisma.event.create({ data: { organizationId: orgId, slug: "fete", title: "Fête du village", startDate: day("2026-11-01"), endDate: day("2026-11-01") } })
    const archived = await prisma.event.create({ data: { organizationId: orgId, slug: "vieille", title: "Vieille fête", startDate: day("2026-11-01"), endDate: day("2026-11-01"), publicStatus: "archived" } })
    const samira = await prisma.adminUser.create({ data: { organizationId: orgId, email: `${tag}-samira@example.org`, name: "Samira Diallo", passwordHash: "x", isActive: true } })
    const gone = await prisma.adminUser.create({ data: { organizationId: orgId, email: `${tag}-gone@example.org`, name: "Parti", passwordHash: "x", isActive: false } })

    const milestone = (title: string, dueDate: string, over: Record<string, unknown> = {}) =>
      prisma.eventMilestone.create({ data: { eventId: event.id, title, dueDate: day(dueDate), ownerId: samira.id, ...over } })
    const inWindow = await milestone("Confirmer la tente", "2026-10-17") // 3 days ahead
    await milestone("Trop tôt", "2026-10-18") // 4 days ahead
    await milestone("Déjà passé", "2026-10-13")
    await milestone("Fait", "2026-10-15", { done: true })
    await milestone("Sans responsable", "2026-10-15", { ownerId: null })
    await milestone("Compte désactivé", "2026-10-15", { ownerId: gone.id })
    await prisma.eventMilestone.create({ data: { eventId: archived.id, title: "Archivé", dueDate: day("2026-10-15"), ownerId: samira.id } })

    // Other organisations of a shared database may have milestones too: counted on this one only.
    const outboxRows = () => prisma.notificationOutbox.count({ where: { organizationId: orgId } })
    await sendMilestoneOwnerReminders(NOW)
    expect(await outboxRows()).toBe(1)
    // The next hourly run sends nothing more.
    await sendMilestoneOwnerReminders(new Date(NOW.getTime() + 3_600_000))
    expect(await outboxRows()).toBe(1)

    const rows = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId } })
    expect(rows).toHaveLength(1)
    expect(rows[0].dedupeKey).toBe(`milestone_owner_reminder:${inWindow.id}:${samira.id}:2026-10-17`)
    const payload = openPayload(rows[0].payload)
    expect(payload).toMatchObject({
      kind: "milestone_owner_reminder",
      recipient: { email: `${tag}-samira@example.org`, name: "Samira Diallo" },
      data: { milestoneTitle: "Confirmer la tente", eventTitle: "Fête du village", dueDateLabel: "samedi 17 octobre", daysLeft: 3 },
    })
    expect((await prisma.eventMilestone.findUniqueOrThrow({ where: { id: inWindow.id } })).ownerRemindedAt).toEqual(NOW)

    // A new due date clears the mark (as the PATCH route does): the new date gets its reminder.
    await prisma.eventMilestone.update({ where: { id: inWindow.id }, data: { dueDate: day("2026-10-16"), ownerRemindedAt: null } })
    await sendMilestoneOwnerReminders(NOW)
    expect(await outboxRows()).toBe(2)
  })
})
