import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"

/**
 * Sectors grouping postes (#1147) against a real Postgres: the event option and its adoption lock
 * (A02, A03, A04), the beta gate on new adoptions only (BE01, BE06), the poste → sector link kept
 * on every shift through a rename, a move and new shifts (A05, A07), archiving, the
 * case-insensitive name, the organisation default (not retroactive) and duplication.
 *
 * A04 holds the first sector's transaction on a barrier right after it locked the event (inside
 * the beta gate's check), sends a switch-off meanwhile, and checks the switch-off waited for the
 * lock and was then refused: one consistent result.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => guard.value }))
const gateHook = vi.hoisted(() => ({ fn: null as null | (() => Promise<void>) }))
vi.mock("@/lib/beta-access", async (orig) => {
  const actual = await orig<typeof import("@/lib/beta-access")>()
  return {
    ...actual,
    canAdoptBeta: async (...args: Parameters<typeof actual.canAdoptBeta>) => {
      const hook = gateHook.fn
      gateHook.fn = null
      if (hook) await hook()
      return actual.canAdoptBeta(...args)
    },
  }
})

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { BETA_SETTING_KEY } from "@/lib/beta-capabilities"

const url = process.env.DATABASE_URL
const tag = `int-sectors-${Date.now()}`

const request = (path: string, method: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
const params = <P extends object>(p: P) => ({ params: Promise.resolve(p) })
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!url)("sectors on Postgres (#1147)", () => {
  let orgId = ""
  let previousSetting: unknown = undefined

  const routes = async () => ({
    sectors: await import("@/app/api/admin/events/[id]/sectors/route"),
    sector: await import("@/app/api/admin/events/[id]/sectors/[sectorId]/route"),
    mode: await import("@/app/api/admin/events/[id]/sectors/mode/route"),
    reorder: await import("@/app/api/admin/events/[id]/sectors/reorder/route"),
    role: await import("@/app/api/admin/events/[id]/roles/[roleName]/route"),
    shifts: await import("@/app/api/admin/shifts/route"),
    shift: await import("@/app/api/admin/shifts/[id]/route"),
    duplicate: await import("@/app/api/admin/events/[id]/duplicate/route"),
    events: await import("@/app/api/admin/events/route"),
    org: await import("@/app/api/admin/settings/organization/route"),
  })

  const setGate = async (open: boolean, optedIn = true) => {
    await prisma.platformSetting.upsert({ where: { key: BETA_SETTING_KEY }, create: { key: BETA_SETTING_KEY, value: { open: open ? ["sectors"] : [] } }, update: { value: { open: open ? ["sectors"] : [] } } })
    await prisma.organization.update({ where: { id: orgId }, data: { betaOptInAt: optedIn ? new Date() : null } })
  }

  let n = 0
  async function newEvent(roles: string[] = ["Parking Nord", "Parking Mairie", "Bar"]) {
    const event = await prisma.event.create({ data: { organizationId: orgId, slug: `${tag}-e${n++}`, title: "Fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-02") } })
    for (const roleName of roles) {
      await prisma.shift.create({ data: { eventId: event.id, roleName, label: roleName, date: new Date("2030-06-01"), startTime: "09:00", endTime: "12:00", capacity: 2 } })
      await prisma.shift.create({ data: { eventId: event.id, roleName, label: roleName, date: new Date("2030-06-02"), startTime: "14:00", endTime: "17:00", capacity: 2 } })
    }
    return event.id
  }

  const eventState = (id: string) => prisma.event.findUniqueOrThrow({ where: { id }, select: { sectorsEnabled: true, sectorsAdoptedAt: true } })
  const sectorsOf = (eventId: string) => prisma.shift.findMany({ where: { eventId }, select: { roleName: true, sectorId: true, status: true }, orderBy: { roleName: "asc" } })

  const r = {
    mode: async (id: string, enabled: boolean) => (await routes()).mode.PUT(request(`/api/admin/events/${id}/sectors/mode`, "PUT", { enabled }), params({ id })),
    create: async (id: string, name: string) => (await routes()).sectors.POST(request(`/api/admin/events/${id}/sectors`, "POST", { name }), params({ id })),
    patchSector: async (id: string, sectorId: string, body: unknown) => (await routes()).sector.PATCH(request(`/api/admin/events/${id}/sectors/${sectorId}`, "PATCH", body), params({ id, sectorId })),
    role: async (id: string, roleName: string, body: unknown) => (await routes()).role.PATCH(request(`/api/admin/events/${id}/roles/${encodeURIComponent(roleName)}`, "PATCH", body), params({ id, roleName })),
  }

  beforeAll(async () => {
    previousSetting = (await prisma.platformSetting.findUnique({ where: { key: BETA_SETTING_KEY } }))?.value
    const org = await prisma.organization.create({ data: { name: "Org sectors", slug: `${tag}-org` } })
    orgId = org.id
    guard.value = { db: getOrgClient(org.id), organizationId: org.id, session: { user: { id: "adm-test", email: "adm@example.org" } } }
  })

  beforeEach(async () => {
    gateHook.fn = null
    await setGate(true)
  })

  afterAll(async () => {
    if (previousSetting === undefined) await prisma.platformSetting.deleteMany({ where: { key: BETA_SETTING_KEY } })
    else await prisma.platformSetting.update({ where: { key: BETA_SETTING_KEY }, data: { value: previousSetting as object } })
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  it("A01: an event without sectors stays as it was, and the poste route refuses a sector", async () => {
    const id = await newEvent()
    expect(await eventState(id)).toEqual({ sectorsEnabled: false, sectorsAdoptedAt: null })
    const res = await r.role(id, "Bar", { sectorId: null })
    expect(res.status).toBe(409)
    expect((await sectorsOf(id)).every((s) => s.sectorId === null)).toBe(true)
  })

  it("A02: the option turned on then off without any sector saved is back to simple mode", async () => {
    const id = await newEvent()
    expect((await r.mode(id, true)).status).toBe(200)
    expect(await eventState(id)).toEqual({ sectorsEnabled: true, sectorsAdoptedAt: null })
    expect((await r.mode(id, false)).status).toBe(200)
    expect(await eventState(id)).toEqual({ sectorsEnabled: false, sectorsAdoptedAt: null })
    expect(await prisma.sector.count({ where: { eventId: id } })).toBe(0)
  })

  it("refuses a sector while the option is off, and turning it on while the capability is closed (BE01)", async () => {
    const id = await newEvent()
    expect((await r.create(id, "Parking")).status).toBe(409)
    await setGate(false)
    expect((await r.mode(id, true)).status).toBe(403)
    await setGate(true, false)
    expect((await r.mode(id, true)).status).toBe(403)
    expect(await eventState(id)).toEqual({ sectorsEnabled: false, sectorsAdoptedAt: null })
  })

  it("refuses the first sector of an event whose option was on when the capability closed, but keeps full use once adopted (BE06)", async () => {
    const pending = await newEvent()
    const adopted = await newEvent()
    await r.mode(pending, true)
    await r.mode(adopted, true)
    expect((await r.create(adopted, "Parking")).status).toBe(201)
    await setGate(false, false)
    expect((await r.create(pending, "Parking")).status).toBe(403)
    expect((await eventState(pending)).sectorsAdoptedAt).toBeNull()
    // Still allowed to switch the pending one off, and the adopted one keeps working.
    expect((await r.mode(pending, false)).status).toBe(200)
    expect((await r.create(adopted, "Buvette")).status).toBe(201)
  })

  it("A03: the first sector adopts sectors; every sector archived, the structure stays and switching off is refused", async () => {
    const id = await newEvent()
    await r.mode(id, true)
    const res = await r.create(id, "Parking")
    expect(res.status).toBe(201)
    const { sector, adopted } = await res.json()
    expect(adopted).toBe(true)
    expect((await eventState(id)).sectorsAdoptedAt).toBeInstanceOf(Date)
    expect((await r.patchSector(id, sector.id, { archived: true })).status).toBe(200)
    const off = await r.mode(id, false)
    expect(off.status).toBe(409)
    expect(await eventState(id)).toMatchObject({ sectorsEnabled: true })
    expect((await eventState(id)).sectorsAdoptedAt).not.toBeNull()
  })

  it("A04: a first sector and a switch-off sent together give one consistent result (the switch-off waits for the lock)", async () => {
    const id = await newEvent()
    await r.mode(id, true)
    let arrived!: () => void
    const atBarrier = new Promise<void>((resolve) => { arrived = resolve })
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    gateHook.fn = async () => { arrived(); await held }

    const creating = r.create(id, "Parking")
    await atBarrier // the creation holds the event's row lock, inside its transaction
    let offDone = false
    const switching = r.mode(id, false).then((res) => { offDone = true; return res })
    await sleep(400)
    expect(offDone).toBe(false) // blocked on the lock
    release()
    const [created, off] = await Promise.all([creating, switching])
    expect(created.status).toBe(201)
    expect(off.status).toBe(409)
    const state = await eventState(id)
    expect(state.sectorsEnabled).toBe(true)
    expect(state.sectorsAdoptedAt).not.toBeNull()
    expect(await prisma.sector.count({ where: { eventId: id } })).toBe(1)
  })

  it("A04: queued behind the same lock, whichever goes first, never a sector on an event switched off", async () => {
    for (let round = 0; round < 3; round++) {
      const id = await newEvent([])
      await r.mode(id, true)
      let release!: () => void
      const held = new Promise<void>((resolve) => { release = resolve })
      let locked!: () => void
      const isLocked = new Promise<void>((resolve) => { locked = resolve })
      const holder = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${id} FOR UPDATE`
        locked()
        await held
      })
      await isLocked
      const both = Promise.all([r.create(id, "Parking"), r.mode(id, false)])
      await sleep(150)
      release()
      await holder
      const [created, off] = await both
      const state = await eventState(id)
      const count = await prisma.sector.count({ where: { eventId: id } })
      if (created.status === 201) {
        expect(off.status).toBe(409)
        expect(state.sectorsEnabled).toBe(true)
        expect(state.sectorsAdoptedAt).not.toBeNull()
        expect(count).toBe(1)
      } else {
        expect(created.status).toBe(409)
        expect(off.status).toBe(200)
        expect(state).toEqual({ sectorsEnabled: false, sectorsAdoptedAt: null })
        expect(count).toBe(0)
      }
    }
  })

  it("names are unique per event whatever the case or spaces; an archived name can be reused", async () => {
    const id = await newEvent([])
    await r.mode(id, true)
    const first = await (await r.create(id, "Parking")).json()
    expect((await r.create(id, "  parking ")).status).toBe(409)
    await r.patchSector(id, first.sector.id, { archived: true })
    expect((await r.create(id, "PARKING")).status).toBe(201)
    // Restoring the archived one now clashes with the new one.
    expect((await r.patchSector(id, first.sector.id, { archived: false })).status).toBe(409)
  })

  it("A05 and A07: a poste's sector is on every shift, follows a rename, and a poste moves to another sector everywhere", async () => {
    const id = await newEvent()
    await r.mode(id, true)
    const parking = (await (await r.create(id, "Parking")).json()).sector
    const buvette = (await (await r.create(id, "Buvette")).json()).sector
    expect((await r.role(id, "Parking Nord", { sectorId: parking.id })).status).toBe(200)
    expect((await r.role(id, "Parking Mairie", { sectorId: parking.id })).status).toBe(200)
    expect((await r.role(id, "Bar", { sectorId: buvette.id })).status).toBe(200)

    // A05: a rename keeps the sector, and a poste name stays unique.
    expect((await r.role(id, "Parking Nord", { name: "Parking Mairie" })).status).toBe(409)
    expect((await r.role(id, "Parking Nord", { name: "Parking Gare" })).status).toBe(200)
    const after = await sectorsOf(id)
    expect(after.filter((s) => s.roleName === "Parking Gare").map((s) => s.sectorId)).toEqual([parking.id, parking.id])

    // A07: moved to another sector, every shift follows; a new shift and a shift moved into the poste take it.
    expect((await r.role(id, "Parking Mairie", { sectorId: buvette.id })).status).toBe(200)
    expect((await sectorsOf(id)).filter((s) => s.roleName === "Parking Mairie").every((s) => s.sectorId === buvette.id)).toBe(true)
    const { shifts, shift } = await routes()
    const created = await shifts.POST(request("/api/admin/shifts", "POST", { eventId: id, roleName: "Parking Mairie", label: "Parking Mairie", date: "2030-06-02", startTime: "18:00", endTime: "20:00", capacity: 1 }))
    expect((await created.json()).sectorId).toBe(buvette.id)
    const gare = (await prisma.shift.findFirstOrThrow({ where: { eventId: id, roleName: "Parking Gare" } })).id
    const moved = await shift.PATCH(request(`/api/admin/shifts/${gare}`, "PATCH", { roleName: "Bar" }), params({ id: gare }))
    expect(moved.status).toBe(200)
    expect((await moved.json()).sectorId).toBe(buvette.id)

    // Back to « Sans secteur ».
    expect((await r.role(id, "Bar", { sectorId: null })).status).toBe(200)
    expect((await sectorsOf(id)).filter((s) => s.roleName === "Bar").every((s) => s.sectorId === null)).toBe(true)
  })

  it("refuses a sector of another event or an archived one for a poste", async () => {
    const id = await newEvent()
    const other = await newEvent()
    await r.mode(id, true)
    await r.mode(other, true)
    await r.create(id, "Parking")
    const foreign = (await (await r.create(other, "Ailleurs")).json()).sector
    expect((await r.role(id, "Bar", { sectorId: foreign.id })).status).toBe(404)
    const archived = (await (await r.create(id, "Ancien")).json()).sector
    await r.patchSector(id, archived.id, { archived: true })
    expect((await r.role(id, "Bar", { sectorId: archived.id })).status).toBe(409)
    expect((await sectorsOf(id)).every((s) => s.sectorId === null)).toBe(true)
  })

  it("archiving a sector that groups postes needs the confirmation, which moves them to « Sans secteur »", async () => {
    const id = await newEvent()
    await r.mode(id, true)
    const parking = (await (await r.create(id, "Parking")).json()).sector
    await r.role(id, "Parking Nord", { sectorId: parking.id })
    await r.role(id, "Parking Mairie", { sectorId: parking.id })
    const refused = await r.patchSector(id, parking.id, { archived: true })
    expect(refused.status).toBe(409)
    expect((await refused.json()).postes).toBe(2)
    expect((await prisma.sector.findUniqueOrThrow({ where: { id: parking.id } })).archivedAt).toBeNull()

    expect((await r.patchSector(id, parking.id, { archived: true, detachPostes: true })).status).toBe(200)
    expect((await sectorsOf(id)).every((s) => s.sectorId === null)).toBe(true)
    expect((await prisma.sector.findUniqueOrThrow({ where: { id: parking.id } })).archivedAt).not.toBeNull()
    // Never deleted; restored empty.
    expect((await r.patchSector(id, parking.id, { archived: false })).status).toBe(200)
    expect((await prisma.sector.findUniqueOrThrow({ where: { id: parking.id } })).archivedAt).toBeNull()
  })

  it("reorders the active sectors, refusing a list that is not exactly them", async () => {
    const id = await newEvent([])
    await r.mode(id, true)
    const a = (await (await r.create(id, "A")).json()).sector
    const b = (await (await r.create(id, "B")).json()).sector
    const { reorder } = await routes()
    const bad = await reorder.POST(request(`/api/admin/events/${id}/sectors/reorder`, "POST", { sectorIds: [a.id] }), params({ id }))
    expect(bad.status).toBe(400)
    const ok = await reorder.POST(request(`/api/admin/events/${id}/sectors/reorder`, "POST", { sectorIds: [b.id, a.id] }), params({ id }))
    expect(ok.status).toBe(200)
    const order = await prisma.sector.findMany({ where: { eventId: id }, orderBy: { displayOrder: "asc" }, select: { name: true } })
    expect(order.map((s) => s.name)).toEqual(["B", "A"])
  })

  it("the organisation default applies to new events only, never to existing ones", async () => {
    const existing = await newEvent([])
    const { org, events } = await routes()
    expect((await org.PATCH(request("/api/admin/settings/organization", "PATCH", { sectorsDefault: true }))).status).toBe(200)
    expect(await eventState(existing)).toEqual({ sectorsEnabled: false, sectorsAdoptedAt: null })
    const res = await events.POST(request("/api/admin/events", "POST", { title: `Nouveau ${tag}`, startDate: "2030-07-01", endDate: "2030-07-01" }))
    expect(res.status).toBe(201)
    expect((await res.json()).sectorsEnabled).toBe(true)
    // The capability closed: a new event starts without, and the default cannot be turned on again.
    await setGate(false)
    const closed = await events.POST(request("/api/admin/events", "POST", { title: `Fermé ${tag}`, startDate: "2030-07-01", endDate: "2030-07-01" }))
    expect((await closed.json()).sectorsEnabled).toBe(false)
    expect((await org.PATCH(request("/api/admin/settings/organization", "PATCH", { sectorsDefault: false }))).status).toBe(200)
    expect((await org.PATCH(request("/api/admin/settings/organization", "PATCH", { sectorsDefault: true }))).status).toBe(403)
  })

  it("duplication copies the sectors, the poste links and the adoption, with fresh sectors", async () => {
    const id = await newEvent()
    await r.mode(id, true)
    const parking = (await (await r.create(id, "Parking")).json()).sector
    const old = (await (await r.create(id, "Ancien")).json()).sector
    await r.patchSector(id, old.id, { archived: true })
    await r.role(id, "Parking Nord", { sectorId: parking.id })
    const { duplicate } = await routes()
    const res = await duplicate.POST(request(`/api/admin/events/${id}/duplicate`, "POST", { title: "Fête (copie)" }), params({ id }))
    expect(res.status).toBe(201)
    const copy = await res.json()
    expect((await eventState(copy.id)).sectorsAdoptedAt).not.toBeNull()
    const copied = await prisma.sector.findMany({ where: { eventId: copy.id } })
    expect(copied.map((s) => s.name)).toEqual(["Parking"])
    expect(copied[0].id).not.toBe(parking.id)
    const links = await sectorsOf(copy.id)
    expect(links.filter((s) => s.roleName === "Parking Nord").map((s) => s.sectorId)).toEqual([copied[0].id, copied[0].id])
    expect(links.filter((s) => s.roleName !== "Parking Nord").every((s) => s.sectorId === null)).toBe(true)
  })
})
