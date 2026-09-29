import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Client } from "pg"
import { readdirSync, readFileSync } from "fs"
import { join } from "path"
import { createHash } from "crypto"

/**
 * Migrations applied to a database that already holds data (#318): E2E starts from an empty
 * database, so data migrations were only ever run on empty tables. This test builds a scratch
 * database at the state just before the token hash migration (#305), inserts rows as the app
 * wrote them then (clear-text tokens, capitalized emails), applies the remaining migrations, and
 * checks that existing links still resolve (hash = SHA-256 of the old token) and emails are
 * normalized.
 */

const url = process.env.DATABASE_URL
const MIGRATIONS = join(process.cwd(), "prisma/migrations")
const FIRST_AFTER_FIXTURES = "20260929120000_token_hash_enc"
// Refuses to run while the fixtures' case-only duplicate emails remain: applied by its own test.
const EMAIL_CI_UNIQUE = "20260930110000_email_case_insensitive_unique"
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex")

const migrationDirs = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

async function applyMigrations(client: Client, dirs: string[]) {
  for (const dir of dirs) await client.query(readFileSync(join(MIGRATIONS, dir, "migration.sql"), "utf8"))
}

describe.skipIf(!url)("migrations on a database with existing data (#318)", () => {
  const dbName = `benevoles_upgrade_${Date.now()}`
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

    const cut = migrationDirs.indexOf(FIRST_AFTER_FIXTURES)
    expect(cut).toBeGreaterThan(0)
    await applyMigrations(db, migrationDirs.slice(0, cut))

    // Rows as the app wrote them before #305 / #310.
    await db.query(`
      INSERT INTO "Organization" (id, name, slug, "updatedAt") VALUES ('org1', 'Org', 'org', now());
      INSERT INTO "Event" (id, "organizationId", slug, title, "startDate", "endDate", "updatedAt")
        VALUES ('evt1', 'org1', 'fete', 'Fête', now(), now(), now());
      INSERT INTO "Shift" (id, "eventId", "roleName", label, date, "startTime", "endTime", capacity, "updatedAt")
        VALUES ('sh1', 'evt1', 'Bar', 'Bar', now(), '10:00', '12:00', 5, now());
      INSERT INTO "Volunteer" (id, "organizationId", "firstName", "lastName", email, "updatedAt")
        VALUES ('v1', 'org1', 'Alice', 'M', ' Alice@Example.COM', now()),
               ('v2', 'org1', 'Bob', 'D', 'Bob@x.ch', now()),
               ('v3', 'org1', 'Bob', 'D', 'bob@x.ch', now());
      INSERT INTO "Registration" (id, "eventId", "shiftId", "volunteerId", "editToken", "updatedAt")
        VALUES ('r1', 'evt1', 'sh1', 'v1', 'reg-token-1', now());
      INSERT INTO "MemberInvite" (id, "eventId", "volunteerId", token) VALUES ('i1', 'evt1', 'v2', 'invite-token-1');
      INSERT INTO "SectorLeader" (id, "eventId", "roleName", name, email, token)
        VALUES ('l1', 'evt1', 'Bar', 'Lea', 'Lea@X.ch', 'leader-token-1');
      INSERT INTO "AdminUser" (id, email, name, "passwordHash", "updatedAt") VALUES ('a1', 'Admin@X.ch', 'Admin', 'h', now());
    `)

    const emailCi = migrationDirs.indexOf(EMAIL_CI_UNIQUE)
    expect(emailCi).toBeGreaterThan(cut)
    await applyMigrations(db, migrationDirs.slice(cut, emailCi))
  })

  afterAll(async () => {
    await db?.end()
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName}`)
    await admin?.end()
  })

  it("existing links still resolve: hashes computed from the old clear-text tokens", async () => {
    const reg = await db.query(`SELECT "editTokenHash", "editToken" FROM "Registration" WHERE id = 'r1'`)
    expect(reg.rows[0].editTokenHash).toBe(sha256("reg-token-1"))
    expect(reg.rows[0].editToken).toBe("reg-token-1") // legacy kept until the app encrypts it
    const inv = await db.query(`SELECT "tokenHash" FROM "MemberInvite" WHERE id = 'i1'`)
    expect(inv.rows[0].tokenHash).toBe(sha256("invite-token-1"))
    const lead = await db.query(`SELECT "tokenHash" FROM "SectorLeader" WHERE id = 'l1'`)
    expect(lead.rows[0].tokenHash).toBe(sha256("leader-token-1"))
  })

  it("hash columns are mandatory and unique after the migration", async () => {
    await expect(db.query(`INSERT INTO "MemberInvite" (id, "eventId", "volunteerId", "tokenHash") VALUES ('i2', 'evt1', 'v1', '${sha256("invite-token-1")}')`))
      .rejects.toThrow(/unique/i)
  })

  it("emails are normalized, except case-only duplicates left for manual review", async () => {
    const vols = await db.query(`SELECT id, email FROM "Volunteer" ORDER BY id`)
    expect(vols.rows).toEqual([
      { id: "v1", email: "alice@example.com" },
      { id: "v2", email: "Bob@x.ch" }, // would collide with v3: untouched
      { id: "v3", email: "bob@x.ch" },
    ])
    expect((await db.query(`SELECT email FROM "SectorLeader" WHERE id = 'l1'`)).rows[0].email).toBe("lea@x.ch")
    expect((await db.query(`SELECT email FROM "AdminUser" WHERE id = 'a1'`)).rows[0].email).toBe("admin@x.ch")
  })

  it("status columns reject values outside their set (#321)", async () => {
    await expect(db.query(`UPDATE "Registration" SET status = 'actvie' WHERE id = 'r1'`)).rejects.toThrow(/check constraint/i)
    await expect(db.query(`UPDATE "Shift" SET status = 'ful' WHERE id = 'sh1'`)).rejects.toThrow(/check constraint/i)
    await db.query(`UPDATE "Registration" SET status = 'cancelled' WHERE id = 'r1'`)
  })

  it("status constraints are validated, existing rows included (#345)", async () => {
    const res = await db.query(`SELECT conname, convalidated FROM pg_constraint WHERE conname LIKE '%\\_check' ESCAPE '\\' AND contype = 'c'`)
    const checks = res.rows.filter((r) => /_(status|source|publicStatus|role|actorType)_check$/.test(r.conname))
    expect(checks).toHaveLength(8)
    expect(checks.every((r) => r.convalidated)).toBe(true)
  })

  it("the case-insensitive email index refuses to build while case-only duplicates remain (#342)", async () => {
    await expect(applyMigrations(db, [EMAIL_CI_UNIQUE])).rejects.toThrow(/differ only by case.*#342/)
    // Nothing half-applied: the migration runs as one transaction.
    const idx = await db.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'Volunteer_organizationId_email_ci_key'`)
    expect(idx.rowCount).toBe(0)
  })

  it("once duplicates are merged, emails are unique whatever their case (#342)", async () => {
    await db.query(`UPDATE "Volunteer" SET email = 'bob.old@x.ch' WHERE id = 'v2'`)
    await applyMigrations(db, migrationDirs.slice(migrationDirs.indexOf(EMAIL_CI_UNIQUE)))

    await expect(db.query(`INSERT INTO "Volunteer" (id, "organizationId", "firstName", "lastName", email, "updatedAt") VALUES ('v4', 'org1', 'B', 'D', ' BOB@X.ch', now())`))
      .rejects.toThrow(/Volunteer_organizationId_email_ci_key/)
    await expect(db.query(`INSERT INTO "AdminUser" (id, email, name, "passwordHash", "updatedAt") VALUES ('a2', 'ADMIN@x.ch', 'A', 'h', now())`))
      .rejects.toThrow(/AdminUser_email_ci_key/)
    await expect(db.query(`INSERT INTO "SectorLeader" (id, "eventId", "roleName", name, email, "tokenHash") VALUES ('l2', 'evt1', 'Bar', 'L', 'LEA@x.ch', 'h2')`))
      .rejects.toThrow(/SectorLeader_eventId_roleName_email_ci_key/)

    // Same address in another organization, or for another role, is still allowed.
    await db.query(`INSERT INTO "Organization" (id, name, slug, "updatedAt") VALUES ('org2', 'Org 2', 'org2', now())`)
    await db.query(`INSERT INTO "Volunteer" (id, "organizationId", "firstName", "lastName", email, "updatedAt") VALUES ('v5', 'org2', 'B', 'D', 'bob@x.ch', now())`)
    await db.query(`INSERT INTO "SectorLeader" (id, "eventId", "roleName", name, email, "tokenHash") VALUES ('l3', 'evt1', 'Accueil', 'L', 'lea@x.ch', 'h3')`)
  })
})
