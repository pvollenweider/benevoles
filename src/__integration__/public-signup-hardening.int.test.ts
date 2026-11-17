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
// Wrapped so one test can stand in for a concurrent sign-up that creates the member between this
// request's read and its write; every other call runs the real helper.
vi.mock("@/lib/signup-volunteer", async (original) => {
  const actual = await original<typeof import("@/lib/signup-volunteer")>()
  return { ...actual, lockSignupVolunteer: vi.fn(actual.lockSignupVolunteer) }
})

import { prisma } from "@/lib/prisma"
import { POST as publicSignup } from "@/app/api/public/registrations/route"
import { openPayload } from "@/lib/notifications/outbox"
import { localDateTimeToUtc } from "@/lib/time-zone"
import { registrationToken } from "@/lib/token-vault"
import { lockSignupVolunteer } from "@/lib/signup-volunteer"
import { SIGNUP_ADDRESS_LIMIT } from "@/lib/signup-limits"

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

  const signup = (shiftIds: string[], email: string, ev = eventId, orgSlug?: string, ip?: string) => publicSignup(new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip ?? `${tag}-ip-${ipSeq++}`, ...(orgSlug ? { "x-org-slug": orgSlug } : {}) },
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

  it("on an event that confirms by email, a request that is not recorded answers like one that is", async () => {
    const confirming = await prisma.event.create({
      data: { organizationId: orgId, slug: "confirme", title: "Confirme", startDate: new Date("2031-06-01"), endDate: new Date("2031-06-02"), publicStatus: "published", requireEmailConfirmation: true },
    })
    const mk = async (roleName: string, startTime: string, endTime: string) => (await prisma.shift.create({ data: { eventId: confirming.id, roleName, label: roleName, capacity: 5, date: new Date("2031-06-01T00:00:00Z"), startTime, endTime } })).id
    const [held, clashing, free] = [await mk("Accueil", "14:00", "16:00"), await mk("Bar", "15:00", "17:00"), await mk("Montage", "09:00", "11:00")]
    const owner = `${tag}-confirm-owner@example.org`
    const person = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Chloé", lastName: "Roy", email: owner } })
    await prisma.registration.create({ data: { eventId: confirming.id, shiftId: held, volunteerId: person.id, status: "active", ...registrationToken.data(`${tag}-confirm-token`) } })

    // The deadline is 24 h after each request: close to now + 24 h every time, never a sign of the outcome.
    const shape = async (res: Response) => {
      const { status, body } = await answer(res)
      const { confirmationExpiresAt, ...rest } = body
      expect(Math.abs(Date.parse(confirmationExpiresAt) - (Date.now() + 24 * 3_600_000))).toBeLessThan(10_000)
      return { status, rest }
    }
    const before = await prisma.registration.count({ where: { eventId: confirming.id } })
    const recordedForOwner = await shape(await signup([free], owner, confirming.id))
    expect(await prisma.registration.count({ where: { eventId: confirming.id } })).toBe(before + 1)
    const duplicate = await shape(await signup([held], owner, confirming.id))
    const overlap = await shape(await signup([clashing], owner, confirming.id))
    const stranger = await shape(await signup([held], `${tag}-confirm-new@example.org`, confirming.id))

    expect(recordedForOwner).toEqual({ status: 201, rest: { success: true, editToken: null, linkSentByEmail: true, received: true, emailConfirmation: true, confirmationHeld: 1, confirmationWaiting: 0, confirmationTimeZone: "Europe/Zurich" } })
    expect(duplicate).toEqual(recordedForOwner)
    expect(overlap).toEqual(recordedForOwner)
    expect(stranger).toEqual(recordedForOwner)
    // The duplicate and the overlap wrote nothing for the owner's address, and left the owner's
    // pending request (the first sign-up, on « Montage ») as it was.
    expect(await prisma.registration.count({ where: { eventId: confirming.id, volunteerId: person.id, shiftId: clashing } })).toBe(0)
    expect(await prisma.signupConfirmation.count({ where: { eventId: confirming.id, email: owner, cancelledAt: null, confirmedAt: null } })).toBe(1)
  })

  it("on an event that confirms by email, a request that is not recorded leaves the pending one untouched; a recorded one replaces it", async () => {
    const confirming = await prisma.event.create({
      data: { organizationId: orgId, slug: "attente", title: "Attente", startDate: new Date("2031-06-01"), endDate: new Date("2031-06-02"), publicStatus: "published", requireEmailConfirmation: true },
    })
    const mk = async (roleName: string, startTime: string, endTime: string, capacity = 5) => (await prisma.shift.create({ data: { eventId: confirming.id, roleName, label: roleName, capacity, date: new Date("2031-06-01T00:00:00Z"), startTime, endTime } })).id
    // « Montage » has one place: the pending request holds it.
    const [held, clashing, pendingShift] = [await mk("Accueil", "14:00", "16:00"), await mk("Bar", "15:00", "17:00"), await mk("Montage", "09:00", "11:00", 1)]
    const owner = `${tag}-pending-owner@example.org`
    const person = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Chloé", lastName: "Roy", email: owner } })
    await prisma.registration.create({ data: { eventId: confirming.id, shiftId: held, volunteerId: person.id, status: "active", ...registrationToken.data(`${tag}-pending-token`) } })

    // The deadline is 24 h after each request: left out, the rest must match exactly.
    const keys = async (res: Response) => {
      const { status, body } = await answer(res)
      const rest = { ...body }
      expect(typeof rest.confirmationExpiresAt).toBe("string")
      delete rest.confirmationExpiresAt
      return { status, rest }
    }
    const first = await keys(await signup([pendingShift], owner, confirming.id))
    expect(first.status).toBe(201)
    const pending = await prisma.signupConfirmation.findFirstOrThrow({ where: { eventId: confirming.id, email: owner }, include: { registrations: true } })
    expect(pending.registrations.map((r) => [r.shiftId, r.status])).toEqual([[pendingShift, "unconfirmed"]])
    const untouched = async () => {
      const row = await prisma.signupConfirmation.findUniqueOrThrow({ where: { id: pending.id }, include: { registrations: true } })
      expect(row).toMatchObject({ cancelledAt: null, cancelReason: null, confirmedAt: null })
      expect(row.registrations.map((r) => [r.shiftId, r.status])).toEqual([[pendingShift, "unconfirmed"]])
      expect(await prisma.signupConfirmation.count({ where: { eventId: confirming.id, email: owner } })).toBe(1)
    }

    // Not recorded: the same answer as a recorded request, and nothing changes, the pending one's
    // place included when the selection asks for it again next to a clash.
    expect(await keys(await signup([clashing], owner, confirming.id))).toEqual(first)
    await untouched()
    expect(await keys(await signup([held], owner, confirming.id))).toEqual(first)
    await untouched()
    const both = await keys(await signup([pendingShift, clashing], owner, confirming.id))
    expect(both).toEqual({ ...first, rest: { ...first.rest, confirmationHeld: 2 } })
    await untouched()

    // Recorded: the same shift again is not a duplicate of the pending request's own place, nor
    // full because of it. It replaces the pending request and takes the place again.
    expect(await keys(await signup([pendingShift], owner, confirming.id))).toEqual(first)
    const replaced = await prisma.signupConfirmation.findUniqueOrThrow({ where: { id: pending.id }, include: { registrations: true } })
    expect(replaced).toMatchObject({ cancelReason: "replaced", confirmedAt: null })
    expect(replaced.cancelledAt).toBeInstanceOf(Date)
    expect(replaced.registrations.map((r) => r.status)).toEqual(["cancelled"])
    const next = await prisma.signupConfirmation.findFirstOrThrow({ where: { eventId: confirming.id, email: owner, cancelledAt: null }, include: { registrations: true } })
    expect(next.id).not.toBe(pending.id)
    expect(next.registrations.map((r) => [r.shiftId, r.status])).toEqual([[pendingShift, "unconfirmed"]])
  })

  describe("on an event that confirms by email, the same new address twice at once", () => {
    let confirmingId = ""
    let shiftA = ""
    let shiftB = ""
    beforeAll(async () => {
      const confirming = await prisma.event.create({
        data: { organizationId: orgId, slug: "course", title: "Course", startDate: new Date("2031-06-01"), endDate: new Date("2031-06-02"), publicStatus: "published", requireEmailConfirmation: true },
      })
      confirmingId = confirming.id
      const mk = async (roleName: string, startTime: string) => (await prisma.shift.create({ data: { eventId: confirmingId, roleName, label: roleName, capacity: 5, date: new Date("2031-06-02T00:00:00Z"), startTime, endTime: `${Number(startTime.slice(0, 2)) + 1}:00` } })).id
      shiftA = await mk("Vestiaire", "10:00")
      shiftB = await mk("Parking", "12:00")
    })

    // Every unproven request on this event answers the confirmation shape; the deadline is checked
    // within a tolerance (24 h after each request), the rest must match exactly.
    const confirmationShape = async (res: Response) => {
      const { status, body } = await answer(res)
      const { confirmationExpiresAt, ...rest } = body
      expect(Math.abs(Date.parse(confirmationExpiresAt) - (Date.now() + 24 * 3_600_000))).toBeLessThan(10_000)
      return { status, keys: Object.keys(body).sort(), rest }
    }
    const expected = { status: 201, rest: { success: true, editToken: null, linkSentByEmail: true, received: true, emailConfirmation: true, confirmationHeld: 1, confirmationWaiting: 0, confirmationTimeZone: "Europe/Zurich" } }

    it("two requests at once both answer the confirmation shape", async () => {
      const email = `${tag}-twice@example.org`
      const [a, b] = await Promise.all([signup([shiftA], email, confirmingId), signup([shiftB], email, confirmingId)])
      const [ra, rb] = [await confirmationShape(a), await confirmationShape(b)]
      expect(ra).toMatchObject(expected)
      expect(rb.keys).toEqual(ra.keys)
      expect(rb).toMatchObject(expected)
      expect(await prisma.volunteer.count({ where: { organizationId: orgId, email } })).toBe(1)
    })

    // A concurrent request creating the member between this one's read and its write, made
    // deterministic: the first attempt meets the member created meanwhile and a duplicate key.
    const memberCreatedMeanwhile = (email: string) => async () => {
      await prisma.volunteer.createMany({ data: [{ organizationId: orgId, firstName: "Chloé", lastName: "Roy", email }], skipDuplicates: true })
      throw Object.assign(new Error("duplicate key"), { code: "P2002" })
    }

    it("a member created meanwhile: tried again, recorded, and the same confirmation shape", async () => {
      const email = `${tag}-meanwhile@example.org`
      vi.mocked(lockSignupVolunteer).mockImplementationOnce(memberCreatedMeanwhile(email))
      const res = await confirmationShape(await signup([shiftA], email, confirmingId))
      expect(res).toMatchObject(expected)
      expect(await prisma.signupConfirmation.count({ where: { eventId: confirmingId, email, cancelledAt: null, confirmedAt: null } })).toBe(1)
    })

    it("still a duplicate key after every attempt: the owner is told, the answer keeps the confirmation shape", async () => {
      const email = `${tag}-stuck@example.org`
      vi.mocked(lockSignupVolunteer).mockImplementation(memberCreatedMeanwhile(email))
      try {
        const res = await confirmationShape(await signup([shiftA], email, confirmingId))
        expect(res).toMatchObject(expected)
      } finally {
        vi.mocked(lockSignupVolunteer).mockReset()
        vi.mocked(lockSignupVolunteer).mockImplementation((await vi.importActual<typeof import("@/lib/signup-volunteer")>("@/lib/signup-volunteer")).lockSignupVolunteer)
      }
      expect(await prisma.signupConfirmation.count({ where: { eventId: confirmingId, email } })).toBe(0)
    })
  })

  // The organisation the proxy resolved (subdomain, or `?org=` where honoured) scopes the event.
  it("an event of another organisation than the request's answers like an unknown one", async () => {
    const other = await prisma.organization.create({ data: { name: "Autre", slug: `${tag}-other`, timeZone: "Europe/Zurich", publicationApprovedAt: new Date() } })
    try {
      expect(await answer(await signup([ids.montage], `${tag}-cross@example.org`, eventId, other.slug))).toEqual({ status: 404, body: { error: "Événement introuvable" } })
      expect(await prisma.volunteer.count({ where: { email: `${tag}-cross@example.org` } })).toBe(0)
      expect((await signup([ids.montage], `${tag}-same@example.org`, eventId, `${tag}-org`)).status).toBe(201)
    } finally {
      await prisma.organization.delete({ where: { id: other.id } })
    }
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

  it("on an event that confirms by email, the hourly limit of an address counts per connection", async () => {
    const confirming = await prisma.event.create({
      data: { organizationId: orgId, slug: "adresse-ip", title: "Adresse IP", startDate: new Date("2031-06-01"), endDate: new Date("2031-06-02"), publicStatus: "published", requireEmailConfirmation: true },
    })
    const shift = (await prisma.shift.create({ data: { eventId: confirming.id, roleName: "Accueil", label: "Accueil", capacity: 5, date: new Date("2031-06-01T00:00:00Z"), startTime: "14:00", endTime: "16:00" } })).id
    const address = `${tag}-per-ip-a@example.org`
    const ip1 = `${tag}-ip-fixed-1`
    const ip2 = `${tag}-ip-fixed-2`
    const from = (email: string, ip: string) => signup([shift], email, confirming.id, undefined, ip)

    for (let i = 0; i < SIGNUP_ADDRESS_LIMIT.max; i++) expect((await from(address, ip1)).status).toBe(201)
    const sixth = await from(address, ip1)
    expect(sixth.status).toBe(429)
    expect((await sixth.json()).error).toBe("Trop de demandes pour cette adresse. Réessaie dans une heure.")
    expect(Number(sixth.headers.get("Retry-After"))).toBeGreaterThan(0)
    // The address's owner, from another connection, is not refused by what the first one sent.
    expect((await from(address, ip2)).status).toBe(201)
    // Another address from the first connection has its own count.
    expect((await from(`${tag}-per-ip-b@example.org`, ip1)).status).toBe(201)
    // Still one pending request for the address: each new one replaced the previous.
    expect(await prisma.signupConfirmation.count({ where: { eventId: confirming.id, email: address, cancelledAt: null, confirmedAt: null } })).toBe(1)
  })
})
