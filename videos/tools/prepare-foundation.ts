// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  const scenario = process.argv[2]
  assert(["charter", "identity", "milestones", "pages", "email", "team", "blank", "template", "planning"].includes(scenario), "Explicit owned scenario required")
  const id = `video-foundation-${scenario}`
  const slug = scenario === "identity" ? "fetes-de-montvert" : `formation-${scenario}`
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
  try {
    const existing = await db.organization.findUnique({ where: { id } })
    if (existing) {
      assert.equal(existing.slug, slug)
      if (scenario === "email") {
        assert.equal(await db.adminUser.count({ where: { organizationId: id, email: "video.email.owner@example.org" } }), 1)
        // Reset only this synthetic organization's test-email counter. Never
        // touch IP limits, another organization, or production counters.
        await db.rateLimit.deleteMany({ where: { key: "notification-test:org:video-foundation-email" } })
      }
      if (scenario === "charter") await db.organization.update({ where: { id }, data: { timeZone: "Europe/Paris" } })
      if (scenario === "team") {
        assert.equal(await db.adminUser.count({ where: { organizationId: id, email: "video.team.owner@example.org" } }), 1)
        await db.adminUser.deleteMany({ where: { organizationId: id, email: "video.team.lea@example.org", isActive: false } })
      }
      if (scenario === "blank" || scenario === "template") {
        assert.equal(await db.adminUser.count({ where: { organizationId: id, email: `video.${scenario}.owner@example.org` } }), 1)
        const title = scenario === "blank" ? "Fête du quartier des Tilleuls" : "Fête villageoise de Bellevue"
        const created = await db.event.findMany({ where: { organizationId: id, title }, select: { id: true, publicStatus: true, registrations: { select: { id: true } } } })
        assert(created.every(event => event.publicStatus === "draft" && event.registrations.length === 0), "Only empty recorder-created drafts may be reset")
        for (const event of created) await db.event.delete({ where: { id: event.id } })
        console.log(`Reset ${created.length} exact empty ${scenario} demonstration drafts; reproducible from the recorder.`)
      }
      if (scenario === "pages") {
        assert.equal(await db.adminUser.count({ where: { organizationId: id, email: "video.pages.owner@example.org" } }), 1)
        const eventId = `${id}-event-0`
        assert.equal(await db.event.count({ where: { id: eventId, organizationId: id } }), 1)
        await db.eventPage.deleteMany({ where: { eventId, title: "Ce qu’il faut apporter" } })
        await db.event.update({ where: { id: eventId }, data: { showSchedule: [] } })
        for (const [order, [pageTitle, pageSlug]] of [["Questions fréquentes", "questions-frequentes"], ["Accès et parking", "acces-parking"]].entries()) await db.eventPage.upsert({ where: { id: `${id}-page-${order}` }, create: { id: `${id}-page-${order}`, eventId, title: pageTitle, slug: pageSlug, displayOrder: order, content: `# ${pageTitle}\n\nContenu fictif de formation.` }, update: { displayOrder: order } })
      }
      if (scenario === "identity") {
        assert.equal(await db.adminUser.count({ where: { organizationId: id, email: "video.identity.owner@example.org" } }), 1)
        await db.organization.update({ where: { id }, data: { publicTitle: "Rejoignez notre association" } })
        await db.event.update({ where: { id: `${id}-event-0` }, data: { location: "Place du Collège, Montvert" } })
        // Only the synthetic logo uploaded by this recorder in its owned organization.
        // The root client predates this additive table; do not regenerate application files.
        await db.$executeRaw`DELETE FROM "OrganizationLogo" WHERE "organizationId" = ${id}`
      }
      console.log(`Owned ${scenario} fixture retained; its initial demonstrated settings restored${scenario === "identity" ? ", including removal of its recorder-uploaded synthetic logo" : scenario === "pages" ? "; only its recorder-created practical page and concert reset" : "; no deletion"}.`)
      return
    }
    assert.equal(await db.organization.count({ where: { slug } }), 0, "Slug already owned by another fixture")
    const source = await db.adminUser.findUniqueOrThrow({ where: { id: "video-navigation-current-owner" }, select: { passwordHash: true } })
    await db.$transaction(async tx => {
      await tx.organization.create({ data: { id, slug, name: "Les amis de Montvert", active: true, timeZone: scenario === "charter" ? "Europe/Paris" : "Europe/Zurich", publicTitle: "Rejoignez notre association", hasOrgInsurance: true } })
      await tx.adminUser.create({ data: { id: `${id}-owner`, organizationId: id, name: "Camille Martin", email: `video.${scenario}.owner@example.org`, passwordHash: source.passwordHash, role: "admin", isActive: true } })
      if (scenario === "team") await tx.adminUser.createMany({ data: [
        { id: `${id}-colette`, organizationId: id, name: "Colette Favre", email: "video.team.colette@example.org", passwordHash: source.passwordHash, role: "admin", isActive: true },
        { id: `${id}-samira`, organizationId: id, name: "Samira Diallo", email: "video.team.samira@example.org", passwordHash: source.passwordHash, role: "organizer", isActive: true },
      ] })
      if (scenario === "identity") await tx.orgSlugHistory.create({ data: { id: `${id}-old-address`, organizationId: id, slug: "montvert-ancien" } })
      for (const [index, title] of (scenario === "identity" ? ["Fête du village de Montvert", "Marché solidaire", "Rencontre des organisateurs"] : ["Fête du village de Montvert"]).entries()) {
        const eventId = `${id}-event-${index}`, date = new Date(`2026-11-${14 + index * 7}T00:00:00Z`)
        await tx.event.create({ data: { id: eventId, organizationId: id, title, slug: `rencontre-${index}`, description: "Événement fictif de formation.", location: "Place du Collège, Montvert", startDate: date, endDate: date, publicStatus: "published", isListed: index !== 2, remindersEnabled: false } })
        for (const [order, roleName] of ["Accueil", "Buvette"].entries()) await tx.shift.create({ data: { id: `${eventId}-shift-${order}`, eventId, date, roleName, label: order ? "Service du midi" : "Entrée principale", startTime: order ? "12:00" : "09:00", endTime: order ? "14:00" : "12:00", capacity: 4, status: "open", displayOrder: order } })
        if (scenario === "planning") {
          for (const [order, shift] of [
            { roleName: "Accueil", label: "Relève du midi", startTime: "12:00", endTime: "14:00", capacity: 3 },
            { roleName: "Buvette", label: "Service de l’après-midi", startTime: "14:00", endTime: "17:00", capacity: 5 },
            { roleName: "Livraison", label: "Transport du matériel", startTime: "10:00", endTime: "13:00", capacity: 2 },
            { roleName: "Rangement", label: "Nettoyage des stands", startTime: "17:00", endTime: "19:00", capacity: 6 },
          ].entries()) await tx.shift.create({ data: { id: `${eventId}-additional-${order}`, eventId, date, status: "open", displayOrder: order + 2, ...shift } })
        }
        if (scenario === "milestones") {
          const now = new Date(), yesterday = new Date(now.getTime() - 86400000), tomorrow = new Date(now.getTime() + 86400000)
          for (const [order, [milestoneTitle, dueDate, done]] of [["Valider le plan de sécurité", yesterday, false], ["Préparer le matériel", yesterday, true], ["Envoyer les consignes", tomorrow, false]].entries()) await tx.eventMilestone.create({ data: { id: `${id}-milestone-${order}`, eventId, title: milestoneTitle as string, dueDate: dueDate as Date, done: done as boolean } })
        }
        if (scenario === "pages") for (const [order, [pageTitle, pageSlug]] of [["Questions fréquentes", "questions-frequentes"], ["Accès et parking", "acces-parking"]].entries()) await tx.eventPage.create({ data: { id: `${id}-page-${order}`, eventId, title: pageTitle, slug: pageSlug, displayOrder: order, content: `# ${pageTitle}\n\nContenu fictif de formation.` } })
      }
    })
    console.log(`Separate owned ${scenario} fixture created; no messages sent and no other scenario modified.`)
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Foundation preparation failed"); process.exitCode = 1 })
