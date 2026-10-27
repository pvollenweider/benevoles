import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * #1191 against a real Postgres, through the public sign-up route: a first sign-up is confirmed at
 * once with its link; shifts then added one at a time make one grouped confirmation, sent a few
 * minutes after the last one and listing only the places still held then. Only the send is mocked.
 */

const send = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: send }))
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: () => {} }))

import { prisma } from "@/lib/prisma"
import { POST as publicSignup } from "@/app/api/public/registrations/route"
import { deliverOutbox, openPayload } from "@/lib/notifications/outbox"
import { ADDED_SHIFTS_DELAY_MS } from "@/lib/notifications/added-shifts-confirmation"
import { render } from "@/lib/notifications/templates"
import { hashToken } from "@/lib/token-hash"
import type { NotificationPayload } from "@/lib/notifications/types"

const url = process.env.DATABASE_URL
const tag = `int-added-shifts-${Date.now()}`
let ipSeq = 0
const email = `${tag}@example.org`

describe.skipIf(!url)("grouped confirmation of shifts added one by one (#1191)", () => {
  let orgId = ""
  let eventId = ""
  const shiftIds: string[] = []

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org added", slug: `${tag}-org`, timeZone: "Europe/Zurich", publicationApprovedAt: new Date() } })
    orgId = org.id
    const event = await prisma.event.create({
      data: { organizationId: orgId, slug: "fete", title: "Fête", startDate: new Date("2031-06-01"), endDate: new Date("2031-06-02"), publicStatus: "published" },
    })
    eventId = event.id
    for (const [i, [role, start]] of ([["Accueil", "08:00"], ["Bar", "10:00"], ["Caisse", "12:00"], ["Montage", "14:00"]] as const).entries()) {
      shiftIds.push((await prisma.shift.create({ data: { eventId, roleName: role, label: role, date: new Date(`2031-06-0${1 + (i % 2)}`), startTime: start, endTime: `${String(Number(start.slice(0, 2)) + 1).padStart(2, "0")}:00`, capacity: 5 } })).id)
    }
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.registration.deleteMany({ where: { eventId } })
      await prisma.shift.deleteMany({ where: { eventId } })
      await prisma.event.deleteMany({ where: { id: eventId } })
      await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
      await prisma.charterVersion.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.deleteMany({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  const signup = (shiftId: string) => publicSignup(new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${tag}-ip-${ipSeq++}` },
    body: JSON.stringify({ eventId, shiftIds: [shiftId], firstName: "Chloé", lastName: "Roy", email, consent: true, charterAccepted: true }),
  }))

  const confirmations = async () => (await prisma.notificationOutbox.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } }))
    .map((r) => ({ row: r, payload: openPayload(r.payload) }))
    .filter((r) => r.payload.kind === "registration_confirmation")

  it("confirms the first sign-up at once, then groups the shifts added afterwards into one email", async () => {
    send.mockReset().mockResolvedValue({ ok: true })
    expect((await signup(shiftIds[0])).status).toBe(201)
    let rows = await confirmations()
    expect(rows).toHaveLength(1)
    // The first confirmation is the usual one, with its shift and the personal link, due now.
    expect(rows[0].payload.data).toMatchObject({ shifts: [expect.objectContaining({ label: "Accueil" })], editToken: expect.any(String) })
    expect(rows[0].row.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now())

    for (const id of shiftIds.slice(1)) expect((await signup(id)).status).toBe(201)
    rows = await confirmations()
    expect(rows).toHaveLength(2)
    const grouped = rows[1]
    expect(grouped.payload.data).toMatchObject({ addedShifts: true, eventId })
    expect((grouped.payload.data as { registrationIds: string[] }).registrationIds).toHaveLength(3)
    expect(grouped.payload.volunteerId).toBeTruthy()
    expect(grouped.row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + ADDED_SHIFTS_DELAY_MS - 60_000)

    // One of them withdrawn before the email leaves: it is not announced.
    const caisse = await prisma.registration.findFirstOrThrow({ where: { eventId, shiftId: shiftIds[2] } })
    await prisma.registration.update({ where: { id: caisse.id }, data: { status: "cancelled" } })

    const later = new Date(grouped.row.nextAttemptAt.getTime() + 1000)
    expect(await deliverOutbox({ ids: [grouped.row.id], now: new Date(grouped.row.nextAttemptAt.getTime() - 60_000) })).toMatchObject({ sent: 0 })
    expect(await deliverOutbox({ ids: [grouped.row.id], now: later })).toMatchObject({ sent: 1 })
    expect(send).toHaveBeenCalledTimes(1)
    const sent = send.mock.calls[0][0] as NotificationPayload
    const data = sent.data as { shifts: { label: string }[]; editToken: string }
    expect(data.shifts.map((s) => s.label)).toEqual(["Bar", "Montage"])
    // The link opens the personal page: a live registration's token.
    const linked = await prisma.registration.findUniqueOrThrow({ where: { editTokenHash: hashToken(data.editToken) } })
    expect(linked.status).toBe("active")
    const rendered = render(sent)
    expect(rendered.subject).toBe("Inscription confirmée — Fête 🎉")
    expect(rendered.text).toContain("Bar")
    expect(rendered.text).not.toContain("Caisse")
  })

  it("sends nothing when every added place was withdrawn before the email left", async () => {
    send.mockReset().mockResolvedValue({ ok: true })
    const extra = await prisma.shift.create({ data: { eventId, roleName: "Nettoyage", label: "Nettoyage", date: new Date("2031-06-02"), startTime: "18:00", endTime: "19:00", capacity: 5 } })
    expect((await signup(extra.id)).status).toBe(201)
    const row = (await confirmations()).at(-1)!
    expect(row.payload.data).toMatchObject({ addedShifts: true })
    await prisma.registration.updateMany({ where: { eventId, shiftId: extra.id }, data: { status: "cancelled" } })
    expect(await deliverOutbox({ ids: [row.row.id], now: new Date(row.row.nextAttemptAt.getTime() + 1000) })).toMatchObject({ sent: 0, cancelled: 1 })
    expect(send).not.toHaveBeenCalled()
  })
})
