import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * Scheduled messages (#1019) against a real Postgres, through the outbox cron route: a due message
 * becomes one history row and one queued email per person, computed when it goes; a second run
 * (or two runs at once) sends nothing more; a cancelled one and one not due yet are left alone; an
 * archived event's is skipped with its reason and logged. SMTP is mocked: the emails' own
 * delivery is the outbox's (outbox.int.test.ts).
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/env", async (orig) => ({ env: { ...(await orig<typeof import("@/lib/env")>()).env, CRON_SECRET: "s3cret" } }))
vi.mock("@/lib/job-runs", () => ({ recordJobRun: async (_job: string, fn: () => Promise<unknown>) => fn() }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))
const sendNotification = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification }))

import { prisma } from "@/lib/prisma"
import { registrationToken } from "@/lib/token-vault"
import { openPayload } from "@/lib/notifications/outbox"
import { dispatchScheduledMessages } from "@/lib/scheduled-message-dispatch"
import { POST } from "@/app/api/cron/outbox/route"

const url = process.env.DATABASE_URL
const tag = `int-sched-${Date.now()}`
const cron = () => POST(new Request("http://localhost/api/cron/outbox", { method: "POST", headers: { authorization: "Bearer s3cret" } }))

describe.skipIf(!url)("scheduled messages on Postgres (#1019)", () => {
  let orgId = ""
  let eventId = ""
  let archivedId = ""

  const volunteer = (firstName: string) => prisma.volunteer.create({ data: { organizationId: orgId, firstName, lastName: tag, email: `${tag}-${firstName.toLowerCase()}@example.org` } })
  const register = async (shiftId: string, volunteerId: string, event = eventId) =>
    prisma.registration.create({ data: { eventId: event, shiftId, volunteerId, status: "active", ...registrationToken.data(`${tag}-${shiftId}-${volunteerId}`) } })
  const schedule = (over: Record<string, unknown> = {}) =>
    prisma.scheduledMessage.create({
      data: {
        organizationId: orgId, eventId, authorName: "Léa", subject: "Rappel {prénom}", message: "Entrée rue Basse.",
        audience: { kind: "event" }, audienceLabel: "tous les bénévoles inscrits", scheduledFor: new Date(Date.now() - 60_000), ...over,
      },
    })

  beforeAll(async () => {
    sendNotification.mockResolvedValue({ ok: true })
    orgId = (await prisma.organization.create({ data: { name: `Comité ${tag}`, slug: tag, timeZone: "Europe/Zurich" } })).id
    eventId = (await prisma.event.create({ data: { organizationId: orgId, slug: "fete", title: "Fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-01"), publicStatus: "published" } })).id
    archivedId = (await prisma.event.create({ data: { organizationId: orgId, slug: "vieille", title: "Vieille fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-01"), publicStatus: "archived" } })).id
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  it("sends a due message once, to the people registered when it goes, and leaves the others", async () => {
    const shift = await prisma.shift.create({ data: { eventId, roleName: "Bar", label: "Bar", date: new Date("2030-06-01"), startTime: "18:00", endTime: "20:00", capacity: 5 } })
    const ana = await volunteer("Ana")
    await register(shift.id, ana.id)
    const due = await schedule()
    const cancelled = await schedule({ status: "cancelled", cancelledAt: new Date(), cancelledByName: "Léa" })
    const later = await schedule({ scheduledFor: new Date(Date.now() + 3_600_000) })
    // Registered after the scheduling, before it goes: written to as well.
    const bob = await volunteer("Bob")
    await register(shift.id, bob.id)

    const res = await cron()
    expect(res.status).toBe(200)
    expect((await res.json()).scheduled).toEqual({ sent: 1, skipped: 0, failed: 0 })

    const row = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: due.id } })
    expect(row.status).toBe("sent")
    expect(row.targetedMessageId).not.toBeNull()
    const history = await prisma.targetedMessage.findUniqueOrThrow({ where: { id: row.targetedMessageId! } })
    expect(history).toMatchObject({ authorName: "Léa", subject: "Rappel {prénom}", recipientCount: 2, audienceLabel: "tous les bénévoles inscrits" })
    const outbox = await prisma.notificationOutbox.findMany({ where: { targetedMessageId: history.id }, orderBy: { createdAt: "asc" } })
    expect(outbox.map((o) => o.dedupeKey).sort()).toEqual([`message:scheduled:${due.id}:${ana.id}`, `message:scheduled:${due.id}:${bob.id}`].sort())
    expect(outbox.map((o) => openPayload(o.payload).data.subject).sort()).toEqual(["Rappel Ana", "Rappel Bob"])
    // Delivered in the same run.
    expect(outbox.every((o) => o.status === "sent")).toBe(true)
    expect(await prisma.eventLog.count({ where: { eventId, action: "message.sent", actorType: "system" } })).toBe(1)

    // Next runs, twice at once: nothing more.
    await Promise.all([dispatchScheduledMessages(), dispatchScheduledMessages()])
    expect((await (await cron()).json()).scheduled).toEqual({ sent: 0, skipped: 0, failed: 0 })
    expect(await prisma.targetedMessage.count({ where: { eventId } })).toBe(1)
    expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId } })).toBe(2)
    expect((await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: cancelled.id } })).status).toBe("cancelled")
    expect((await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: later.id } })).status).toBe("scheduled")
  })

  it("two runs racing on the same due message send it once", async () => {
    const before = await prisma.targetedMessage.count({ where: { eventId } })
    const due = await schedule({ subject: "Course" })
    const results = await Promise.all([dispatchScheduledMessages(), dispatchScheduledMessages()])
    expect(results.reduce((n, r) => n + r.sent, 0)).toBe(1)
    expect(await prisma.targetedMessage.count({ where: { eventId } })).toBe(before + 1)
    expect((await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: due.id } })).status).toBe("sent")
  })

  it("skips an archived event's message and an empty audience, with the reason, logged, nothing queued", async () => {
    const outboxBefore = await prisma.notificationOutbox.count({ where: { organizationId: orgId } })
    const archived = await schedule({ eventId: archivedId })
    const empty = await schedule({ audience: { kind: "waitlist" }, audienceLabel: "les personnes en liste d'attente" })
    expect(await dispatchScheduledMessages()).toEqual({ sent: 0, skipped: 2, failed: 0 })
    expect(await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: archived.id } })).toMatchObject({ status: "skipped", skipReason: "l'événement est archivé" })
    expect(await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: empty.id } })).toMatchObject({ status: "skipped", skipReason: "personne à qui écrire dans cette sélection au moment de l'envoi" })
    expect(await prisma.eventLog.count({ where: { eventId: archivedId, action: "message.schedule_skipped" } })).toBe(1)
    expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId } })).toBe(outboxBefore)
  })
})
