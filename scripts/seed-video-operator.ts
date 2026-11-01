// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Three synthetic organizations in the separately marked operator database. */
import { PrismaClient } from "../src/generated/prisma/client"
import { pgAdapter } from "../src/lib/prisma-adapter"
import { Client } from "pg"
import bcrypt from "bcryptjs"
import assert from "node:assert/strict"
import { fullNameOf, surnameOf } from "../videos/lib/fixture-names"
import { operatorTotpSecretEnc } from "../videos/lib/operator-second-factor"

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
  const db = new PrismaClient({ adapter: pgAdapter(url.href) })
  try {
    if (process.argv[2] === "--reset-owned") {
      // Opt-in replay, only after a complete take deleted its fourth disposable space.
      // Refuse every unfamiliar row; never empty an arbitrary existing database.
      const orgs = await db.organization.findMany({ select: { id: true, slug: true, name: true } })
      const admins = await db.adminUser.findMany({ select: { id: true, email: true } })
      const events = await db.event.findMany({ select: { id: true } })
      const people = await db.volunteer.findMany({ select: { id: true, email: true } })
      assert.equal(orgs.length, 3)
      assert(orgs.every(o => /^video-operator-org-[abc]$/.test(o.id) && o.slug === `formation-operateur-${o.id.slice(-1)}` && o.name === `Formation Opérateur ${{a: "Parc", b: "Quartier", c: "Réserve"}[o.id.slice(-1)]}`))
      assert.equal(admins.length, 4)
      assert(admins.every(a => a.id === "video-operator-platform" ? a.email === "video.operator.platform@example.org" : /^video-operator-org-[abc]-owner$/.test(a.id) && a.email === `video.operator.${a.id.split("-")[3]}.owner@example.org`))
      assert.equal(events.length, 3)
      assert(events.every(e => /^video-operator-org-[ab]-event-[01]$/.test(e.id)))
      assert.equal(people.length, 9)
      assert(people.every(p => { const m = /^video-operator-org-([ab])-member-([0-5])$/.exec(p.id); return m && p.email === `video.operator.${m[1]}.member.${m[2]}@example.org` }))
      assert.equal(await db.registration.count(), 0)
      assert.equal(await db.jobRun.count(), 0)
      const sends = await db.productUpdateSend.findMany({ select: { id: true, subject: true, sentByAdminId: true } })
      assert(sends.every(s => s.sentByAdminId === "video-operator-platform" && s.subject === "Formation — préparer votre prochain événement"))
      await db.$transaction(async tx => {
        await tx.productUpdateSend.deleteMany({ where: { id: { in: sends.map(s => s.id) } } })
        await tx.volunteer.deleteMany({ where: { id: { in: people.map(p => p.id) } } })
        await tx.adminUser.deleteMany({ where: { id: { in: admins.map(a => a.id) } } })
        await tx.organization.deleteMany({ where: { id: { in: orgs.map(o => o.id) } } })
      })
      console.log("✓ Exact marked operator fixture reset; no unfamiliar organization/account/event/member accepted")
    } else if (process.argv.length > 2) throw new Error("Only --reset-owned is accepted")
    const counts = await Promise.all([db.organization.count(), db.adminUser.count(), db.event.count(), db.volunteer.count()])
    if (counts.some(count => count !== 0)) throw new Error("Operator seed requires its new empty database; no existing data deleted")
    const passwordHash = await bcrypt.hash(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password", 10)
    const memberFirstNames = ["Léa", "Emma", "Nicolas", "Zoé", "Sarah", "Lucas"]
    await db.$transaction(async tx => {
      await tx.adminUser.create({ data: { id: "video-operator-platform", email: "video.operator.platform@example.org", name: fullNameOf("Morgane"), role: "super_admin", passwordHash, receiveProductUpdates: false, totpSecretEnc: operatorTotpSecretEnc(), totpEnabledAt: new Date("2026-10-01T08:00:00Z") } })
      const day = new Date("2026-11-07T00:00:00Z")
      for (const [index, label] of ["Parc", "Quartier", "Réserve"].entries()) {
        const side = ["a", "b", "c"][index]
        const id = `video-operator-org-${side}`
        await tx.organization.create({ data: { id, name: `Formation Opérateur ${label}`, slug: `formation-operateur-${side}`, active: index !== 2, timeZone: "Europe/Zurich", hasOrgInsurance: true, replyToEmail: `video.operator.${side}.owner@example.org` } })
        await tx.adminUser.create({ data: { id: `${id}-owner`, organizationId: id, name: fullNameOf(["Élodie", "Samira", "Paul"][index]), email: `video.operator.${side}.owner@example.org`, passwordHash, role: "admin", isActive: index !== 2, receiveProductUpdates: index === 0 } })
        for (let person = 0; person < (index === 0 ? 6 : index === 1 ? 3 : 0); person++) await tx.volunteer.create({ data: { id: `${id}-member-${person}`, organizationId: id, firstName: memberFirstNames[person], lastName: surnameOf(memberFirstNames[person]), email: `video.operator.${side}.member.${person}@example.org`, notes: "Donnée fictive pour la formation interne uniquement." } })
        for (let event = 0; event < (index === 0 ? 2 : index === 1 ? 1 : 0); event++) await tx.event.create({ data: { id: `${id}-event-${event}`, organizationId: id, title: `${label} — ${event === 0 ? "Fête de formation" : "Préparation de formation"}`, slug: `formation-${event}`, description: "Données fictives de la formation opérateur.", startDate: day, endDate: day, publicStatus: event === 0 ? "published" : "draft", remindersEnabled: false } })
      }
    })
    const after = await Promise.all([db.organization.count(), db.adminUser.count(), db.event.count(), db.volunteer.count()])
    if (after.join(",") !== "3,4,3,9" || await db.adminUser.count({ where: { isActive: true, receiveProductUpdates: true } }) !== 1) throw new Error("Operator fixture invariants failed")
    console.log("✓ Operator-only fixture: 3 organizations (one inactive), 4 synthetic accounts, 3 events, 9 members; 1 subscribed active administrator")
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Operator seed failed"); process.exitCode = 1 })
