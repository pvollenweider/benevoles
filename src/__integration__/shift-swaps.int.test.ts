import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"

/**
 * Shift swaps between volunteers (#1174) against a real Postgres: the whole flow (publish, offer,
 * confirm, approval), the swap of the two registrations' shifts with each person's own link kept,
 * and the races of the framing: double click and replayed action (E14), two approvals at once,
 * two requests on one registration (E10), an error after the first SQL write (E15), an SMTP
 * failure after the commit (E16), a shift changed after the agreement (E13), the deadline (E08),
 * a second swap that conflicts once the first is applied (E12), the option switched off during an
 * acceptance (E19), a suspended organisation (T05) and another organisation's id (T07).
 *
 * Races are held on a barrier at the first lock (lockShifts), so both transactions really start
 * before either takes it. No email leaves: sendNotification is mocked, delivery is after the
 * response (mocked `after`), and the outbox rows are what is checked.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: false, reason: "SMTP down" }) }))

const lockHook = vi.hoisted(() => ({ fn: null as null | (() => Promise<void>) }))
vi.mock("@/lib/registration-capacity", async (orig) => {
  const actual = await orig<typeof import("@/lib/registration-capacity")>()
  return {
    ...actual,
    lockShifts: async (...args: Parameters<typeof actual.lockShifts>) => {
      if (lockHook.fn) await lockHook.fn()
      return actual.lockShifts(...args)
    },
  }
})

const outboxHook = vi.hoisted(() => ({ fail: false }))
vi.mock("@/lib/notifications/outbox", async (orig) => {
  const actual = await orig<typeof import("@/lib/notifications/outbox")>()
  return {
    ...actual,
    enqueueNotifications: async (...args: Parameters<typeof actual.enqueueNotifications>) => {
      if (outboxHook.fail) {
        outboxHook.fail = false
        throw new Error("outbox write failed")
      }
      return actual.enqueueNotifications(...args)
    },
  }
})

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { generateToken } from "@/lib/utils"
import { registrationToken } from "@/lib/token-vault"
import { deliverOutbox } from "@/lib/notifications/outbox"
import {
  confirmSwap, declineSwapOffer, decideSwap, endSwapRequests, expireSwapRequests, offerSwap, publishSwapRequest,
  withdrawSwapOffer, withdrawSwapRequest,
} from "@/lib/shift-swap-server"

const url = process.env.DATABASE_URL
const tag = `int-swaps-${Date.now()}`

/** Holds every caller until `n` of them arrived, then lets them race. */
function barrier(n: number) {
  let arrived = 0
  let open!: () => void
  const opened = new Promise<void>((resolve) => { open = resolve })
  return async () => {
    arrived++
    if (arrived >= n) open()
    await opened
  }
}

const NOW = new Date("2030-06-01T08:00:00Z")

describe.skipIf(!url)("shift swaps on Postgres (#1174)", () => {
  let orgId = ""
  let otherOrgId = ""
  let n = 0

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Asso ${tag}`, slug: tag, timeZone: "Europe/Zurich" } })).id
    otherOrgId = (await prisma.organization.create({ data: { name: `Autre ${tag}`, slug: `${tag}-other` } })).id
  })

  beforeEach(() => {
    lockHook.fn = null
    outboxHook.fail = false
  })

  afterAll(async () => {
    lockHook.fn = null
    for (const id of [orgId, otherOrgId].filter(Boolean)) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: id } })
      await prisma.event.deleteMany({ where: { organizationId: id } })
      await prisma.volunteer.deleteMany({ where: { organizationId: id } })
      await prisma.organization.delete({ where: { id } })
    }
    await prisma.$disconnect()
  })

  type ShiftSpec = { roleName?: string; day?: string; start?: string; end?: string; requiresApproval?: boolean; minAge?: number; reservedTags?: string[]; maxPerVolunteer?: number }

  async function setup(opts: { approval?: boolean; shifts?: ShiftSpec[]; enabled?: boolean } = {}) {
    const event = await prisma.event.create({
      data: {
        organizationId: orgId, slug: `${tag}-e${n++}`, title: "Fête", publicStatus: "published",
        startDate: new Date("2030-07-04"), endDate: new Date("2030-07-06"),
        shiftSwapsEnabled: opts.enabled ?? true, shiftSwapsApproval: opts.approval ?? false,
      },
    })
    const specs = opts.shifts ?? [{ day: "2030-07-04", start: "10:00", end: "12:00" }, { day: "2030-07-05", start: "14:00", end: "16:00" }]
    const shifts = []
    for (const s of specs) {
      shifts.push(await prisma.shift.create({
        data: {
          eventId: event.id, roleName: s.roleName ?? "Bar", label: s.roleName ?? "Bar", date: new Date(`${s.day ?? "2030-07-04"}T00:00:00Z`),
          startTime: s.start ?? "10:00", endTime: s.end ?? "12:00", capacity: 2,
          requiresApproval: s.requiresApproval ?? false, minAge: s.minAge ?? null, reservedTags: s.reservedTags ?? [], maxPerVolunteer: s.maxPerVolunteer ?? null,
        },
      }))
    }
    return { event, shifts }
  }

  async function person(name: string, extra: { birthDate?: Date; tags?: string[] } = {}) {
    return prisma.volunteer.create({ data: { organizationId: orgId, firstName: name, lastName: "Test", email: `${tag}-${name.toLowerCase()}-${n++}@example.org`, ...extra } })
  }

  async function register(eventId: string, shiftId: string, volunteerId: string, extra: Record<string, unknown> = {}) {
    return prisma.registration.create({ data: { eventId, shiftId, volunteerId, status: "active", ...registrationToken.data(generateToken()), ...extra } })
  }

  /** Pierre on shift 0, Jean on shift 1, Pierre's request published and Jean's offer made. */
  async function offered(opts: Parameters<typeof setup>[0] = {}) {
    const { event, shifts } = await setup(opts)
    const pierre = await person("Pierre")
    const jean = await person("Jean")
    const rp = await register(event.id, shifts[0].id, pierre.id)
    const rj = await register(event.id, shifts[1].id, jean.id)
    const pub = await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: NOW })
    if (!pub.ok) throw new Error(pub.error)
    const offer = await offerSwap(prisma, { requestId: pub.requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })
    if (!offer.ok) throw new Error(offer.error)
    const req = await prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id: pub.requestId } })
    return { event, shifts, pierre, jean, rp, rj, requestId: pub.requestId, revision: req.revision }
  }

  const shiftOf = async (id: string) => (await prisma.registration.findUniqueOrThrow({ where: { id } })).shiftId
  const statusOf = async (id: string) => (await prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id } })).status
  const outboxKinds = async (eventTitlePrefix: string) => {
    void eventTitlePrefix
    return (await prisma.notificationOutbox.findMany({ where: { organizationId: orgId }, select: { dedupeKey: true } })).map((r) => r.dedupeKey ?? "")
  }

  it("E01: publish, offer, confirm: the two registrations trade shifts, each person keeps their own link", async () => {
    const { event, shifts, pierre, jean, rp, rj, requestId, revision } = await offered()
    // State the swap must reset: reminders already sent, check-in, waitlist fields.
    await prisma.registration.update({ where: { id: rp.id }, data: { reminderJ2Sent: NOW, reminderJ1Sent: NOW, checkedInAt: NOW, waitingPosition: 3 } })

    const res = await confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })
    expect(res).toEqual({ ok: true, requestId, status: "applied" })

    const [p, j] = await Promise.all([rp.id, rj.id].map((id) => prisma.registration.findUniqueOrThrow({ where: { id } })))
    expect(p.shiftId).toBe(shifts[1].id)
    expect(j.shiftId).toBe(shifts[0].id)
    // Same registrations, same people, same tokens: no link changes hands.
    expect([p.volunteerId, p.editTokenHash]).toEqual([pierre.id, rp.editTokenHash])
    expect([j.volunteerId, j.editTokenHash]).toEqual([jean.id, rj.editTokenHash])
    expect([p.reminderJ2Sent, p.reminderJ1Sent, p.checkedInAt, p.waitingPosition]).toEqual([null, null, null, null])
    // Capacity never dips: each shift still has one person.
    for (const s of shifts) expect(await prisma.registration.count({ where: { shiftId: s.id, status: "active" } })).toBe(1)

    // The immutable trace: the request's entry, and one entry per registration caused by it.
    const logs = await prisma.eventLog.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } })
    const applied = logs.find((l) => l.action === "swap.applied")!
    const moved = logs.filter((l) => l.action === "registration.swapped")
    expect(moved.map((l) => [l.entityId, l.changes, l.causedByLogId])).toEqual(expect.arrayContaining([
      [rp.id, { shiftId: { from: shifts[0].id, to: shifts[1].id } }, applied.id],
      [rj.id, { shiftId: { from: shifts[1].id, to: shifts[0].id } }, applied.id],
    ]))
    // One « Échange effectué » per person, through the outbox.
    const keys = await outboxKinds(event.title)
    expect(keys).toEqual(expect.arrayContaining([`shift_swap_applied:${requestId}:${pierre.id}`, `shift_swap_applied:${requestId}:${jean.id}`]))
  })

  it("E14: a double click confirms once; the replay answers with the current state", async () => {
    const { pierre, rp, rj, shifts, requestId, revision } = await offered()
    lockHook.fn = barrier(2)
    const res = await Promise.all([1, 2].map(() => confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })))
    lockHook.fn = null
    expect(res.filter((r) => r.ok)).toHaveLength(1)
    expect(res.find((r) => !r.ok)).toMatchObject({ ok: false, httpStatus: 409, status: "applied" })
    // Swapped once, not swapped back.
    expect([await shiftOf(rp.id), await shiftOf(rj.id)]).toEqual([shifts[1].id, shifts[0].id])
    const again = await confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })
    expect(again).toMatchObject({ ok: false, status: "applied", error: "Cet échange a déjà été effectué." })
  })

  it("E04 and two approvals at once: nothing changes before the approval, then one applies", async () => {
    const { pierre, rp, rj, shifts, requestId, revision } = await offered({ shifts: [{ day: "2030-07-04" }, { day: "2030-07-05", requiresApproval: true }] })
    expect(await confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })).toMatchObject({ ok: true, status: "approval" })
    expect([await shiftOf(rp.id), await shiftOf(rj.id)]).toEqual([shifts[0].id, shifts[1].id])

    const db = getOrgClient(orgId)
    lockHook.fn = barrier(2)
    const res = await Promise.all(["a1", "a2"].map((adminId) => decideSwap(db, { organizationId: orgId, requestId, adminId, approve: true, revision, now: NOW })))
    lockHook.fn = null
    expect(res.filter((r) => r.ok)).toHaveLength(1)
    expect(res.find((r) => !r.ok)).toMatchObject({ status: "applied" })
    expect([await shiftOf(rp.id), await shiftOf(rj.id)]).toEqual([shifts[1].id, shifts[0].id])
  })

  it("an approval never overrides a hard rule (E06): the minimum age is checked again", async () => {
    const { event, shifts } = await setup({ approval: true, shifts: [{ day: "2030-07-04" }, { day: "2030-07-05" }] })
    const pierre = await person("Pierre", { birthDate: new Date("2014-01-01") })
    const jean = await person("Jean")
    const rp = await register(event.id, shifts[0].id, pierre.id)
    const rj = await register(event.id, shifts[1].id, jean.id)
    const pub = await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: NOW })
    const offer = await offerSwap(prisma, { requestId: (pub as { requestId: string }).requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })
    expect(offer.ok).toBe(true)
    const requestId = (pub as { requestId: string }).requestId
    const { revision } = await prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id: requestId } })
    expect(await confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })).toMatchObject({ status: "approval" })
    // The organisation sets a minimum age on Jean's shift meanwhile.
    await prisma.shift.update({ where: { id: shifts[1].id }, data: { minAge: 18 } })
    const res = await decideSwap(getOrgClient(orgId), { organizationId: orgId, requestId, adminId: "a1", approve: true, revision, now: NOW })
    expect(res).toMatchObject({ ok: false, status: "impossible" })
    expect([await shiftOf(rp.id), await shiftOf(rj.id)]).toEqual([shifts[0].id, shifts[1].id])
  })

  // AUTHZ-08: what stops the requester (here a minimum age they don't reach on the offered shift)
  // is never told to the person offering; their own side keeps its precise reason.
  it("an offer the requester's side stops answers one code, which says nothing of why", async () => {
    const { event, shifts } = await setup({ shifts: [{ day: "2030-07-04" }, { day: "2030-07-05", minAge: 18 }, { day: "2030-07-06", minAge: 18 }] })
    const pierre = await person("Pierre", { birthDate: new Date("2014-01-01") })
    const jean = await person("Jean")
    const rp = await register(event.id, shifts[0].id, pierre.id)
    const rj = await register(event.id, shifts[1].id, jean.id)
    const pub = await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: NOW })
    if (!pub.ok) throw new Error(pub.error)
    const res = await offerSwap(prisma, { requestId: pub.requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })
    expect(res).toMatchObject({ ok: false, httpStatus: 409, status: "open", code: "not_possible", error: "Cet échange n'est pas possible avec ce créneau. Propose un autre de tes créneaux." })
    expect(JSON.stringify(res)).not.toMatch(/min_age|âge|conditions/)
    expect(await statusOf(pub.requestId)).toBe("open")

    // The offerer's own side first: a young offerer on the requester's age-gated shift hears why.
    const young = await person("Lina", { birthDate: new Date("2014-01-01") })
    const adult = await person("Marc")
    const ra = await register(event.id, shifts[2].id, adult.id)
    const ry = await register(event.id, shifts[0].id, young.id)
    const adultReq = await publishSwapRequest(prisma, { registrationId: ra.id, volunteerId: adult.id, now: NOW })
    if (!adultReq.ok) throw new Error(adultReq.error)
    expect(await offerSwap(prisma, { requestId: adultReq.requestId, registrationId: ry.id, volunteerId: young.id, now: NOW })).toMatchObject({ ok: false, code: "min_age" })
  })

  it("E10: one live request per registration, on either side, even for two requests at once", async () => {
    const { event, shifts } = await setup()
    const pierre = await person("Pierre")
    const rp = await register(event.id, shifts[0].id, pierre.id)
    lockHook.fn = barrier(2)
    const res = await Promise.all([1, 2].map(() => publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: NOW })))
    lockHook.fn = null
    expect(res.filter((r) => r.ok)).toHaveLength(1)
    expect(res.find((r) => !r.ok)).toMatchObject({ httpStatus: 409, code: "busy" })

    // Jean's registration offered on Pierre's request cannot be published or offered elsewhere.
    const jean = await person("Jean")
    const paul = await person("Paul")
    const rj = await register(event.id, shifts[1].id, jean.id)
    const third = await prisma.shift.create({ data: { eventId: event.id, roleName: "Bar", label: "Bar", date: new Date("2030-07-06T00:00:00Z"), startTime: "18:00", endTime: "20:00", capacity: 2 } })
    const rpaul = await register(event.id, third.id, paul.id)
    const pierreReq = res.find((r) => r.ok) as { requestId: string }
    expect(await offerSwap(prisma, { requestId: pierreReq.requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })).toMatchObject({ ok: true })
    expect(await publishSwapRequest(prisma, { registrationId: rj.id, volunteerId: jean.id, now: NOW })).toMatchObject({ code: "busy" })
    const paulReq = await publishSwapRequest(prisma, { registrationId: rpaul.id, volunteerId: paul.id, now: NOW })
    expect(await offerSwap(prisma, { requestId: (paulReq as { requestId: string }).requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })).toMatchObject({ code: "busy" })
    // Pierre's own registration is taken by his request too.
    expect(await offerSwap(prisma, { requestId: (paulReq as { requestId: string }).requestId, registrationId: rp.id, volunteerId: pierre.id, now: NOW })).toMatchObject({ code: "busy" })
  })

  it("E15: an error after the first SQL write rolls the whole swap back", async () => {
    const { pierre, rp, rj, shifts, requestId, revision } = await offered()
    outboxHook.fail = true
    await expect(confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })).rejects.toThrow("outbox write failed")
    expect([await shiftOf(rp.id), await shiftOf(rj.id)]).toEqual([shifts[0].id, shifts[1].id])
    expect(await statusOf(requestId)).toBe("offered")
    expect(await prisma.eventLog.count({ where: { entityId: requestId, action: "swap.applied" } })).toBe(0)
    // And it can still be confirmed afterwards.
    expect(await confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })).toMatchObject({ ok: true, status: "applied" })
  })

  it("E16: SMTP down after the commit: the swap stays, the emails wait in the outbox", async () => {
    const { pierre, rp, shifts, requestId, revision } = await offered()
    expect(await confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })).toMatchObject({ status: "applied" })
    await deliverOutbox()
    expect(await shiftOf(rp.id)).toBe(shifts[1].id)
    const rows = await prisma.notificationOutbox.findMany({ where: { dedupeKey: { startsWith: `shift_swap_applied:${requestId}:` } } })
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.status !== "sent")).toBe(true)
  })

  it("E13: a shift whose time changes after the offer is never swapped on the new terms", async () => {
    const { pierre, jean, rp, rj, shifts, requestId, revision } = await offered()
    await prisma.shift.update({ where: { id: shifts[1].id }, data: { startTime: "15:00" } })
    const res = await confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })
    expect(res).toMatchObject({ ok: false, status: "impossible", code: "shift_changed" })
    expect([await shiftOf(rp.id), await shiftOf(rj.id)]).toEqual([shifts[0].id, shifts[1].id])
    const keys = await outboxKinds("")
    expect(keys).toEqual(expect.arrayContaining([
      expect.stringMatching(new RegExp(`^shift_swap_ended:${requestId}:\\d+:${pierre.id}:impossible$`)),
      expect.stringMatching(new RegExp(`^shift_swap_ended:${requestId}:\\d+:${jean.id}:impossible$`)),
    ]))
  })

  it("E08: nothing happens at or after the deadline, and a request past it expires", async () => {
    const { pierre, rp, rj, shifts, requestId, revision } = await offered()
    const atStart = new Date("2030-07-04T08:00:00Z") // 10:00 in Zurich, the first shift's start
    expect(await confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: atStart })).toMatchObject({ ok: false, status: "expired" })
    expect([await shiftOf(rp.id), await shiftOf(rj.id)]).toEqual([shifts[0].id, shifts[1].id])

    const { event, shifts: s2 } = await setup()
    const paul = await person("Paul")
    const r = await register(event.id, s2[0].id, paul.id)
    expect(await publishSwapRequest(prisma, { registrationId: r.id, volunteerId: paul.id, now: atStart })).toMatchObject({ ok: false, code: "deadline" })
    const pub = await publishSwapRequest(prisma, { registrationId: r.id, volunteerId: paul.id, now: NOW, expiresAt: new Date("2030-06-02T00:00:00Z") })
    expect(await expireSwapRequests(new Date("2030-06-01T12:00:00Z"))).toBe(0)
    expect(await expireSwapRequests(new Date("2030-06-03T00:00:00Z"))).toBeGreaterThanOrEqual(1)
    expect(await statusOf((pub as { requestId: string }).requestId)).toBe("expired")
  })

  it("the event's self-cancellation deadline applies to each shift given away (#946)", async () => {
    const { event, shifts } = await setup()
    await prisma.event.update({ where: { id: event.id }, data: { cancelDeadlineDays: 2 } })
    const pierre = await person("Pierre")
    const rp = await register(event.id, shifts[0].id, pierre.id)
    // Shift 0 starts on 4 July at 10:00: two days before is 2 July at 10:00 (08:00 UTC).
    expect(await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: new Date("2030-07-02T08:00:00Z") })).toMatchObject({ code: "deadline" })
    expect(await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: new Date("2030-07-02T07:59:00Z") })).toMatchObject({ ok: true })
  })

  it("E12: a second swap that conflicts once the first is applied is checked again and refused", async () => {
    const { event, shifts } = await setup({ shifts: [
      { day: "2030-07-04", start: "10:00", end: "12:00" }, { day: "2030-07-05", start: "14:00", end: "16:00" },
      { day: "2030-07-06", start: "10:00", end: "12:00" }, { day: "2030-07-05", start: "15:00", end: "17:00" },
    ] })
    const [pierre, jean, paul] = [await person("Pierre"), await person("Jean"), await person("Paul")]
    const rp1 = await register(event.id, shifts[0].id, pierre.id)
    const rp2 = await register(event.id, shifts[2].id, pierre.id)
    const rj = await register(event.id, shifts[1].id, jean.id)
    const rpaul = await register(event.id, shifts[3].id, paul.id)
    const one = await publishSwapRequest(prisma, { registrationId: rp1.id, volunteerId: pierre.id, now: NOW }) as { requestId: string }
    const two = await publishSwapRequest(prisma, { registrationId: rp2.id, volunteerId: pierre.id, now: NOW }) as { requestId: string }
    expect(await offerSwap(prisma, { requestId: one.requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })).toMatchObject({ ok: true })
    expect(await offerSwap(prisma, { requestId: two.requestId, registrationId: rpaul.id, volunteerId: paul.id, now: NOW })).toMatchObject({ ok: true })
    const rev = async (id: string) => (await prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id } })).revision
    expect(await confirmSwap(prisma, { requestId: one.requestId, volunteerId: pierre.id, revision: await rev(one.requestId), now: NOW })).toMatchObject({ status: "applied" })
    // Pierre now holds 5 July 14:00-16:00: Paul's 15:00-17:00 overlaps it.
    expect(await confirmSwap(prisma, { requestId: two.requestId, volunteerId: pierre.id, revision: await rev(two.requestId), now: NOW })).toMatchObject({ ok: false, status: "impossible", code: "overlap" })
    expect(await shiftOf(rp2.id)).toBe(shifts[2].id)
  })

  it("E19: the option switched off during an acceptance gives one consistent result", async () => {
    for (let round = 0; round < 3; round++) {
      const { event, pierre, rp, rj, shifts, requestId, revision } = await offered()
      lockHook.fn = barrier(2)
      const switchOff = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Shift" WHERE id = ANY(${[shifts[0].id, shifts[1].id].sort()}::text[]) ORDER BY id FOR UPDATE`
        await tx.event.update({ where: { id: event.id }, data: { shiftSwapsEnabled: false } })
        return endSwapRequests(tx, { eventId: event.id }, "option_off", { type: "admin", id: "a1" }, NOW)
      })
      const [confirmed] = await Promise.all([confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW }), lockHook.fn!().then(() => switchOff)])
      lockHook.fn = null
      const status = await statusOf(requestId)
      const moved = (await shiftOf(rp.id)) === shifts[1].id && (await shiftOf(rj.id)) === shifts[0].id
      if (confirmed.ok) expect([status, moved]).toEqual(["applied", true])
      else expect([status, moved]).toEqual(["cancelled", false])
    }
  })

  it("T05: nothing changes while the organisation is suspended", async () => {
    const { pierre, rp, shifts, requestId, revision } = await offered()
    await prisma.organization.update({ where: { id: orgId }, data: { active: false, suspendedAt: NOW } })
    try {
      expect(await confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })).toMatchObject({ ok: false, httpStatus: 403, code: "unavailable" })
      expect(await shiftOf(rp.id)).toBe(shifts[0].id)
      expect(await statusOf(requestId)).toBe("offered")
    } finally {
      await prisma.organization.update({ where: { id: orgId }, data: { active: true, suspendedAt: null } })
    }
  })

  it("T07: another organisation's session sees no request and changes nothing", async () => {
    const { rp, shifts, requestId, revision, pierre } = await offered({ approval: true })
    expect(await confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })).toMatchObject({ status: "approval" })
    const res = await decideSwap(getOrgClient(otherOrgId), { organizationId: otherOrgId, requestId, adminId: "x", approve: true, revision, now: NOW })
    expect(res).toMatchObject({ ok: false, httpStatus: 404 })
    expect(await shiftOf(rp.id)).toBe(shifts[0].id)
    expect(await statusOf(requestId)).toBe("approval")
  })

  it("a stale confirmation (new offer since) is refused, a declined person cannot offer again, a refusal changes nothing else", async () => {
    const { event, shifts, pierre, jean, rp, rj, requestId, revision } = await offered()
    expect(await declineSwapOffer(prisma, { requestId, volunteerId: pierre.id, revision })).toMatchObject({ ok: true, status: "open" })
    expect(await prisma.registration.findUniqueOrThrow({ where: { id: rj.id } })).toMatchObject({ status: "active", shiftId: shifts[1].id })
    expect(await offerSwap(prisma, { requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })).toMatchObject({ ok: false, code: "declined" })

    const paul = await person("Paul")
    const third = await prisma.shift.create({ data: { eventId: event.id, roleName: "Bar", label: "Bar", date: new Date("2030-07-06T00:00:00Z"), startTime: "18:00", endTime: "20:00", capacity: 2 } })
    const rpaul = await register(event.id, third.id, paul.id)
    expect(await offerSwap(prisma, { requestId, registrationId: rpaul.id, volunteerId: paul.id, now: NOW })).toMatchObject({ ok: true })
    // Pierre's old page still carries Jean's revision: refused, nothing applied.
    expect(await confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })).toMatchObject({ ok: false, code: "revision" })
    expect(await shiftOf(rp.id)).toBe(shifts[0].id)
  })

  it("withdrawals: the offer goes back to open, the request ends, the other person is told", async () => {
    const { pierre, jean, requestId, revision } = await offered()
    expect(await withdrawSwapOffer(prisma, { requestId, volunteerId: jean.id, revision: revision + 1 })).toMatchObject({ ok: false, code: "revision" })
    expect(await withdrawSwapOffer(prisma, { requestId, volunteerId: jean.id, revision })).toMatchObject({ ok: true, status: "open" })
    expect(await withdrawSwapRequest(prisma, { requestId, volunteerId: pierre.id })).toMatchObject({ ok: true, status: "withdrawn" })
    expect(await withdrawSwapRequest(prisma, { requestId, volunteerId: pierre.id })).toMatchObject({ ok: false, status: "withdrawn" })
    expect(await outboxKinds("")).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^shift_swap_ended:${requestId}:\\d+:${pierre.id}:withdrawn$`))]))
  })

  it("an offer breaking the offerer's own rules is refused and the request stays open (reserved poste, #470)", async () => {
    const { event, shifts } = await setup({ shifts: [{ day: "2030-07-04", reservedTags: ["sécurité"] }, { day: "2030-07-05", reservedTags: ["sécurité"] }] })
    const pierre = await person("Pierre", { tags: ["sécurité"] })
    const jean = await person("Jean")
    const rp = await register(event.id, shifts[0].id, pierre.id)
    const rj = await register(event.id, shifts[1].id, jean.id)
    const pub = await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: NOW }) as { requestId: string }
    expect(await offerSwap(prisma, { requestId: pub.requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })).toMatchObject({ ok: false, code: "reserved", status: "open" })
    expect(await statusOf(pub.requestId)).toBe("open")
  })

  it("refuses a request when swaps are off for the event, and never touches a request of another poste", async () => {
    const { event, shifts } = await setup({ enabled: false })
    const pierre = await person("Pierre")
    const rp = await register(event.id, shifts[0].id, pierre.id)
    expect(await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: NOW })).toMatchObject({ ok: false, code: "unavailable" })

    const other = await setup({ shifts: [{ day: "2030-07-04", roleName: "Bar" }, { day: "2030-07-05", roleName: "Accueil" }] })
    const jean = await person("Jean")
    const paul = await person("Paul")
    const r1 = await register(other.event.id, other.shifts[0].id, jean.id)
    const r2 = await register(other.event.id, other.shifts[1].id, paul.id)
    const pub = await publishSwapRequest(prisma, { registrationId: r1.id, volunteerId: jean.id, now: NOW }) as { requestId: string }
    expect(await offerSwap(prisma, { requestId: pub.requestId, registrationId: r2.id, volunteerId: paul.id, now: NOW })).toMatchObject({ ok: false, code: "other_poste" })
  })

  it("a cancelled registration ends the requests it is part of, as impossible", async () => {
    const { rj, requestId, jean } = await offered()
    const ids = await prisma.$transaction(async (tx) => {
      await tx.registration.update({ where: { id: rj.id }, data: { status: "cancelled" } })
      return endSwapRequests(tx, { registrationIds: [rj.id] }, "registration_gone", { type: "volunteer", id: jean.id }, NOW)
    })
    expect(ids.length).toBeGreaterThan(0)
    expect(await prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id: requestId } })).toMatchObject({ status: "impossible", endReason: "registration_gone" })
  })
})
