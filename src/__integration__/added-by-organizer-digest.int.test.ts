import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * #916 against a real Postgres: shifts added one after the other for the same person on the same
 * event make one grouped email, sent a few minutes after the last add and listing only what is
 * still held then. Only the send itself is mocked.
 */

const send = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: send }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { registrationToken } from "@/lib/token-vault"
import { deliverOutbox, openPayload } from "@/lib/notifications/outbox"
import { ADDED_BY_ORGANIZER_DELAY_MS, queueAddedByOrganizer } from "@/lib/notifications/added-by-organizer"

const url = process.env.DATABASE_URL
const tag = `int-added-${Date.now()}`

describe.skipIf(!url)("grouped « added by an organizer » email (#916)", () => {
  let orgId = ""
  let eventId = ""
  let volunteerId = ""

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org digest", slug: `${tag}-org`, timeZone: "UTC" } })
    orgId = org.id
    const event = await prisma.event.create({
      data: { organizationId: orgId, slug: "fete", title: "Fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-02"), publicStatus: "published" },
    })
    eventId = event.id
    const volunteer = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Alice", lastName: "Martin", email: `${tag}@x.ch` } })
    volunteerId = volunteer.id
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.registration.deleteMany({ where: { eventId } })
      await prisma.shift.deleteMany({ where: { eventId } })
      await prisma.event.deleteMany({ where: { id: eventId } })
      await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.deleteMany({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  async function add(roleName: string, date: string, now: Date) {
    const shift = await prisma.shift.create({ data: { eventId, roleName, label: roleName, date: new Date(date), startTime: "10:00", endTime: "12:00", capacity: 5 } })
    return prisma.$transaction(async (tx) => {
      const reg = await tx.registration.create({ data: { eventId, shiftId: shift.id, volunteerId, status: "active", source: "admin_manual", ...registrationToken.data(`${tag}-${shift.id}`) } })
      await queueAddedByOrganizer(tx, {
        eventId, volunteerId, registrationId: reg.id, organizationId: orgId,
        recipient: { email: `${tag}@x.ch`, name: "Alice Martin" },
        data: { volunteerName: "Alice Martin", eventTitle: "Fête", orgSlug: `${tag}-org`, organizationName: "Org digest", organizerName: "Léa Morel" },
        now,
      })
      return reg
    })
  }

  it("groups three adds in one row, drops the removed shift, sends once after the wait", async () => {
    send.mockReset().mockResolvedValue({ ok: true })
    const t0 = new Date()
    await add("Bar", "2030-06-02", t0)
    const removed = await add("Accueil", "2030-06-01", new Date(t0.getTime() + 60_000))
    const last = new Date(t0.getTime() + 120_000)
    await add("Caisse", "2030-06-01", last)

    const rows = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId } })
    expect(rows).toHaveLength(1)
    expect((openPayload(rows[0].payload).data as { registrationIds: string[] }).registrationIds).toHaveLength(3)
    expect(rows[0].nextAttemptAt.getTime()).toBe(last.getTime() + ADDED_BY_ORGANIZER_DELAY_MS)

    // Not due yet: nothing leaves.
    expect(await deliverOutbox({ ids: [rows[0].id], now: new Date(last.getTime() + 60_000) })).toMatchObject({ sent: 0 })

    await prisma.registration.update({ where: { id: removed.id }, data: { status: "cancelled" } })
    expect(await deliverOutbox({ ids: [rows[0].id], now: new Date(last.getTime() + ADDED_BY_ORGANIZER_DELAY_MS + 1000) })).toMatchObject({ sent: 1 })
    expect(send).toHaveBeenCalledOnce()
    const sent = send.mock.calls[0][0]
    expect(sent.kind).toBe("registration_added_by_organizer")
    expect(sent.data.shifts.map((s: { roleName: string }) => s.roleName)).toEqual(["Caisse", "Bar"])
    expect(typeof sent.data.editToken).toBe("string")

    // Once sent, a new add starts a new email instead of joining the old one.
    await add("Vestiaire", "2030-06-02", new Date(last.getTime() + ADDED_BY_ORGANIZER_DELAY_MS + 5000))
    expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId } })).toBe(2)
  })

  it("sends nothing when every grouped shift was removed before it left", async () => {
    send.mockReset().mockResolvedValue({ ok: true })
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
    const t0 = new Date()
    const reg = await add("Parking", "2030-06-02", t0)
    await prisma.registration.update({ where: { id: reg.id }, data: { status: "cancelled" } })
    const [row] = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId } })
    expect(await deliverOutbox({ ids: [row.id], now: new Date(t0.getTime() + ADDED_BY_ORGANIZER_DELAY_MS + 1000) })).toMatchObject({ sent: 0, cancelled: 1 })
    expect(send).not.toHaveBeenCalled()
  })
})
