import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * The workload protection (#1171) against a real Postgres, through every path that creates or moves
 * a commitment: public sign-up (with and without proof of the address), the organiser's manual add
 * (no « add anyway »), waitlist promotion and acceptance, request approval, restore, single and
 * series shift edits (atomic), both sides of a swap at offer and confirmation, the policy write
 * (scan on activation, loosening, off), and the locks: concurrent additions of one person, a swap
 * applied while the same person is added elsewhere, and a policy turned on while an addition waits.
 * Only the email send is mocked.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => guard.value }))
// Served as it will be once the capability ships; the beta gate itself is tested elsewhere.
vi.mock("@/lib/workload-shipped", () => ({ workloadProtectionShipped: () => true }))
vi.mock("@/lib/beta-access", async (orig) => ({ ...(await orig<typeof import("@/lib/beta-access")>()), canAdoptBeta: async () => true }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { generateToken } from "@/lib/utils"
import { registrationToken } from "@/lib/token-vault"
import { buildPolicy, WORKLOAD_BIRTHDATE_REQUIRED, WORKLOAD_POLICY_INCOMPLETE, WORKLOAD_PRIVATE_REFUSAL, type WorkloadPolicyValues } from "@/lib/workload-policy"
import { lockWorkloadExclusive } from "@/lib/workload-guard"
import { setWorkloadPolicy } from "@/lib/workload-policy-data"
import { POST as publicSignup } from "@/app/api/public/registrations/route"
import { POST as manualAdd } from "@/app/api/admin/registrations/route"
import { POST as waitlistConfirm } from "@/app/api/public/waitlist/[token]/confirm/route"
import { PATCH as editShift } from "@/app/api/admin/shifts/[id]/route"
import { POST as changeSeries } from "@/app/api/admin/shifts/recurrence/[id]/change/route"
import { promoteNextInWaitlist } from "@/lib/waitlist"
import { decideRequest } from "@/lib/registration-decision"
import { restoreRegistration } from "@/lib/registration-restore-action"
import { confirmSwap, offerSwap, publishSwapRequest } from "@/lib/shift-swap-server"
import { GET as personalPage } from "@/app/api/public/registrations/[token]/route"
import { PATCH as editEvent } from "@/app/api/admin/events/[id]/route"
import { PATCH as editPoste } from "@/app/api/admin/events/[id]/roles/[roleName]/route"
import { GET as listPlaces, POST as addPlace } from "@/app/api/admin/events/[id]/places/route"
import { PATCH as editPlace } from "@/app/api/admin/events/[id]/places/[placeId]/route"
import { POST as createShift } from "@/app/api/admin/shifts/route"
import { PUT as putLimits, DELETE as deleteLimits } from "@/app/api/admin/events/[id]/workload-limits/[volunteerId]/route"
import { GET as myLimitsGet, PUT as myLimitsPut, DELETE as myLimitsDelete } from "@/app/api/public/registrations/[token]/workload-limits/route"
import { loadAttention } from "@/lib/attention-data"

const url = process.env.DATABASE_URL
const tag = `int-workload-${Date.now()}`
const TZ = "Europe/Zurich"
// Illustrative values only, not proposed defaults.
const VALUES: WorkloadPolicyValues = {
  serviceDayStart: "08:00",
  maxContinuousMinutes: 6 * 60,
  minBreakMinutes: 30,
  maxDailyMinutes: 10 * 60,
  maxEventMinutes: 40 * 60,
  minRestMinutes: 10 * 60,
  maxIdleGapMinutes: 2 * 60,
}
const POLICY = buildPolicy(VALUES, TZ)
// Every write answers the days-off rule (#1171, lot 2); « do not apply » is an answer.
const ANSWERED: WorkloadPolicyValues = { ...VALUES, offDay: { apply: false }, meal: { apply: false }, travel: { apply: false }, minors: { apply: false } }
const ADMIN = { type: "admin" as const, id: "admin-1" }
const NOW = new Date("2031-06-01T08:00:00Z")

describe.skipIf(!url)("workload protection on Postgres (#1171)", () => {
  let orgId = ""
  let n = 0
  let ip = 0

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Asso ${tag}`, slug: tag, timeZone: TZ, publicationApprovedAt: new Date() } })).id
    guard.value = { db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "admin-1", email: `${tag}-admin@example.org` } } }
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.event.deleteMany({ where: { organizationId: orgId } })
      await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
      await prisma.charterVersion.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  async function event(over: { protection?: boolean; policy?: unknown; swaps?: boolean } = {}) {
    return prisma.event.create({
      data: {
        organizationId: orgId, slug: `${tag}-e${n++}`, title: "Festival", publicStatus: "published",
        startDate: new Date("2031-07-03"), endDate: new Date("2031-07-08"),
        workloadProtectionEnabled: over.protection ?? true,
        workloadPolicy: (over.policy ?? POLICY) as object,
        shiftSwapsEnabled: over.swaps ?? false,
      },
    })
  }
  const shift = (eventId: string, day: string, start: string, end: string, over: { roleName?: string; capacity?: number; waitlistEnabled?: boolean; recurrenceId?: string } = {}) =>
    prisma.shift.create({ data: { eventId, roleName: over.roleName ?? `Poste ${n++}`, label: "Mission", date: new Date(`${day}T00:00:00Z`), startTime: start, endTime: end, capacity: over.capacity ?? 5, waitlistEnabled: over.waitlistEnabled ?? false, recurrenceId: over.recurrenceId } })
  const person = (name = "Alex") => prisma.volunteer.create({ data: { organizationId: orgId, firstName: name, lastName: "Martin", email: `${tag}-${name.toLowerCase()}-${n++}@example.org` } })
  const hold = (eventId: string, shiftId: string, volunteerId: string, status = "active", token = generateToken()) =>
    prisma.registration.create({ data: { eventId, shiftId, volunteerId, status, ...registrationToken.data(token) } })

  const signup = (body: Record<string, unknown>) => publicSignup(new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${tag}-ip-${ip++}` },
    body: JSON.stringify({ firstName: "Alex", lastName: "Martin", consent: true, charterAccepted: true, ...body }),
  }))
  const add = (body: Record<string, unknown>) => manualAdd(new Request("http://localhost/api/admin/registrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))
  const committed = (eventId: string, volunteerId: string) => prisma.registration.count({ where: { eventId, volunteerId, status: { in: ["active", "requested"] } } })

  describe("public sign-up", () => {
    it("refuses a submission whose own shifts leave a 5 h wait, with the details, and writes nothing", async () => {
      const e = await event()
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const night = await shift(e.id, "2031-07-05", "01:00", "03:00")
      const email = `${tag}-new-${n++}@example.org`
      const res = await signup({ eventId: e.id, shiftIds: [day.id, night.id], email })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.code).toBe("workload")
      expect(body.error).toContain("laissent 5 h entre elles, de 20 h à 1 h")
      expect(await prisma.registration.count({ where: { eventId: e.id } })).toBe(0)
      // Rolled back with the registrations: no member record left behind (#309).
      expect(await prisma.volunteer.count({ where: { organizationId: orgId, email } })).toBe(0)
    })

    it("without proof of the address, a finding about shifts already held stays generic", async () => {
      const e = await event()
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const night = await shift(e.id, "2031-07-05", "01:00", "03:00")
      const email = `${tag}-anon-${n++}@example.org`
      expect((await signup({ eventId: e.id, shiftIds: [day.id], email })).status).toBe(201)
      const res = await signup({ eventId: e.id, shiftIds: [night.id], email })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe(WORKLOAD_PRIVATE_REFUSAL)
    })

    it("from the personal link (« Mes inscriptions »), the details are given", async () => {
      const e = await event()
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const night = await shift(e.id, "2031-07-05", "01:00", "03:00")
      const p = await person()
      const token = generateToken()
      await hold(e.id, day.id, p.id, "active", token)
      const res = await signup({ eventId: e.id, shiftIds: [night.id], email: p.email, personalToken: token })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("laissent 5 h entre elles")
      expect(body.workload).toHaveLength(1)
    })

    it("accepts what fits, and a waitlist entry is no mission", async () => {
      const e = await event()
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const full = await shift(e.id, "2031-07-05", "01:00", "03:00", { capacity: 1, waitlistEnabled: true })
      await hold(e.id, full.id, (await person("Other")).id)
      const email = `${tag}-wait-${n++}@example.org`
      const res = await signup({ eventId: e.id, shiftIds: [day.id, full.id], email })
      expect(res.status).toBe(201)
      expect((await res.json()).waitlistShifts).toBe(1)
    })
  })

  describe("organiser's manual add", () => {
    it("refuses, names the person, and allowOverLimit does not bypass it", async () => {
      const e = await event()
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const night = await shift(e.id, "2031-07-05", "01:00", "03:00")
      const p = await person("Lou")
      await hold(e.id, day.id, p.id)
      for (const allowOverLimit of [false, true]) {
        const res = await add({ eventId: e.id, shiftId: night.id, volunteerId: p.id, allowOverLimit })
        expect(res.status).toBe(409)
        const body = await res.json()
        expect(body.error).toContain("Lou Martin")
        expect(body.error).toContain("5 h")
      }
      expect(await committed(e.id, p.id)).toBe(1)
    })

    it("judges a new person's shifts before creating the member", async () => {
      const e = await event()
      const long = await shift(e.id, "2031-07-04", "08:00", "20:00")
      const res = await add({ eventId: e.id, shiftId: long.id, firstName: "Nina", lastName: "Roux" })
      expect(res.status).toBe(409)
      expect(await prisma.volunteer.count({ where: { organizationId: orgId, firstName: "Nina", lastName: "Roux" } })).toBe(0)
    })

    it("an event without protection keeps adding as before", async () => {
      const e = await event({ protection: false })
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const night = await shift(e.id, "2031-07-05", "01:00", "03:00")
      const p = await person()
      expect((await add({ eventId: e.id, shiftIds: [day.id, night.id], volunteerId: p.id })).status).toBe(201)
    })

    it("an enabled policy that does not parse accepts nothing (fail closed)", async () => {
      const e = await event({ policy: { version: 1, timeZone: TZ, serviceDayStart: "08:00" } })
      const s = await shift(e.id, "2031-07-04", "10:00", "11:00")
      const res = await add({ eventId: e.id, shiftId: s.id, volunteerId: (await person()).id })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe(WORKLOAD_POLICY_INCOMPLETE)
    })

    it("counts an explicit standby as work", async () => {
      const e = await event()
      const standby = await shift(e.id, "2031-07-04", "14:00", "18:00", { roleName: "Standby" })
      const truck = await shift(e.id, "2031-07-04", "18:00", "21:00", { roleName: "Camion 1" })
      const p = await person()
      await hold(e.id, standby.id, p.id)
      const res = await add({ eventId: e.id, shiftId: truck.id, volunteerId: p.id })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("7 h de missions d'affilée")
    })
  })

  describe("waitlist, approval and restore", () => {
    it("promotion passes over a person who could not take the place; acceptance refuses one who no longer can", async () => {
      const e = await event()
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const night = await shift(e.id, "2031-07-05", "01:00", "03:00", { capacity: 1, waitlistEnabled: true })
      const [holder, first, second] = [await person("Holder"), await person("First"), await person("Second")]
      const held = await hold(e.id, night.id, holder.id)
      await hold(e.id, day.id, first.id)
      const w1 = await prisma.registration.create({ data: { eventId: e.id, shiftId: night.id, volunteerId: first.id, status: "waiting", waitingPosition: 1, ...registrationToken.data(generateToken()) } })
      const w2 = await prisma.registration.create({ data: { eventId: e.id, shiftId: night.id, volunteerId: second.id, status: "waiting", waitingPosition: 2, ...registrationToken.data(generateToken()) } })
      await prisma.registration.update({ where: { id: held.id }, data: { status: "cancelled" } })
      expect(await promoteNextInWaitlist(night.id, undefined, NOW)).toBe(true)
      expect((await prisma.registration.findUniqueOrThrow({ where: { id: w1.id } })).status).toBe("waiting")
      expect((await prisma.registration.findUniqueOrThrow({ where: { id: w2.id } })).status).toBe("offered")

      // The second person meanwhile took the day shift (held before protection, say): accepting is refused.
      await hold(e.id, day.id, second.id)
      const token = generateToken()
      await prisma.registration.update({ where: { id: w2.id }, data: { ...registrationToken.data(token), waitingExpiresAt: new Date(Date.now() + 3600_000) } })
      const res = await waitlistConfirm(new Request(`http://localhost/api/public/waitlist/${token}/confirm`, { method: "POST", headers: { "x-forwarded-for": `${tag}-ip-${ip++}` } }), { params: Promise.resolve({ token }) })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("Tu ne peux pas prendre cette place")
      expect((await prisma.registration.findUniqueOrThrow({ where: { id: w2.id } })).status).toBe("offered")
    })

    it("approving a request judges it as added: an approval never turns a violation into a plan", async () => {
      const e = await event()
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const night = await shift(e.id, "2031-07-05", "01:00", "03:00")
      const p = await person()
      await hold(e.id, day.id, p.id)
      const request = await hold(e.id, night.id, p.id, "requested")
      const result = await decideRequest(getOrgClient(orgId), ADMIN, request.id, { decision: "accept" })
      expect(result).toMatchObject({ ok: false, httpStatus: 409, code: "workload" })
      expect((await prisma.registration.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("requested")
      // Refusing is always possible.
      expect(await decideRequest(getOrgClient(orgId), ADMIN, request.id, { decision: "refuse" })).toMatchObject({ ok: true, status: "refused" })
    })

    it("restoring a cancelled place is refused when it no longer fits", async () => {
      const e = await event()
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const night = await shift(e.id, "2031-07-05", "01:00", "03:00")
      const p = await person()
      await hold(e.id, day.id, p.id)
      const gone = await hold(e.id, night.id, p.id, "cancelled")
      await prisma.eventLog.create({ data: { eventId: e.id, actorType: "admin", action: "registration.cancelled", entityType: "Registration", entityId: gone.id, changes: { status: { from: "active", to: "cancelled" } } } })
      const result = await restoreRegistration(getOrgClient(orgId), ADMIN, gone.id, NOW)
      expect(result).toMatchObject({ ok: false, httpStatus: 409, code: "workload" })
      expect((await prisma.registration.findUniqueOrThrow({ where: { id: gone.id } })).status).toBe("cancelled")
    })
  })

  describe("shift and series edits", () => {
    it("refuses new hours that break a limit for someone holding the shift, and changes nothing", async () => {
      const e = await event()
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const late = await shift(e.id, "2031-07-04", "21:00", "22:00")
      const p = await person("Sam")
      await hold(e.id, day.id, p.id)
      await hold(e.id, late.id, p.id)
      const res = await editShift(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ startTime: "23:00", endTime: "23:59" }) }), { params: Promise.resolve({ id: late.id }) })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("Sam Martin")
      expect((await prisma.shift.findUniqueOrThrow({ where: { id: late.id } })).startTime).toBe("21:00")
      // A label change, or hours that still fit, go through.
      expect((await editShift(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ startTime: "21:30" }) }), { params: Promise.resolve({ id: late.id }) })).status).toBe(200)
    })

    it("a series change is all or nothing", async () => {
      const e = await event()
      const rule = await prisma.shiftRecurrence.create({ data: { eventId: e.id, roleName: "Accueil", label: "Accueil", weekdays: [5, 6], startTime: "20:00", endTime: "21:00", slotMinutes: 60, capacity: 3, fromDate: new Date("2031-07-04"), untilDate: new Date("2031-07-05") } })
      const fri = await shift(e.id, "2031-07-04", "20:00", "21:00", { roleName: "Accueil", recurrenceId: rule.id })
      const sat = await shift(e.id, "2031-07-05", "20:00", "21:00", { roleName: "Accueil", recurrenceId: rule.id })
      const day = await shift(e.id, "2031-07-05", "14:00", "19:00")
      const [ok, ko] = [await person("Free"), await person("Busy")]
      await hold(e.id, fri.id, ok.id)
      await hold(e.id, sat.id, ko.id)
      await hold(e.id, day.id, ko.id)
      // Moving the series to 23:00 leaves Busy 4 h waiting on Saturday: nothing moves, Friday included.
      const res = await changeSeries(new Request("http://localhost", { method: "POST", body: JSON.stringify({ from: "2031-07-04", startTime: "23:00", endTime: "23:59" }) }), { params: Promise.resolve({ id: rule.id }) })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("Busy Martin")
      expect((await prisma.shift.findMany({ where: { recurrenceId: rule.id } })).map((s) => s.startTime)).toEqual(["20:00", "20:00"])
    })
  })

  describe("swaps", () => {
    async function swapSetup() {
      const e = await event({ swaps: true })
      const a = await shift(e.id, "2031-07-04", "08:00", "10:00", { roleName: "Bar" })
      const b = await shift(e.id, "2031-07-04", "15:00", "17:00", { roleName: "Bar" })
      const own = await shift(e.id, "2031-07-04", "11:00", "12:00")
      const [pierre, jean] = [await person("Pierre"), await person("Jean")]
      const rp = await hold(e.id, a.id, pierre.id)
      const rj = await hold(e.id, b.id, jean.id)
      await hold(e.id, own.id, pierre.id)
      return { e, a, b, pierre, jean, rp, rj }
    }

    it("refuses an offer that would leave one participant waiting too long, without saying whose plan", async () => {
      const { pierre, jean, rp, rj } = await swapSetup()
      const pub = await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: NOW })
      expect(pub.ok).toBe(true)
      if (!pub.ok) return
      const offer = await offerSwap(prisma, { requestId: pub.requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })
      expect(offer).toMatchObject({ ok: false, code: "workload_idle", status: "open" })
      if (!offer.ok) expect(offer.error).toBe("Cet échange ne peut pas être effectué : l'attente entre deux missions dépasserait la limite de l'événement.")
    })

    it("checks again at confirmation: a policy turned on after the offer ends the request", async () => {
      const { e, pierre, jean, rp, rj } = await swapSetup()
      await prisma.event.update({ where: { id: e.id }, data: { workloadProtectionEnabled: false } })
      const pub = await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: NOW })
      if (!pub.ok) throw new Error(pub.error)
      const offer = await offerSwap(prisma, { requestId: pub.requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })
      expect(offer.ok).toBe(true)
      await prisma.event.update({ where: { id: e.id }, data: { workloadProtectionEnabled: true } })
      const req = await prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id: pub.requestId } })
      const done = await confirmSwap(prisma, { requestId: pub.requestId, volunteerId: pierre.id, revision: req.revision, now: NOW })
      expect(done).toMatchObject({ ok: false, status: "impossible", code: "workload_idle" })
      expect((await prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id: pub.requestId } })).endReason).toBe("workload_idle")
    })
  })

  describe("the policy write", () => {
    it("refuses to turn protection on while a commitment breaks it, then accepts once resolved; off is always possible", async () => {
      const e = await event({ protection: false, policy: null })
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const night = await shift(e.id, "2031-07-05", "01:00", "03:00")
      const p = await person("Kim")
      await hold(e.id, day.id, p.id)
      const extra = await hold(e.id, night.id, p.id)
      const db = getOrgClient(orgId)
      const refused = await setWorkloadPolicy(db, orgId, e.id, { enabled: true, values: ANSWERED })
      expect(refused).toMatchObject({ ok: false, status: 409, findings: [expect.objectContaining({ name: "Kim Martin", messages: [expect.stringContaining("5 h")] })] })
      expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).workloadProtectionEnabled).toBe(false)
      // Incomplete values are never « no limit ».
      expect(await setWorkloadPolicy(db, orgId, e.id, { enabled: true, values: { ...ANSWERED, maxIdleGapMinutes: undefined } })).toMatchObject({ ok: false, status: 400 })

      await prisma.registration.update({ where: { id: extra.id }, data: { status: "cancelled" } })
      const on = await setWorkloadPolicy(db, orgId, e.id, { enabled: true, values: ANSWERED })
      expect(on).toMatchObject({ ok: true, enabled: true, changes: { workloadProtectionEnabled: { from: false, to: true } } })
      expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).workloadPolicy).toMatchObject({ version: 5, offDay: { apply: false }, meal: { apply: false }, travel: { apply: false }, timeZone: TZ, serviceDayStart: "08:00" })

      // A finding left by a later change (here written directly) does not block a loosening, but blocks a tightening.
      await prisma.registration.update({ where: { id: extra.id }, data: { status: "active" } })
      expect(await setWorkloadPolicy(db, orgId, e.id, { enabled: true, values: { ...ANSWERED, maxDailyMinutes: 11 * 60 } })).toMatchObject({ ok: true })
      expect(await setWorkloadPolicy(db, orgId, e.id, { enabled: true, values: { ...ANSWERED, maxIdleGapMinutes: 60 } })).toMatchObject({ ok: false, status: 409 })
      expect(await setWorkloadPolicy(db, orgId, e.id, { enabled: false })).toMatchObject({ ok: true, enabled: false })
    })
  })

  describe("what the pages read", () => {
    it("the personal page, the dashboard and the public page see the findings left by a cancellation", async () => {
      const e = await event()
      const a = await shift(e.id, "2031-07-04", "08:00", "10:00")
      const middle = await shift(e.id, "2031-07-04", "10:00", "16:00")
      const c = await shift(e.id, "2031-07-04", "16:00", "17:00")
      const p = await person("Eva")
      const token = generateToken()
      await hold(e.id, a.id, p.id, "active", token)
      const gone = await hold(e.id, middle.id, p.id, "active")
      await hold(e.id, c.id, p.id, "active")
      // 9 h in a row: written directly (as before protection), then the middle shift withdrawn.
      await prisma.registration.update({ where: { id: gone.id }, data: { status: "cancelled" } })
      const res = await personalPage(new Request(`http://localhost/api/public/registrations/${token}`, { headers: { "x-forwarded-for": `${tag}-ip-${ip++}` } }), { params: Promise.resolve({ token }) })
      expect(res.status).toBe(200)
      expect((await res.json()).workload).toEqual([expect.stringContaining("ces deux missions laissent 6 h entre elles, de 10 h à 16 h")])
      const items = await loadAttention(getOrgClient(orgId), orgId, NOW, { eventId: e.id })
      expect(items.find((i) => i.id === `workload:${e.id}`)).toMatchObject({ severity: "high" })
    })
  })

  describe("locks", () => {
    it("two concurrent additions of one person that only break a limit together: one wins", async () => {
      const e = await event()
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const night = await shift(e.id, "2031-07-05", "01:00", "03:00")
      const p = await person()
      const results = await Promise.all([add({ eventId: e.id, shiftId: day.id, volunteerId: p.id }), add({ eventId: e.id, shiftId: night.id, volunteerId: p.id })])
      expect(results.map((r) => r.status).sort()).toEqual([201, 409])
      expect(await committed(e.id, p.id)).toBe(1)
    })

    it("a swap applied while the same person is added elsewhere: one wins", async () => {
      const e = await event({ swaps: true })
      const a = await shift(e.id, "2031-07-04", "08:00", "10:00", { roleName: "Bar" })
      const b = await shift(e.id, "2031-07-04", "11:00", "13:00", { roleName: "Bar" })
      const late = await shift(e.id, "2031-07-04", "16:00", "17:00")
      const [pierre, jean] = [await person("Pierre"), await person("Jean")]
      const rp = await hold(e.id, a.id, pierre.id)
      const rj = await hold(e.id, b.id, jean.id)
      // Taking b (11-13) and late (16-17) leaves Pierre 3 h waiting; either alone is fine.
      const pub = await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: NOW })
      if (!pub.ok) throw new Error(pub.error)
      const offer = await offerSwap(prisma, { requestId: pub.requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })
      expect(offer.ok).toBe(true)
      const req = await prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id: pub.requestId } })
      const [swap, added] = await Promise.all([
        confirmSwap(prisma, { requestId: pub.requestId, volunteerId: pierre.id, revision: req.revision, now: NOW }),
        add({ eventId: e.id, shiftId: late.id, volunteerId: pierre.id }),
      ])
      const swapped = swap.ok && swap.status === "applied"
      expect([swapped, added.status === 201].filter(Boolean)).toHaveLength(1)
    })

    it("a policy turned on while an addition waits: the addition reads the new policy", async () => {
      const e = await event({ protection: false })
      const day = await shift(e.id, "2031-07-04", "14:00", "20:00")
      const night = await shift(e.id, "2031-07-05", "01:00", "03:00")
      const p = await person()
      await hold(e.id, day.id, p.id)
      let release!: () => void
      const held = new Promise<void>((r) => { release = r })
      let locked!: () => void
      const isLocked = new Promise<void>((r) => { locked = r })
      const writer = prisma.$transaction(async (tx) => {
        await lockWorkloadExclusive(tx, e.id)
        await tx.event.update({ where: { id: e.id }, data: { workloadProtectionEnabled: true } })
        locked()
        await held
      }, { timeout: 20_000 })
      await isLocked
      const pending = add({ eventId: e.id, shiftId: night.id, volunteerId: p.id })
      await new Promise((r) => setTimeout(r, 300))
      release()
      await writer
      expect((await pending).status).toBe(409)
    })
  })

  // #1171 lot 2: at least N days without mission in every P service days of the event (3 to 8 July).
  describe("days without mission", () => {
    const withOffDay = (minOffDays: number, windowDays: number) => buildPolicy({ ...VALUES, maxEventMinutes: 100 * 60, offDay: { apply: true, minOffDays, windowDays } }, TZ)
    const DAYS = ["2031-07-03", "2031-07-04", "2031-07-05", "2031-07-06", "2031-07-07", "2031-07-08"]
    const patchEvent = (id: string, body: Record<string, unknown>) => editEvent(
      new Request(`http://localhost/api/admin/events/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      { params: Promise.resolve({ id }) },
    )

    it("refuses the organiser's add of a sixth day in a row with 1 day off in 6, and says why", async () => {
      const e = await event({ policy: withOffDay(1, 6) })
      const shifts = await Promise.all(DAYS.map((d) => shift(e.id, d, "10:00", "14:00")))
      const p = await person()
      for (const sh of shifts.slice(0, 5)) await hold(e.id, sh.id, p.id)
      const res = await add({ eventId: e.id, shiftId: shifts[5].id, volunteerId: p.id })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("6 journées de service d'affilée, toutes avec une mission")
      expect(await committed(e.id, p.id)).toBe(5)
    })

    it("a version-1 policy (saved before the rule existed) still reads and applies no days-off rule", async () => {
      const e = await event({ policy: POLICY })
      const shifts = await Promise.all(DAYS.map((d) => shift(e.id, d, "10:00", "14:00")))
      const p = await person()
      for (const sh of shifts.slice(0, 5)) await hold(e.id, sh.id, p.id)
      expect((await add({ eventId: e.id, shiftId: shifts[5].id, volunteerId: p.id })).status).toBe(201)
    })

    it("turning the rule on is refused while a programme breaks it", async () => {
      const e = await event({ policy: POLICY })
      const shifts = await Promise.all(DAYS.map((d) => shift(e.id, d, "10:00", "14:00")))
      const p = await person()
      for (const sh of shifts) await hold(e.id, sh.id, p.id)
      const refused = await setWorkloadPolicy(prisma, orgId, e.id, { enabled: true, values: { ...VALUES, offDay: { apply: true, minOffDays: 1, windowDays: 6 }, meal: { apply: false }, travel: { apply: false }, minors: { apply: false } } })
      expect(refused.ok).toBe(false)
      if (!refused.ok) expect(refused.status).toBe(409)
      // « Ne pas appliquer » is an answer: saved, nothing to scan.
      expect((await setWorkloadPolicy(prisma, orgId, e.id, { enabled: true, values: { ...VALUES, offDay: { apply: false }, meal: { apply: false }, travel: { apply: false }, minors: { apply: false } } })).ok).toBe(true)
      expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).workloadPolicy).toMatchObject({ version: 5, offDay: { apply: false }, meal: { apply: false }, travel: { apply: false }, minors: { apply: false } })
      // A save without the answer is refused, never read as « no rule ».
      const blank = await setWorkloadPolicy(prisma, orgId, e.id, { enabled: true, values: VALUES })
      expect(blank.ok).toBe(false)
      if (!blank.ok) expect(blank.status).toBe(400)
    })

    it("longer event dates that would break the rule are refused for everyone, and the dates are kept", async () => {
      const e = await event({ policy: withOffDay(2, 7) })
      const shifts = await Promise.all(DAYS.map((d) => shift(e.id, d, "10:00", "14:00")))
      const p = await person("Sami")
      for (const sh of shifts) await hold(e.id, sh.id, p.id)
      // 6 days: no complete period of 7. With 9 July, the period 3-9 July has only one day off.
      const res = await patchEvent(e.id, { endDate: "2031-07-09" })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.code).toBe("workload")
      expect(body.error).toContain("Dates non enregistrées")
      expect(body.workload[0]).toContain("Sami Martin : ")
      expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).endDate.toISOString().slice(0, 10)).toBe("2031-07-08")
      expect((await patchEvent(e.id, { startDate: "2031-07-02" })).status).toBe(409)
      // Other edits, and the same dates, go through.
      expect((await patchEvent(e.id, { title: "Festival 2031" })).status).toBe(200)
      expect((await patchEvent(e.id, { startDate: "2031-07-03", endDate: "2031-07-08" })).status).toBe(200)
      // Without anyone over the rule, longer dates are fine.
      const other = await event({ policy: withOffDay(2, 7) })
      expect((await patchEvent(other.id, { endDate: "2031-07-09" })).status).toBe(200)
    })
  })

  // #1171 lot 2: meals. 30 min inside 11:30-14:00 when a mission touches it; « repas sur le pouce ».
  describe("meals", () => {
    const MEAL_POLICY = buildPolicy({ ...VALUES, maxContinuousMinutes: 10 * 60, maxDailyMinutes: 12 * 60, maxEventMinutes: 100 * 60, offDay: { apply: false }, meal: { apply: true, minutes: 30, windows: [{ start: "11:30", end: "14:00" }], days: "all" } }, TZ)
    const flag = (id: string, mealOnTheGo: boolean) => prisma.shift.update({ where: { id }, data: { mealOnTheGo } })

    it("refuses a mission that leaves no lunch, accepts it when the meal can be taken on the go", async () => {
      const e = await event({ policy: MEAL_POLICY })
      const long = await shift(e.id, "2031-07-04", "10:00", "15:00")
      const p = await person()
      const res = await add({ eventId: e.id, shiftId: long.id, volunteerId: p.id })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("pas de pause repas de 30 min entre 11 h 30 et 14 h")
      await flag(long.id, true)
      expect((await add({ eventId: e.id, shiftId: long.id, volunteerId: p.id })).status).toBe(201)
    })

    it("removing « repas sur le pouce » from a shift someone holds is refused when it takes their lunch away", async () => {
      const e = await event({ policy: MEAL_POLICY })
      const long = await shift(e.id, "2031-07-04", "10:00", "15:00", { roleName: "Bar" })
      const other = await shift(e.id, "2031-07-05", "10:00", "15:00", { roleName: "Bar" })
      await flag(long.id, true)
      await flag(other.id, true)
      const p = await person("Lou")
      await hold(e.id, long.id, p.id)
      const res = await editShift(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ mealOnTheGo: false }) }), { params: Promise.resolve({ id: long.id }) })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("sans repas sur le pouce sur ce créneau, le programme de Lou Martin")
      expect((await prisma.shift.findUniqueOrThrow({ where: { id: long.id } })).mealOnTheGo).toBe(true)
      // Nobody holds the other one: removing it is fine.
      expect((await editShift(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ mealOnTheGo: false }) }), { params: Promise.resolve({ id: other.id }) })).status).toBe(200)
      // The poste-wide switch is judged the same way and changes nothing when refused.
      const patchPoste = (body: Record<string, unknown>) => editPoste(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: e.id, roleName: "Bar" }) })
      const poste = await patchPoste({ mealOnTheGo: false })
      expect(poste.status).toBe(409)
      expect((await prisma.shift.findUniqueOrThrow({ where: { id: long.id } })).mealOnTheGo).toBe(true)
      expect((await patchPoste({ mealOnTheGo: true })).status).toBe(200)
      expect((await prisma.shift.findUniqueOrThrow({ where: { id: other.id } })).mealOnTheGo).toBe(true)
    })

    it("a wait across lunch may be longer by the meal; turning the meal rule on is refused while a programme lacks lunch", async () => {
      const e = await event({ policy: POLICY })
      const morning = await shift(e.id, "2031-07-04", "09:00", "11:30")
      const afternoon = await shift(e.id, "2031-07-04", "14:00", "16:00")
      const long = await shift(e.id, "2031-07-05", "10:00", "15:00")
      const p = await person()
      await hold(e.id, morning.id, p.id)
      await hold(e.id, long.id, p.id)
      // 2 h 30 between the two: over the 2 h idle limit of version 1, but it holds lunch with meals.
      expect((await add({ eventId: e.id, shiftId: afternoon.id, volunteerId: p.id })).status).toBe(409)
      const values = { ...VALUES, offDay: { apply: false }, meal: { apply: true, minutes: 30, windows: [{ start: "11:30", end: "14:00" }], days: "all" }, travel: { apply: false }, minors: { apply: false } }
      const refused = await setWorkloadPolicy(prisma, orgId, e.id, { enabled: true, values })
      expect(refused).toMatchObject({ ok: false, status: 409 })
      await prisma.registration.updateMany({ where: { shiftId: long.id }, data: { status: "cancelled" } })
      expect((await setWorkloadPolicy(prisma, orgId, e.id, { enabled: true, values })).ok).toBe(true)
      expect((await add({ eventId: e.id, shiftId: afternoon.id, volunteerId: p.id })).status).toBe(201)
    })
  })

  // #1171 lot 2: places and the travel margin (invented stage names).
  describe("places and travel", () => {
    const TRAVEL_POLICY = buildPolicy({ ...VALUES, maxEventMinutes: 100 * 60, offDay: { apply: false }, meal: { apply: false }, travel: { apply: true, minutes: 15 } }, TZ)
    const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const newPlace = async (eventId: string, name: string) => {
      const res = await addPlace(new Request("http://localhost", json({ name })), { params: Promise.resolve({ id: eventId }) })
      return { res, body: await res.json() }
    }

    it("creates, renames, archives and restores places; names are unique among active places", async () => {
      const e = await event({ policy: TRAVEL_POLICY })
      const gs = await newPlace(e.id, "Grande Scène")
      expect(gs.res.status).toBe(201)
      expect((await newPlace(e.id, " grande  scène ")).res.status).toBe(409)
      expect((await newPlace(e.id, "")).res.status).toBe(400)
      const patch = (placeId: string, body: unknown) => editPlace(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: e.id, placeId }) })
      expect((await patch(gs.body.place.id, { name: "Scène du Lac" })).status).toBe(200)
      expect((await patch(gs.body.place.id, { archived: true })).status).toBe(200)
      // An archived name never blocks a new place; restoring it is refused while an active one has it.
      const again = await newPlace(e.id, "Scène du Lac")
      expect(again.res.status).toBe(201)
      expect((await patch(gs.body.place.id, { archived: false })).status).toBe(409)
      const list = await (await listPlaces(new Request("http://localhost"), { params: Promise.resolve({ id: e.id }) })).json()
      expect(list.places.map((p: { name: string; archivedAt: string | null }) => [p.name, !!p.archivedAt])).toEqual([["Scène du Lac", false], ["Scène du Lac", true]])
    })

    it("a shift takes an active place of the event only; another event's or an archived one is refused", async () => {
      const e = await event({ policy: TRAVEL_POLICY })
      const other = await event({ policy: TRAVEL_POLICY })
      const mine = (await newPlace(e.id, "Chapiteau")).body.place
      const theirs = (await newPlace(other.id, "La Ruche")).body.place
      const create = (placeId: string) => createShift(new Request("http://localhost", json({ eventId: e.id, roleName: `Poste ${n++}`, label: "Mission", date: "2031-07-04", startTime: "10:00", endTime: "12:00", capacity: 2, placeId })))
      expect((await create(mine.id)).status).toBe(201)
      expect((await create(theirs.id)).status).toBe(400)
      await editPlace(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ archived: true }) }), { params: Promise.resolve({ id: e.id, placeId: mine.id }) })
      expect((await create(mine.id)).status).toBe(400)
    })

    it("refuses missions too close at two places, and at two places at once; a new place is judged like new hours", async () => {
      const e = await event({ policy: TRAVEL_POLICY })
      const gs = (await newPlace(e.id, "Grande Scène")).body.place
      const dome = (await newPlace(e.id, "Le Dôme")).body.place
      const morning = await prisma.shift.create({ data: { eventId: e.id, roleName: "Backline", label: "Mission", date: new Date("2031-07-04T00:00:00Z"), startTime: "10:00", endTime: "14:00", capacity: 3, placeId: gs.id } })
      const close = await prisma.shift.create({ data: { eventId: e.id, roleName: "Câbles", label: "Mission", date: new Date("2031-07-04T00:00:00Z"), startTime: "14:05", endTime: "16:00", capacity: 3, placeId: dome.id } })
      const later = await prisma.shift.create({ data: { eventId: e.id, roleName: "Praticables", label: "Mission", date: new Date("2031-07-04T00:00:00Z"), startTime: "14:15", endTime: "16:00", capacity: 3, placeId: gs.id } })
      const p = await person("Noa")
      await hold(e.id, morning.id, p.id)
      const res = await add({ eventId: e.id, shiftId: close.id, volunteerId: p.id })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("seulement 5 min entre une mission à « Grande Scène » qui finit à 14 h et une mission à « Le Dôme » qui commence à 14 h 05")
      expect((await add({ eventId: e.id, shiftId: later.id, volunteerId: p.id })).status).toBe(201)
      // Moving the later shift to Le Dôme: 15 min, still enough. Moving it to start at 14:05 there is not.
      const move = (body: unknown) => editShift(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: later.id }) })
      expect((await move({ placeId: dome.id })).status).toBe(200)
      const refused = await move({ startTime: "14:05" })
      expect(refused.status).toBe(409)
      expect((await refused.json()).error).toContain("Noa Martin")
      // A shift without a place is never checked.
      expect((await move({ placeId: null, startTime: "14:00" })).status).toBe(200)
    })
  })
  // #1171 lot 2: minors and personal limits.
  describe("minors and personal limits", () => {
    const MINORS = { apply: true, maxContinuousMinutes: 270, minBreakMinutes: 30, maxDailyMinutes: 480, minRestMinutes: 720 }
    const MINOR_POLICY = buildPolicy({ ...VALUES, maxEventMinutes: 100 * 60, offDay: { apply: false }, meal: { apply: false }, travel: { apply: false }, minors: MINORS } as WorkloadPolicyValues, TZ)
    const born = (id: string, birthDate: string | null) => prisma.volunteer.update({ where: { id }, data: { birthDate: birthDate ? new Date(birthDate) : null } })
    const limitsRoute = (eventId: string, volunteerId: string, method: "PUT" | "DELETE", limits?: unknown) =>
      (method === "PUT" ? putLimits : deleteLimits)(new Request("http://localhost", { method, body: limits === undefined ? undefined : JSON.stringify({ limits }) }), { params: Promise.resolve({ id: eventId, volunteerId }) })

    it("a minor gets the minors' limits, an adult the event's; no birth date: no new commitment until one is given", async () => {
      const e = await event({ policy: MINOR_POLICY })
      const five = await shift(e.id, "2031-07-04", "09:00", "14:00")
      const young = await person("Ines")
      await born(young.id, "2015-03-01")
      const res = await add({ eventId: e.id, shiftId: five.id, volunteerId: young.id })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("La limite de cet événement pour les moins de 18 ans est de 4 h 30.")
      const grown = await person("Marc")
      await born(grown.id, "1990-03-01")
      expect((await add({ eventId: e.id, shiftId: five.id, volunteerId: grown.id })).status).toBe(201)
      // Unknown birth date: refused, then accepted once given (and stored, never replaced).
      const unknown = await person("Noe")
      const refused = await add({ eventId: e.id, shiftId: five.id, volunteerId: unknown.id })
      expect(refused.status).toBe(409)
      expect((await refused.json()).workload).toEqual([WORKLOAD_BIRTHDATE_REQUIRED])
      expect((await add({ eventId: e.id, shiftId: five.id, volunteerId: unknown.id, birthDate: "1995-05-05" })).status).toBe(201)
      expect((await prisma.volunteer.findUniqueOrThrow({ where: { id: unknown.id } })).birthDate?.toISOString().slice(0, 10)).toBe("1995-05-05")
    })

    it("personal limits: stricter or equal only, refused while the programme breaks them, enforced afterwards; the person's own layer stays", async () => {
      const e = await event({ policy: MINOR_POLICY })
      const morning = await shift(e.id, "2031-07-04", "09:00", "12:00")
      const afternoon = await shift(e.id, "2031-07-04", "13:00", "17:00")
      const p = await person("Lea")
      await born(p.id, "1990-01-01")
      await hold(e.id, morning.id, p.id)
      expect((await limitsRoute(e.id, p.id, "PUT", { maxDailyMinutes: 11 * 60 })).status).toBe(400) // looser than the event
      expect((await limitsRoute(e.id, p.id, "PUT", { maxDailyMinutes: 2 * 60 })).status).toBe(409) // breaks the 3 h held
      expect((await limitsRoute(e.id, p.id, "PUT", { maxDailyMinutes: 6 * 60 })).status).toBe(200)
      const res = await add({ eventId: e.id, shiftId: afternoon.id, volunteerId: p.id })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("La limite personnelle de cette personne est de 6 h par journée de service.")
      // The person's own, stricter limit stays when the organisation removes its own.
      await prisma.eventVolunteerLimit.update({ where: { eventId_volunteerId: { eventId: e.id, volunteerId: p.id } }, data: { values: { version: 1, admin: { maxDailyMinutes: 360 }, volunteer: { maxDailyMinutes: 300 } } } })
      expect((await limitsRoute(e.id, p.id, "DELETE")).status).toBe(200)
      const left = await prisma.eventVolunteerLimit.findUniqueOrThrow({ where: { eventId_volunteerId: { eventId: e.id, volunteerId: p.id } } })
      expect(left.values).toEqual({ version: 1, volunteer: { maxDailyMinutes: 300 } })
    })
    it("from the personal link: the person sets, changes and removes their own layer only", async () => {
      const e = await event({ policy: MINOR_POLICY })
      const s1 = await shift(e.id, "2031-07-04", "09:00", "11:00")
      const p = await person("Yan")
      await born(p.id, "1990-01-01")
      const link = generateToken()
      await hold(e.id, s1.id, p.id, "active", link)
      const call = (method: "GET" | "PUT" | "DELETE", limits?: unknown) => {
        const handler = method === "GET" ? myLimitsGet : method === "PUT" ? myLimitsPut : myLimitsDelete
        return handler(new Request("http://localhost", { method, headers: { "x-forwarded-for": `${tag}-ip-${ip++}` }, body: limits === undefined ? undefined : JSON.stringify({ limits }) }), { params: Promise.resolve({ token: link }) })
      }
      expect(await (await call("GET")).json()).toMatchObject({ available: true, mine: null, organisation: null })
      expect((await call("PUT", { maxDailyMinutes: 5 * 60 })).status).toBe(200)
      await limitsRoute(e.id, p.id, "PUT", { maxDailyMinutes: 4 * 60 })
      // Removing their own leaves the organisation's.
      const after = await (await call("DELETE")).json()
      expect(after).toMatchObject({ mine: null, organisation: { maxDailyMinutes: 240 } })
    })
  })
})
