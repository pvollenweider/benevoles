import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { Client } from "pg"
import { readdirSync, readFileSync } from "fs"
import { join } from "path"

/**
 * #1169 on Postgres: sector-scoped leaders.
 * - migration: existing poste leaders are untouched, the scope check and the case-insensitive
 *   unique per sector hold, a sector with leaders cannot be deleted but its event can;
 * - scope: the « Parking » sector leader sees Nord, Sud and École, the Nord leader only Nord, a
 *   poste moved out of the sector drops out on the next request (B02), a revoked link gives
 *   nothing, and naming a leader takes no place (B01).
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => guard.value }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { linkToken, registrationToken } from "@/lib/token-vault"
import { assignPosteSector } from "@/lib/sector-adoption"
import { BETA_SETTING_KEY } from "@/lib/beta-capabilities"

const url = process.env.DATABASE_URL
const MIGRATIONS = join(process.cwd(), "prisma/migrations")
const THIS_MIGRATION = "20261026200000_sector_scoped_leaders"
const tag = `int-sl-${Date.now()}`

const request = (path: string, method: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: body === undefined ? undefined : JSON.stringify(body) })

describe.skipIf(!url)("migration 20261026200000_sector_scoped_leaders on existing data (#1169)", () => {
  const dbName = `benevoles_sl_${Date.now()}`
  let admin: Client
  let db: Client

  beforeAll(async () => {
    admin = new Client({ connectionString: url })
    await admin.connect()
    await admin.query(`CREATE DATABASE ${dbName}`)
    const scratch = new URL(url!)
    scratch.pathname = `/${dbName}`
    db = new Client({ connectionString: scratch.toString() })
    await db.connect()
    const dirs = readdirSync(MIGRATIONS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    const cut = dirs.indexOf(THIS_MIGRATION)
    expect(cut).toBeGreaterThan(0)
    for (const dir of dirs.slice(0, cut)) await db.query(readFileSync(join(MIGRATIONS, dir, "migration.sql"), "utf8"))
    // Leaders as the app wrote them before #1169.
    await db.query(`
      INSERT INTO "Organization" (id, name, slug, "updatedAt") VALUES ('org1', 'Org', 'org', now());
      INSERT INTO "Event" (id, "organizationId", slug, title, "startDate", "endDate", "updatedAt", "sectorsEnabled", "sectorsAdoptedAt")
        VALUES ('evt1', 'org1', 'fete', 'Fête', now(), now(), now(), true, now());
      INSERT INTO "Sector" (id, "eventId", name, "updatedAt") VALUES ('sec1', 'evt1', 'Parking', now());
      INSERT INTO "SectorLeader" (id, "eventId", "roleName", name, email, "tokenHash", "createdAt")
        VALUES ('l1', 'evt1', 'Bar', 'Léa', 'lea@x.ch', 'hash-1', '2026-01-01 00:00:00'),
               ('l2', 'evt1', 'Parking Nord', 'Nina', 'nina@x.ch', 'hash-2', '2026-01-02 00:00:00');
    `)
    await db.query(readFileSync(join(MIGRATIONS, THIS_MIGRATION, "migration.sql"), "utf8"))
  })

  afterAll(async () => {
    await db?.end()
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName}`)
    await admin?.end()
  })

  it("leaves every existing leader exactly as it was: same poste, same link, no sector", async () => {
    const rows = await db.query(`SELECT id, "roleName", "sectorId", name, email, "tokenHash", "createdAt"::text AS "createdAt" FROM "SectorLeader" ORDER BY id`)
    expect(rows.rows).toEqual([
      { id: "l1", roleName: "Bar", sectorId: null, name: "Léa", email: "lea@x.ch", tokenHash: "hash-1", createdAt: "2026-01-01 00:00:00" },
      { id: "l2", roleName: "Parking Nord", sectorId: null, name: "Nina", email: "nina@x.ch", tokenHash: "hash-2", createdAt: "2026-01-02 00:00:00" },
    ])
  })

  it("a leader has exactly one of a poste or a sector", async () => {
    await expect(db.query(`INSERT INTO "SectorLeader" (id, "eventId", "roleName", "sectorId", name, email, "tokenHash") VALUES ('x1', 'evt1', NULL, NULL, 'X', 'x@x.ch', 'h-x1')`)).rejects.toThrow(/SectorLeader_scope_check/)
    await expect(db.query(`INSERT INTO "SectorLeader" (id, "eventId", "roleName", "sectorId", name, email, "tokenHash") VALUES ('x2', 'evt1', 'Bar', 'sec1', 'X', 'x@x.ch', 'h-x2')`)).rejects.toThrow(/SectorLeader_scope_check/)
    await db.query(`INSERT INTO "SectorLeader" (id, "eventId", "sectorId", name, email, "tokenHash") VALUES ('s1', 'evt1', 'sec1', 'Paula', 'paula@x.ch', 'h-s1')`)
  })

  it("one row per sector and address, whatever its case or spaces; the same person can still lead a poste", async () => {
    await expect(db.query(`INSERT INTO "SectorLeader" (id, "eventId", "sectorId", name, email, "tokenHash") VALUES ('s2', 'evt1', 'sec1', 'Paula', ' PAULA@x.ch', 'h-s2')`)).rejects.toThrow(/SectorLeader_eventId_sectorId_email_ci_key/)
    await db.query(`INSERT INTO "SectorLeader" (id, "eventId", "roleName", name, email, "tokenHash") VALUES ('p3', 'evt1', 'Parking Nord', 'Paula', 'paula@x.ch', 'h-p3')`)
  })

  it("a sector with leaders cannot be deleted on its own (NO ACTION), but its event can, with both", async () => {
    await expect(db.query(`DELETE FROM "Sector" WHERE id = 'sec1'`)).rejects.toThrow(/SectorLeader_sectorId_fkey/)
    await db.query(`DELETE FROM "Event" WHERE id = 'evt1'`)
    expect((await db.query(`SELECT count(*)::int AS n FROM "SectorLeader"`)).rows[0].n).toBe(0)
    expect((await db.query(`SELECT count(*)::int AS n FROM "Sector"`)).rows[0].n).toBe(0)
  })
})

describe.skipIf(!url)("sector leaders' scope on Postgres (#1169)", () => {
  let orgId = ""
  let eventId = ""
  let parkingId = ""
  let nordShift = ""
  const tokens = { parking: `${tag}-parking`, nord: `${tag}-nord` }

  let betaBefore: object | null = null

  beforeAll(async () => {
    betaBefore = ((await prisma.platformSetting.findUnique({ where: { key: BETA_SETTING_KEY } }))?.value as object | undefined) ?? null
    orgId = (await prisma.organization.create({ data: { name: `Comité ${tag}`, slug: tag, betaOptInAt: new Date() } })).id
    guard.value = { db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "adm-test", email: "adm@example.org" } } }
    eventId = (await prisma.event.create({
      data: { organizationId: orgId, slug: tag, title: "Fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-02"), sectorsEnabled: true, sectorsAdoptedAt: new Date() },
    })).id
    parkingId = (await prisma.sector.create({ data: { eventId, name: "Parking" } })).id
    const base = { eventId, date: new Date("2030-06-01"), startTime: "08:00", endTime: "12:00", capacity: 3 }
    nordShift = (await prisma.shift.create({ data: { ...base, roleName: "Parking Nord", label: "Nord", sectorId: parkingId } })).id
    const sud = (await prisma.shift.create({ data: { ...base, roleName: "Parking Sud", label: "Sud", sectorId: parkingId } })).id
    const ecole = (await prisma.shift.create({ data: { ...base, roleName: "École", label: "École", sectorId: parkingId, date: new Date("2030-06-02") } })).id
    const bar = (await prisma.shift.create({ data: { ...base, roleName: "Bar", label: "Bar" } })).id
    let i = 0
    for (const [shiftId, first] of [[nordShift, "Ana"], [sud, "Ben"], [ecole, "Chloé"], [bar, "Zoé"]] as const) {
      const v = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: first, lastName: "M", email: `${tag}-${first}@example.org` } })
      await prisma.registration.create({ data: { eventId, shiftId, volunteerId: v.id, status: "active", ...registrationToken.data(`${tag}-reg-${i++}`) } })
    }
    await prisma.sectorLeader.create({ data: { eventId, sectorId: parkingId, name: "Paula", email: `${tag}-paula@example.org`, ...linkToken.data(tokens.parking) } })
    await prisma.sectorLeader.create({ data: { eventId, roleName: "Parking Nord", name: "Nina", email: `${tag}-nina@example.org`, ...linkToken.data(tokens.nord) } })
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {})
    }
    // The operator's list as it was before this test.
    if (betaBefore === null) await prisma.platformSetting.deleteMany({ where: { key: BETA_SETTING_KEY } })
    else await prisma.platformSetting.update({ where: { key: BETA_SETTING_KEY }, data: { value: betaBefore } })
    await prisma.$disconnect()
  })

  const roster = async (token: string) => {
    const { GET } = await import("@/app/api/public/leader/[token]/route")
    return GET(request(`/api/public/leader/x`, "GET"), { params: Promise.resolve({ token }) })
  }
  const names = (body: { registrations: { volunteer: { firstName: string } }[] }) => body.registrations.map((r) => r.volunteer.firstName).sort()

  it("the Parking leader sees Nord, Sud and École; the Nord leader only Nord; nobody sees the Bar", async () => {
    const parking = await (await roster(tokens.parking)).json()
    expect(parking.heading).toBe("Responsable de secteur · Parking")
    expect(parking.postes).toEqual(["École", "Parking Nord", "Parking Sud"])
    expect(names(parking)).toEqual(["Ana", "Ben", "Chloé"])
    const nord = await (await roster(tokens.nord)).json()
    expect(nord.heading).toBe("Responsable de poste · Parking Nord")
    expect(names(nord)).toEqual(["Ana"])
  })

  it("B01: naming a leader through the API takes no place and creates no registration", async () => {
    await prisma.platformSetting.upsert({ where: { key: BETA_SETTING_KEY }, create: { key: BETA_SETTING_KEY, value: { open: ["sectors", "sectorLeaders"] } }, update: { value: { open: ["sectors", "sectorLeaders"] } } })
    const before = await prisma.registration.count({ where: { eventId } })
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await POST(request(`/api/admin/events/${eventId}/sector-leaders`, "POST", { sectorId: parkingId, name: "Ana M", email: `${tag}-Ana@example.org` }), { params: Promise.resolve({ id: eventId }) })
    expect(res.status).toBe(201)
    expect(await prisma.registration.count({ where: { eventId } })).toBe(before)
    const nord = await prisma.shift.findUniqueOrThrow({ where: { id: nordShift }, select: { capacity: true, _count: { select: { registrations: true } } } })
    expect(nord).toEqual({ capacity: 3, _count: { registrations: 1 } })
    // The same address again, typed with another casing: refused by the app, then by the index.
    const again = await POST(request(`/api/admin/events/${eventId}/sector-leaders`, "POST", { sectorId: parkingId, name: "Ana", email: `${tag}-ana@example.org` }), { params: Promise.resolve({ id: eventId }) })
    expect(again.status).toBe(409)
  })

  it("B02: a poste moved out of the sector drops out on the next request", async () => {
    await prisma.$transaction((tx) => assignPosteSector(tx, orgId, eventId, "École", null))
    const parking = await (await roster(tokens.parking)).json()
    expect(parking.postes).toEqual(["Parking Nord", "Parking Sud"])
    expect(names(parking)).toEqual(["Ana", "Ben"])
  })

  it("B02: a revoked leader's link gives nothing", async () => {
    await prisma.sectorLeader.deleteMany({ where: { eventId, roleName: "Parking Nord" } })
    expect((await roster(tokens.nord)).status).toBe(404)
  })

  it("an archived sector gives its leaders nothing; the link stays", async () => {
    const { updateSector } = await import("@/lib/sector-adoption")
    const result = await updateSector(getOrgClient(orgId), orgId, eventId, parkingId, { archived: true, detachPostes: true })
    expect(result.ok).toBe(true)
    const res = await roster(tokens.parking)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.postes).toEqual([])
    expect(body.registrations).toEqual([])
  })
})
