import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * The changes made elsewhere that end a shift swap request (#1174), against a real Postgres: an
 * organiser removing a place, a cancelled shift, a material edit of a shift (and a label typo that
 * keeps the agreement), the option switched off (as cancelled by the organisation, and never
 * switched on while the capability is not shipped), an erasure (the other person told, never the
 * erased one), renewed links, and what the personal page shows. Each ends the request in the same
 * transaction as the change; the people are told through the outbox. No email leaves.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => guard.value }))
// The personal page's view is served once the capability ships; read here as it will be.
vi.mock("@/lib/shift-swap-gate", () => ({ swapsShipped: () => true }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { generateToken } from "@/lib/utils"
import { registrationToken } from "@/lib/token-vault"
import { offerSwap, publishSwapRequest } from "@/lib/shift-swap-server"
import { loadVolunteerSwapView, setShiftSwapsOption } from "@/lib/shift-swap-data"
import { cancelRegistrations } from "@/lib/admin-registration-actions"
import { cancelShift } from "@/lib/shift-cancel"
import { runMemberErasure } from "@/lib/member-erasure-transaction"
import { regenerateLinks } from "@/lib/link-regeneration"

const url = process.env.DATABASE_URL
const tag = `int-swap-hooks-${Date.now()}`
const NOW = new Date("2030-06-01T08:00:00Z")
const ADMIN = { type: "admin" as const, id: "admin-1" }

describe.skipIf(!url)("what ends a shift swap request, on Postgres (#1174)", () => {
  let orgId = ""
  let n = 0

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Asso ${tag}`, slug: tag, timeZone: "Europe/Zurich" } })).id
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.erasureRecord.deleteMany({ where: { organizationId: orgId } })
      await prisma.event.deleteMany({ where: { organizationId: orgId } })
      await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  /** Pierre on shift A, Jean on shift B of the same poste; Pierre published, Jean offered. */
  async function offered() {
    const event = await prisma.event.create({ data: { organizationId: orgId, slug: `${tag}-e${n++}`, title: "Fête", publicStatus: "published", startDate: new Date("2030-07-04"), endDate: new Date("2030-07-06"), shiftSwapsEnabled: true } })
    const mk = (day: string, start: string, end: string) => prisma.shift.create({ data: { eventId: event.id, roleName: "Bar", label: "Bar", date: new Date(`${day}T00:00:00Z`), startTime: start, endTime: end, capacity: 2 } })
    const a = await mk("2030-07-04", "10:00", "12:00")
    const b = await mk("2030-07-05", "14:00", "16:00")
    const person = (name: string) => prisma.volunteer.create({ data: { organizationId: orgId, firstName: name, lastName: "Test", email: `${tag}-${name.toLowerCase()}-${n++}@example.org` } })
    const [pierre, jean] = [await person("Pierre"), await person("Jean")]
    const reg = (shiftId: string, volunteerId: string) => prisma.registration.create({ data: { eventId: event.id, shiftId, volunteerId, status: "active", ...registrationToken.data(generateToken()) } })
    const rp = await reg(a.id, pierre.id)
    const rj = await reg(b.id, jean.id)
    const pub = await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: NOW })
    if (!pub.ok) throw new Error(pub.error)
    const offer = await offerSwap(prisma, { requestId: pub.requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })
    if (!offer.ok) throw new Error(offer.error)
    return { event, a, b, pierre, jean, rp, rj, requestId: pub.requestId }
  }

  const request = (id: string) => prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id } })
  const endedEmails = (requestId: string) => prisma.notificationOutbox.findMany({ where: { dedupeKey: { startsWith: `shift_swap_ended:${requestId}:` } }, select: { dedupeKey: true } })

  it("an organiser removing a place ends the request; the person who keeps their place is told", async () => {
    const { rj, requestId, pierre, jean, event, b } = await offered()
    await cancelRegistrations(getOrgClient(orgId), ADMIN, [{ id: rj.id, eventId: event.id, shiftId: b.id, status: "active" }])
    expect(await request(requestId)).toMatchObject({ status: "impossible", endReason: "registration_gone" })
    const keys = (await endedEmails(requestId)).map((r) => r.dedupeKey)
    expect(keys.some((k) => k?.includes(pierre.id))).toBe(true)
    // Jean's place is gone: he got the removal email, never « Tu conserves ton créneau ».
    expect(keys.some((k) => k?.includes(jean.id))).toBe(false)
  })

  it("a cancelled shift ends its requests (E09)", async () => {
    const { a, event, rp, pierre, requestId } = await offered()
    const shift = await prisma.shift.findUniqueOrThrow({ where: { id: a.id } })
    await cancelShift({
      ...shift,
      event: { id: event.id, title: event.title, slug: event.slug, organizationId: orgId, organization: { slug: tag } },
      registrations: [{ id: rp.id, volunteerId: pierre.id, volunteer: { email: null, firstName: "Pierre" } }],
    }, ADMIN)
    expect(await request(requestId)).toMatchObject({ status: "impossible", endReason: "shift_cancelled" })
  })

  it("a material edit of a shift ends the request (E13); a label typo keeps it", async () => {
    const { b, requestId } = await offered()
    guard.value = { db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "admin-1", role: "admin" } } }
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    const patch = (body: unknown) => PATCH(new Request(`http://localhost/api/admin/shifts/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: b.id }) })
    expect((await patch({ label: "Bar du soir" })).status).toBe(200)
    expect((await request(requestId)).status).toBe("offered")
    expect((await patch({ startTime: "15:00", notifyVolunteers: false })).status).toBe(200)
    expect(await request(requestId)).toMatchObject({ status: "impossible", endReason: "shift_changed" })
  })

  it("switching the option off ends live requests as cancelled by the organisation; on is refused while not shipped", async () => {
    const { event, requestId } = await offered()
    const db = getOrgClient(orgId)
    // With requests under way, the organiser is asked first: nothing changes without the confirmation.
    expect(await setShiftSwapsOption(db, orgId, event.id, { enabled: false }, ADMIN)).toMatchObject({ ok: false, status: 409, openCount: 1 })
    expect((await request(requestId)).status).toBe("offered")
    const off = await setShiftSwapsOption(db, orgId, event.id, { enabled: false, confirm: true }, ADMIN)
    expect(off).toMatchObject({ ok: true, shiftSwapsEnabled: false, changes: { shiftSwapsEnabled: { from: true, to: false } } })
    expect(await request(requestId)).toMatchObject({ status: "cancelled", endReason: "option_off" })
    // Turning it back on revives nothing, and needs the beta gate: closed in this version.
    expect(await setShiftSwapsOption(db, orgId, event.id, { enabled: true }, ADMIN)).toMatchObject({ ok: false, status: 403 })
    // Another organisation's event is not found.
    expect(await setShiftSwapsOption(db, "other-org", event.id, { enabled: false }, ADMIN)).toMatchObject({ ok: false, status: 404 })
  })

  it("an erasure ends the person's requests; only the other person is told (E18)", async () => {
    const { jean, pierre, requestId } = await offered()
    await runMemberErasure(getOrgClient(orgId), orgId, ADMIN, jean.id, NOW)
    expect(await request(requestId)).toMatchObject({ status: "impossible", endReason: "volunteer_gone" })
    const keys = (await endedEmails(requestId)).map((r) => r.dedupeKey ?? "")
    expect(keys.some((k) => k.includes(pierre.id))).toBe(true)
    expect(keys.some((k) => k.includes(jean.id))).toBe(false)
  })

  it("renewed personal links end the requests given from the old ones (E18)", async () => {
    const { event, requestId } = await offered()
    await regenerateLinks(getOrgClient(orgId) as never, { eventId: event.id })
    expect(await request(requestId)).toMatchObject({ status: "impossible", endReason: "link_revoked" })
  })

  it("the personal page shows Pierre « Tu cèdes / Tu reçois » and Jean the request he answered, with first name and initial only", async () => {
    const { event, pierre, jean, a, b, requestId } = await offered()
    const mine = await loadVolunteerSwapView(event.id, pierre.id, NOW)
    expect(mine.mine).toEqual([expect.objectContaining({ requestId, side: "requester", status: "offered", gives: expect.objectContaining({ id: a.id }), receives: expect.objectContaining({ id: b.id }) })])
    const theirs = await loadVolunteerSwapView(event.id, jean.id, NOW)
    expect(theirs.mine[0]).toMatchObject({ side: "counterpart", gives: { id: b.id }, receives: { id: a.id } })
    // Once an offer exists, each sees the other as « Jean T. » (owner decision, 2026-10-27), nothing more.
    expect(mine.mine[0].otherName).toBe("Jean T.")
    expect(theirs.mine[0].otherName).toBe("Pierre T.")
    expect(JSON.stringify([mine, theirs])).not.toMatch(/Test|@example/)
  })
})
