import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * The public sign-up against a real Postgres, through its route (only the send is mocked):
 * - many sign-ups at once on the last place: one place, clean refusals, never a 500 (AUTHZ-04);
 * - without proof of the address, a refusal that comes from its own registrations answers like any
 *   sign-up and only the owner is told, by email (AUTHZ-01);
 * - a shift that is over is refused for every event, one still running is not (AUTHZ-02).
 */

const send = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: send }))
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: () => {} }))

import { prisma } from "@/lib/prisma"
import { POST as publicSignup } from "@/app/api/public/registrations/route"
import { openPayload } from "@/lib/notifications/outbox"
import { localDateTimeToUtc } from "@/lib/time-zone"

const url = process.env.DATABASE_URL
const tag = `int-signup-hard-${Date.now()}`
let ipSeq = 0

describe.skipIf(!url)("public sign-up hardening", () => {
  let orgId = ""
  let eventId = ""
  const ids: Record<string, string> = {}

  const mkShift = async (key: string, data: { roleName: string; date: string; startTime: string; endTime: string; capacity?: number; waitlistEnabled?: boolean }) => {
    ids[key] = (await prisma.shift.create({ data: { eventId, label: data.roleName, capacity: 5, ...data, date: new Date(`${data.date}T00:00:00Z`) } })).id
  }

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org hard", slug: `${tag}-org`, timeZone: "Europe/Zurich", publicationApprovedAt: new Date() } })
    orgId = org.id
    const event = await prisma.event.create({
      data: { organizationId: orgId, slug: "fete", title: "Fête", startDate: new Date("2031-06-01"), endDate: new Date("2031-06-02"), publicStatus: "published" },
    })
    eventId = event.id
    await mkShift("last", { roleName: "Caisse", date: "2031-06-01", startTime: "08:00", endTime: "10:00", capacity: 1 })
    await mkShift("accueil", { roleName: "Accueil", date: "2031-06-01", startTime: "14:00", endTime: "16:00" })
    await mkShift("bar", { roleName: "Bar", date: "2031-06-01", startTime: "15:00", endTime: "17:00" })
    await mkShift("montage", { roleName: "Montage", date: "2031-06-02", startTime: "09:00", endTime: "11:00" })
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.registration.deleteMany({ where: { event: { organizationId: orgId } } })
      await prisma.shift.deleteMany({ where: { event: { organizationId: orgId } } })
      await prisma.event.deleteMany({ where: { organizationId: orgId } })
      await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
      await prisma.charterVersion.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.deleteMany({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  const signup = (shiftIds: string[], email: string, ev = eventId) => publicSignup(new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${tag}-ip-${ipSeq++}` },
    body: JSON.stringify({ eventId: ev, shiftIds, firstName: "Chloé", lastName: "Roy", email, consent: true, charterAccepted: true }),
  }))
  const answer = async (res: Response) => ({ status: res.status, body: await res.json() })

  it("fifteen sign-ups at once on the last place: one place, the others refused cleanly, never a 500", async () => {
    const responses = await Promise.all(Array.from({ length: 15 }, (_, i) => signup([ids.last], `${tag}-burst-${i}@example.org`)))
    const statuses = responses.map((r) => r.status)
    expect(statuses.filter((s) => s >= 500)).toEqual([])
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    const bodies = await Promise.all(responses.filter((r) => r.status !== 201).map((r) => r.json()))
    // Full under the lock, or the lock not had in time: both say nothing was recorded.
    for (const b of bodies) expect(b.fullShiftId === ids.last || b.busy === true).toBe(true)
    expect(await prisma.registration.count({ where: { shiftId: ids.last, status: "active" } })).toBe(1)
  })

  it("a sign-up that can't get the shift's lock in time answers « réessaie », nothing recorded", async () => {
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    let locked!: () => void
    const isLocked = new Promise<void>((r) => { locked = r })
    // Another writer holds the shift's row lock longer than a sign-up waits for it.
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id = ${ids.montage} FOR UPDATE`
      locked()
      await held
    }, { timeout: 15_000 })
    await isLocked
    const started = Date.now()
    const res = await signup([ids.montage], `${tag}-waiting@example.org`)
    release()
    await holder
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(await answer(res)).toEqual({ status: 409, body: { error: "Plusieurs inscriptions sont en cours en même temps. Cette tentative n'a pas été enregistrée.", busy: true } })
    expect(await prisma.volunteer.count({ where: { email: `${tag}-waiting@example.org` } })).toBe(0)
  })

  it("without proof of the address, a duplicate and an overlap answer like a new sign-up; only the owner is told", async () => {
    const owner = `${tag}-owner@example.org`
    const first = await answer(await signup([ids.accueil], owner))
    expect(first.status).toBe(201)
    const fresh = await answer(await signup([ids.montage], `${tag}-someone@example.org`))
    expect(fresh).toEqual(first)

    send.mockReset().mockResolvedValue({ ok: true })
    const before = await prisma.registration.count({ where: { eventId } })
    const duplicate = await answer(await signup([ids.accueil], owner))
    const overlap = await answer(await signup([ids.bar], owner))
    expect(duplicate).toEqual(first)
    expect(overlap).toEqual(first)
    expect(await prisma.registration.count({ where: { eventId } })).toBe(before)

    const notices = (await prisma.notificationOutbox.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } }))
      .map((r) => openPayload(r.payload))
      .filter((p) => p.kind === "registration_link_resend")
    expect(notices).toHaveLength(2)
    for (const n of notices) expect(n.recipient.email).toBe(owner)
    expect(notices[0].data.notRecorded.reason).toContain("« Accueil »")
    expect(notices[1].data.notRecorded.reason).toBe("le créneau « Bar » chevauche ton créneau « Accueil »")
    expect(typeof notices[0].data.editToken).toBe("string")
  })

  it("refuses a shift that is over on a short event, accepts a night shift still running", async () => {
    const zone = "Europe/Zurich"
    const now = new Date()
    const today = now.toLocaleDateString("sv-SE", { timeZone: zone })
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    const past = await prisma.event.create({
      data: { organizationId: orgId, slug: "passe", title: "Passé", startDate: new Date(`${yesterday}T00:00:00Z`), endDate: new Date(`${today}T00:00:00Z`), publicStatus: "published" },
    })
    const over = await prisma.shift.create({ data: { eventId: past.id, roleName: "Rangement", label: "Rangement", capacity: 5, date: new Date(`${yesterday}T00:00:00Z`), startTime: "10:00", endTime: "12:00" } })
    // 00:01 to midnight today: started (or about to) and not over, whatever the hour of the test.
    const running = await prisma.shift.create({ data: { eventId: past.id, roleName: "Veille", label: "Veille", capacity: 5, date: new Date(`${today}T00:00:00Z`), startTime: "00:01", endTime: "00:00" } })
    expect(localDateTimeToUtc(new Date(`${today}T00:00:00Z`), "24:00", zone).getTime()).toBeGreaterThan(now.getTime())

    const refused = await answer(await signup([over.id], `${tag}-late@example.org`, past.id))
    expect(refused).toEqual({ status: 409, body: { error: 'Le créneau "Rangement" est terminé. Recharge la page.' } })
    expect(await prisma.registration.count({ where: { shiftId: over.id } })).toBe(0)
    expect((await signup([running.id], `${tag}-night@example.org`, past.id)).status).toBe(201)
  })
})
