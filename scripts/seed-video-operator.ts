// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Three synthetic organizations in the separately marked operator database. */
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Client } from "pg"
import bcrypt from "bcryptjs"

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== "45433" || url.pathname !== "/benevoles_video") throw new Error("Dedicated local video PostgreSQL required")
  url.pathname = "/benevoles_video_operator"
  const marker = new Client({ connectionString: url.href })
  await marker.connect()
  try {
    const ownership = await marker.query("SELECT purpose FROM public._video_operator_fixture")
    if (ownership.rowCount !== 1 || ownership.rows[0].purpose !== "benevol-masterclass-53-synthetic-only") throw new Error("Operator database is not our synthetic fixture")
  } finally { await marker.end() }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) })
  try {
    const counts = await Promise.all([db.organization.count(), db.adminUser.count(), db.event.count(), db.volunteer.count()])
    if (counts.some(count => count !== 0)) throw new Error("Operator seed requires its new empty database; no existing data deleted")
    const passwordHash = await bcrypt.hash(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password", 10)
    await db.$transaction(async tx => {
      await tx.adminUser.create({ data: { id: "video-operator-platform", email: "video.operator.platform@example.org", name: "Morgane Exemple", role: "super_admin", passwordHash, receiveProductUpdates: false } })
      const day = new Date("2026-11-07T00:00:00Z")
      for (const [index, label] of ["Parc", "Quartier", "Réserve"].entries()) {
        const side = ["a", "b", "c"][index]
        const id = `video-operator-org-${side}`
        await tx.organization.create({ data: { id, name: `Formation Opérateur ${label}`, slug: `formation-operateur-${side}`, active: index !== 2, timeZone: "Europe/Zurich", hasOrgInsurance: true, replyToEmail: `video.operator.${side}.owner@example.org` } })
        await tx.adminUser.create({ data: { id: `${id}-owner`, organizationId: id, name: ["Élodie Exemple", "Samira Exemple", "Paul Exemple"][index], email: `video.operator.${side}.owner@example.org`, passwordHash, role: "admin", isActive: index !== 2, receiveProductUpdates: index === 0 } })
        for (let person = 0; person < (index === 0 ? 6 : index === 1 ? 3 : 0); person++) await tx.volunteer.create({ data: { id: `${id}-member-${person}`, organizationId: id, firstName: ["Léa", "Emma", "Nicolas", "Zoé", "Sarah", "Lucas"][person], lastName: "Exemple", email: `video.operator.${side}.member.${person}@example.org`, notes: "Donnée fictive pour la formation interne uniquement." } })
        for (let event = 0; event < (index === 0 ? 2 : index === 1 ? 1 : 0); event++) await tx.event.create({ data: { id: `${id}-event-${event}`, organizationId: id, title: `${label} — ${event === 0 ? "Fête de formation" : "Préparation de formation"}`, slug: `formation-${event}`, description: "Données fictives de la formation opérateur.", startDate: day, endDate: day, publicStatus: event === 0 ? "published" : "draft", remindersEnabled: false } })
      }
    })
    const after = await Promise.all([db.organization.count(), db.adminUser.count(), db.event.count(), db.volunteer.count()])
    if (after.join(",") !== "3,4,3,9" || await db.adminUser.count({ where: { isActive: true, receiveProductUpdates: true } }) !== 1) throw new Error("Operator fixture invariants failed")
    console.log("✓ Operator-only fixture: 3 organizations (one inactive), 4 synthetic accounts, 3 events, 9 members; 1 subscribed active administrator")
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Operator seed failed"); process.exitCode = 1 })
