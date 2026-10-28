import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * Shift swaps between postes of the same sector (#1175), against a real Postgres: E01 two postes
 * of one sector swap end to end; E02 two postes of two sectors are refused; E03 two postes without
 * a sector are refused; A07 a poste moved to another sector (or its sector archived) ends the
 * requests that no longer hold, in the move's own transaction, the people told; a move that keeps
 * the pair in one sector changes nothing. No email leaves.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { generateToken } from "@/lib/utils"
import { registrationToken } from "@/lib/token-vault"
import { confirmSwap, offerSwap, publishSwapRequest } from "@/lib/shift-swap-server"
import { assignPosteSector, updateSector } from "@/lib/sector-adoption"

const url = process.env.DATABASE_URL
const tag = `int-swap-sectors-${Date.now()}`
const NOW = new Date("2030-06-01T08:00:00Z")
const ADMIN = { type: "admin" as const, id: "admin-1" }

describe.skipIf(!url)("swaps between postes of the same sector, on Postgres (#1175)", () => {
  let orgId = ""
  let n = 0

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Asso ${tag}`, slug: tag, timeZone: "Europe/Zurich" } })).id
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.event.deleteMany({ where: { organizationId: orgId } })
      await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  /** An event that adopted sectors: Parking Nord and Parking Sud in « Parking », Bar in « Buvette », Accueil without one. */
  async function setup() {
    const event = await prisma.event.create({ data: { organizationId: orgId, slug: `${tag}-e${n++}`, title: "Fête", publicStatus: "published", startDate: new Date("2030-07-04"), endDate: new Date("2030-07-06"), shiftSwapsEnabled: true, sectorsEnabled: true, sectorsAdoptedAt: new Date() } })
    const parking = await prisma.sector.create({ data: { eventId: event.id, name: "Parking", displayOrder: 0 } })
    const buvette = await prisma.sector.create({ data: { eventId: event.id, name: "Buvette", displayOrder: 1 } })
    const mk = (roleName: string, sectorId: string | null, day: string) => prisma.shift.create({ data: { eventId: event.id, roleName, label: roleName, sectorId, date: new Date(`${day}T00:00:00Z`), startTime: "10:00", endTime: "12:00", capacity: 2 } })
    const nord = await mk("Parking Nord", parking.id, "2030-07-04")
    const sud = await mk("Parking Sud", parking.id, "2030-07-05")
    const bar = await mk("Bar", buvette.id, "2030-07-06")
    const accueil = await mk("Accueil", null, "2030-07-06")
    const orga = await mk("Orga", null, "2030-07-05")
    return { event, parking, buvette, nord, sud, bar, accueil, orga }
  }

  const person = (name: string) => prisma.volunteer.create({ data: { organizationId: orgId, firstName: name, lastName: "Test", email: `${tag}-${name.toLowerCase()}-${n++}@example.org` } })
  const register = (eventId: string, shiftId: string, volunteerId: string) => prisma.registration.create({ data: { eventId, shiftId, volunteerId, status: "active", ...registrationToken.data(generateToken()) } })

  async function pair(eventId: string, shiftA: string, shiftB: string) {
    const [pierre, jean] = [await person("Pierre"), await person("Jean")]
    const rp = await register(eventId, shiftA, pierre.id)
    const rj = await register(eventId, shiftB, jean.id)
    const pub = await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: NOW }) as { requestId: string }
    const offer = await offerSwap(prisma, { requestId: pub.requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })
    return { pierre, jean, rp, rj, requestId: pub.requestId, offer }
  }

  const status = async (id: string) => prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id } })
  const shiftOf = async (id: string) => (await prisma.registration.findUniqueOrThrow({ where: { id } })).shiftId

  it("E01: Parking Nord and Parking Sud swap end to end", async () => {
    const { event, nord, sud } = await setup()
    const { pierre, rp, rj, requestId, offer } = await pair(event.id, nord.id, sud.id)
    expect(offer).toMatchObject({ ok: true, status: "offered" })
    const { revision } = await status(requestId)
    expect(await confirmSwap(prisma, { requestId, volunteerId: pierre.id, revision, now: NOW })).toMatchObject({ ok: true, status: "applied" })
    expect([await shiftOf(rp.id), await shiftOf(rj.id)]).toEqual([sud.id, nord.id])
  })

  it("E02 and E03: two sectors, or two postes without a sector, refuse the offer", async () => {
    const { event, nord, bar, accueil, orga } = await setup()
    expect((await pair(event.id, nord.id, bar.id)).offer).toMatchObject({ ok: false, code: "other_sector", status: "open" })
    expect((await pair(event.id, accueil.id, orga.id)).offer).toMatchObject({ ok: false, code: "other_poste", status: "open" })
    expect((await pair(event.id, nord.id, accueil.id)).offer).toMatchObject({ ok: false, code: "other_sector" })
  })

  it("A07: a poste moved to another sector ends the request that no longer holds, both people told", async () => {
    const { event, nord, sud, buvette } = await setup()
    const { requestId, pierre, jean, rp } = await pair(event.id, nord.id, sud.id)
    await prisma.$transaction((tx) => assignPosteSector(tx, orgId, event.id, "Parking Sud", buvette.id, ADMIN))
    expect(await status(requestId)).toMatchObject({ status: "impossible", endReason: "sector_changed" })
    expect(await shiftOf(rp.id)).toBe(nord.id)
    const keys = (await prisma.notificationOutbox.findMany({ where: { dedupeKey: { startsWith: `shift_swap_ended:${requestId}:` } }, select: { dedupeKey: true } })).map((r) => r.dedupeKey ?? "")
    expect(keys.some((k) => k.includes(pierre.id))).toBe(true)
    expect(keys.some((k) => k.includes(jean.id))).toBe(true)
    const log = await prisma.eventLog.findFirst({ where: { entityId: requestId, action: "swap.ended" } })
    expect(log).toMatchObject({ actorType: "admin", actorId: "admin-1", changes: { swapReason: { from: null, to: "sector_changed" } } })
  })

  it("A07: archiving the sector moves its postes out, and their pair ends", async () => {
    const { event, nord, sud, parking } = await setup()
    const { requestId } = await pair(event.id, nord.id, sud.id)
    const res = await updateSector(getOrgClient(orgId), orgId, event.id, parking.id, { archived: true, detachPostes: true }, ADMIN)
    expect(res.ok).toBe(true)
    expect(await status(requestId)).toMatchObject({ status: "impossible", endReason: "sector_changed" })
  })

  it("a move that keeps the pair compatible changes nothing: same poste, or both postes still in one sector", async () => {
    const { event, nord, sud, bar, buvette } = await setup()
    // Same poste on both sides: compatible whatever its sector.
    const [anne, marc] = [await person("Anne"), await person("Marc")]
    const second = await prisma.shift.create({ data: { eventId: event.id, roleName: "Bar", label: "Bar", sectorId: buvette.id, date: new Date("2030-07-05T00:00:00Z"), startTime: "14:00", endTime: "16:00", capacity: 2 } })
    const ra = await register(event.id, bar.id, anne.id)
    const rm = await register(event.id, second.id, marc.id)
    const pub = await publishSwapRequest(prisma, { registrationId: ra.id, volunteerId: anne.id, now: NOW }) as { requestId: string }
    await offerSwap(prisma, { requestId: pub.requestId, registrationId: rm.id, volunteerId: marc.id, now: NOW })
    await prisma.$transaction((tx) => assignPosteSector(tx, orgId, event.id, "Bar", null, ADMIN))
    expect((await status(pub.requestId)).status).toBe("offered")
    // Parking Nord / Sud, both moved to « Buvette »: still one sector.
    const { requestId } = await pair(event.id, nord.id, sud.id)
    await prisma.$transaction((tx) => assignPosteSector(tx, orgId, event.id, "Parking Nord", buvette.id, ADMIN))
    expect((await status(requestId)).status).toBe("impossible")
    const again = await pair(event.id, nord.id, (await prisma.shift.create({ data: { eventId: event.id, roleName: "Parking Est", label: "Parking Est", sectorId: buvette.id, date: new Date("2030-07-06T00:00:00Z"), startTime: "08:00", endTime: "09:00", capacity: 2 } })).id)
    expect(again.offer).toMatchObject({ ok: true })
    await prisma.$transaction((tx) => assignPosteSector(tx, orgId, event.id, "Parking Est", buvette.id, ADMIN))
    expect((await status(again.requestId)).status).toBe("offered")
  })
})
