// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Add the planned forty-person classroom to the exact private navigation org.
 * No reset, email, deletion, or change to existing members/registrations.
 */
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { loadCurrentVideoPrisma } from "../lib/current-product-prisma"
import { NAVIGATION_NAMES, assertNavigationMembers } from "../lib/navigation-classroom"

const orgId = "video-navigation-current"
const names = NAVIGATION_NAMES

async function main() {
  const runtime = await loadCurrentVideoPrisma("http://localhost:43102")
  const db = runtime.db
  try {
    const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, include: { admins: true } })
    assert.equal(org.slug, "formation-navigation")
    assert.equal(org.name, "Les amis de Montvert")
    assert.equal(org.admins.length, 1)
    assert.equal(org.admins[0].email, "video.navigation.owner@example.org")
    const existing = await db.volunteer.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" } })
    assertNavigationMembers(existing, true)
    assert(existing.length === 4 || existing.length === names.length, "Only the known original or enriched classroom is accepted")
    for (const member of existing) {
      const index = names.findIndex((_, index) => member.id === `${orgId}-member-${index}`)
      assert(index >= 0, "Unknown member: refusing any classroom mutation")
      assert.equal(member.firstName, names[index][0]); assert.equal(member.lastName, names[index][1])
      assert.equal(member.email, `video.navigation.${index}@example.org`)
      assert.equal(member.notes, "Personne fictive de formation.")
      assert.equal(member.active, true)
    }
    const createdIds: string[] = []
    if (existing.length === 4) {
      await db.$transaction(async tx => {
        for (let index = 4; index < names.length; index++) {
          const id = `${orgId}-member-${index}`
          await tx.volunteer.create({ data: { id, organizationId: orgId, firstName: names[index][0], lastName: names[index][1], email: `video.navigation.${index}@example.org`, active: true, notes: "Personne fictive de formation." } })
          createdIds.push(id)
        }
      })
    }
    assert.equal(await db.volunteer.count({ where: { organizationId: orgId } }), 40)
    await mkdir("videos/output/admin-navigation", { recursive: true })
    if (createdIds.length) await writeFile("videos/output/admin-navigation/classroom-enrichment.json", JSON.stringify({ recordedAt: new Date().toISOString(), product: runtime.product, organizationId: orgId, originalIds: existing.map(member => member.id), createdIds, method: "Additive fictitious classroom only; no existing member or registration modified; no email sent" }, null, 2))
    console.log(`Navigation classroom: forty natural-name members; ${createdIds.length} newly created; existing data untouched`)
  } finally { await db.$disconnect(); await runtime.unregister() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Navigation enrichment failed"); process.exitCode = 1 })
