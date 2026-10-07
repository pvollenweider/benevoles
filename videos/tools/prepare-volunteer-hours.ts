// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { loadCurrentVideoPrisma } from "../lib/current-product-prisma"
import { HOURS_ORG, HOURS_OWNER, HOURS_ROWS, assertOwnedHoursFixture, readHoursScenario } from "../lib/volunteer-hours-fixture"
import { registrationToken } from "../../src/lib/token-vault"
import { HOURS_LAST_NAMES, HOURS_LABELS } from "../lib/record-volunteer-hours"
import { createHoursLogo } from "../lib/volunteer-hours-logo"

export const hoursSchemaHash = createHash("sha256").update(JSON.stringify({ org: HOURS_ORG, owner: HOURS_OWNER, rows: HOURS_ROWS })).digest("hex")
export function assertHoursOwnership(value: unknown, createdAt: string) {
  const ledger = value as { schemaVersion?: number; organizationId?: string; organizationCreatedAt?: string; fixtureSchemaSha256?: string }
  assert(ledger?.schemaVersion === 1 && ledger.organizationId === HOURS_ORG && ledger.organizationCreatedAt === createdAt && ledger.fixtureSchemaSha256 === hoursSchemaHash, "Exact hours ownership proof required")
}
async function main() {
  const args = process.argv.slice(2)
  assert(args.length === 0 || (args.length === 1 && args[0] === "--reset-owned"))
  const dir = path.resolve("videos/output/volunteer-hours-certificate")
  let ledger: unknown
  try { ledger = JSON.parse(await readFile(path.join(dir, "ownership.json"), "utf8")) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  const runtime = await loadCurrentVideoPrisma("http://localhost:43114")
  const { db, product } = runtime
  const logo = await createHoursLogo()
  try {
    await db.$transaction(async tx => {
      const existing = await tx.organization.findFirst({ where: { OR: [{ id: HOURS_ORG }, { slug: "formation-heures" }] }, select: { id: true, createdAt: true } })
      let passwordHash: string
      if (existing) {
        assert.equal(args[0], "--reset-owned"); assert.equal(existing.id, HOURS_ORG)
        assertHoursOwnership(ledger, existing.createdAt.toISOString())
        const owned = await assertOwnedHoursFixture(tx as unknown as typeof db, "legacy-owned-reset")
        passwordHash = owned.admins[0].passwordHash
        for (const log of owned.logs) await tx.orgLog.delete({ where: { id: log.id } })
        for (const event of owned.events) await tx.event.delete({ where: { id: event.id } })
        for (const member of owned.volunteers) await tx.volunteer.delete({ where: { id: member.id } })
        await tx.adminUser.delete({ where: { id: `${HOURS_ORG}-owner` } })
        await tx.organization.delete({ where: { id: HOURS_ORG } })
      } else {
        const owner = await tx.adminUser.findFirstOrThrow({ where: { id: "video-navigation-current-owner", organizationId: "video-navigation-current", email: "video.navigation.owner@example.org", role: "admin", isActive: true }, select: { passwordHash: true } })
        passwordHash = owner.passwordHash
      }
      assert.equal(await tx.adminUser.count({ where: { OR: [{ id: `${HOURS_ORG}-owner` }, { email: HOURS_OWNER }] } }), 0)
      for (const id of ["aline", "benoit", "clara"]) assert.equal(await tx.volunteer.count({ where: { OR: [{ id: `${HOURS_ORG}-${id}` }, { email: `video.hours.${id}@example.org` }] } }), 0)
      for (const kind of ["may", "september", "future"]) assert.equal(await tx.event.count({ where: { id: `${HOURS_ORG}-event-${kind}` } }), 0)
      for (const [key] of HOURS_ROWS) { assert.equal(await tx.shift.count({ where: { id: `${HOURS_ORG}-shift-${key}` } }), 0); assert.equal(await tx.registration.count({ where: { id: `${HOURS_ORG}-registration-${key}` } }), 0) }
      await tx.organization.create({ data: { id: HOURS_ORG, name: "Formation — heures et attestations", slug: "formation-heures", timeZone: "Europe/Zurich", replyToEmail: HOURS_OWNER, active: true } })
      await tx.organizationLogo.create({ data: { organizationId: HOURS_ORG, ...logo, data: new Uint8Array(logo.data) } })
      await tx.adminUser.create({ data: { id: `${HOURS_ORG}-owner`, organizationId: HOURS_ORG, email: HOURS_OWNER, name: "Élodie Rochat", passwordHash, role: "admin", isActive: true } })
      for (const [id, firstName] of [["aline", "Aline"], ["benoit", "Benoît"], ["clara", "Clara"]]) await tx.volunteer.create({ data: { id: `${HOURS_ORG}-${id}`, organizationId: HOURS_ORG, firstName, lastName: HOURS_LAST_NAMES[id as keyof typeof HOURS_LAST_NAMES], email: `video.hours.${id}@example.org`, active: true } })
      for (const [kind, day, title] of [["may", "2026-05-02", "Rencontre de printemps"], ["september", "2026-09-12", "Fête de septembre"], ["future", "2026-11-28", "Préparer la prochaine fête"]]) await tx.event.create({ data: { id: `${HOURS_ORG}-event-${kind}`, organizationId: HOURS_ORG, title, slug: `heures-${kind}`, startDate: new Date(`${day}T00:00:00Z`), endDate: new Date(`${day}T00:00:00Z`), publicStatus: "published", isListed: false, registrationsOpen: true, remindersEnabled: false } })
      for (const [key, member, event, day, status, shiftStatus, startTime, endTime, checked] of HOURS_ROWS) {
        await tx.shift.create({ data: { id: `${HOURS_ORG}-shift-${key}`, eventId: `${HOURS_ORG}-event-${event}`, roleName: "Accueil", label: HOURS_LABELS[key], date: new Date(`${day}T00:00:00Z`), startTime, endTime, capacity: 3, status: shiftStatus } })
        await tx.registration.create({ data: { id: `${HOURS_ORG}-registration-${key}`, eventId: `${HOURS_ORG}-event-${event}`, shiftId: `${HOURS_ORG}-shift-${key}`, volunteerId: `${HOURS_ORG}-${member}`, status, source: "admin_manual", checkedInAt: checked ? new Date(`${day}T08:00:00Z`) : null, ...registrationToken.data(`demo-hours-${key}`) } })
      }
    }, { timeout: 30000 })
    // Record ownership immediately after this committed creation, before the
    // semantic rehearsal checks. A failed totals check must not strand a
    // privately created fixture without its exact reset proof.
    const owned = await db.organization.findUniqueOrThrow({ where: { id: HOURS_ORG }, select: { id: true, name: true, slug: true, createdAt: true } })
    assert(owned.name === "Formation — heures et attestations" && owned.slug === "formation-heures")
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, "ownership.json"), JSON.stringify({ schemaVersion: 1, organizationId: HOURS_ORG, organizationCreatedAt: owned.createdAt.toISOString(), fixtureSchemaSha256: hoursSchemaHash }, null, 2))
    await readHoursScenario(db, product)
    await writeFile(path.join(dir, "preparation.json"), JSON.stringify({ preparedAt: new Date().toISOString(), product, synthetic: true, organizationId: HOURS_ORG, registrations: 8, emailsSent: false }, null, 2))
    console.log("✓ Owned hours fixture prepared and current-main totals checked. No notifications sent.")
  } finally { await db.$disconnect(); await runtime.unregister() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error instanceof Error ? error.message : "Hours preparation failed"); process.exitCode = 1 })
