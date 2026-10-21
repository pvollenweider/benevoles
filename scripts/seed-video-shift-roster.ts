// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Dedicated synthetic roster classroom; never alters another organisation. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { loadCurrentVideoPrisma } from "../videos/lib/current-product-prisma"
const id = "video-shift-roster", slug = "formation-roster"
async function main() {
  const current = await loadCurrentVideoPrisma("http://localhost:43102"), db = current.db
  // Runtime models come from the verified main snapshot. The durable checkout's
  // generated Prisma typings may predate #1070; never regenerate files under src/.
  const rosterDb = db as typeof db & { rosterConsent: { create(args: { data: { eventId: string; volunteerId: string; status: "visible"; noticeVersion: string; source: "personal_page"; decidedAt: Date } }): Promise<unknown> } }
  try {
    const previous = await db.organization.findUnique({ where: { id }, include: { admins: true, volunteers: true, events: true } })
    if (previous) {
      assert.equal(previous.slug, slug)
      assert(previous.admins.every(a => a.email === "video.roster.owner@example.org"))
      assert(previous.volunteers.every(v => /^video\.roster\.(aline|bruno|claire|david|emma|gina)@example\.org$/.test(v.email ?? "")))
      assert(previous.events.every(e => e.id === `${id}-event`))
      await db.event.deleteMany({ where: { organizationId: id } })
      await db.volunteer.deleteMany({ where: { organizationId: id } })
    } else {
      assert.equal(await db.organization.count({ where: { slug } }), 0)
      const source = await db.adminUser.findFirstOrThrow({ where: { email: "elodie.rochat@example.org", organizationId: "default" } })
      await db.organization.create({ data: { id, slug, name: "Les amis de Montvert", timeZone: "Europe/Zurich", active: true, hasOrgInsurance: true, outboundEmailApprovedAt: new Date(), publicationApprovedAt: new Date(), volunteerCharter: "Merci de respecter les consignes de sécurité et les autres bénévoles." } })
      await db.adminUser.create({ data: { id: `${id}-owner`, organizationId: id, email: "video.roster.owner@example.org", name: "Élodie Rochat", passwordHash: source.passwordHash, role: "admin", isActive: true } })
    }
    await db.organization.update({ where: { id }, data: { shiftRosterDefault: true } })
    // Repeated local takes must not inherit Aline's public-email hourly quota.
    // Only this exact fictitious recipient/kind is reset; other limits stay intact.
    const recipientHash = createHash("sha256").update("video.roster.aline@example.org").digest("hex").slice(0, 32)
    await db.rateLimit.deleteMany({ where: { key: { in: [`email:recipient:${recipientHash}:registration_confirmation:hour`, `email:recipient:${recipientHash}:registration_confirmation:hour:held`] } } })
    const date = new Date("2031-05-10T00:00:00Z"), eventId = `${id}-event`
    await db.event.create({ data: { id: eventId, organizationId: id, slug: "fete-du-parc", title: "Fête du parc", startDate: date, endDate: date, location: "Parc de Montvert", publicStatus: "draft", remindersEnabled: false, shiftRosterEnabled: true } })
    for (const [i, roleName] of ["Accueil", "Buvette", "Rangement"].entries()) await db.shift.create({ data: { id: `${id}-shift-${i}`, eventId, date, roleName, label: roleName, startTime: ["09:00", "12:00", "16:00"][i], endTime: ["12:00", "14:00", "18:00"][i], capacity: 8, displayOrder: i } })
    const people = [["bruno", "Bruno", "Favre"], ["claire", "Claire", "Rochat"], ["david", "David", "Perrin"], ["emma", "Emma", "Martin"]]
    for (const [key, firstName, lastName] of people) {
      const volunteerId = `${id}-${key}`
      await db.volunteer.create({ data: { id: volunteerId, organizationId: id, firstName, lastName, email: `video.roster.${key}@example.org`, ...(key === "emma" ? { birthDate: new Date("2015-06-01") } : {}) } })
      await db.registration.create({ data: { id: `${id}-reg-${key}`, eventId, volunteerId, shiftId: `${id}-shift-${key === "bruno" ? 1 : key === "claire" ? 2 : 0}`, status: "active", ...current.tokens.registrationToken.data(`demo-roster-${key}-0001`) } })
      // Existing accepted choices are fixtures, never organiser actions in the film.
      if (["bruno", "david", "emma"].includes(key)) await rosterDb.rosterConsent.create({ data: { eventId, volunteerId, status: "visible", noticeVersion: ["bruno", "david"].includes(key) ? "2026-10-21" : "2026-10-21.2", source: "personal_page", decidedAt: new Date() } })
    }
    await db.volunteer.create({ data: { id: `${id}-gina`, organizationId: id, firstName: "Gina", lastName: "Dubois", email: "video.roster.gina@example.org" } })
    await db.memberInvite.create({ data: { id: `${id}-invite-gina`, eventId, volunteerId: `${id}-gina`, ...current.tokens.linkToken.data("demo-roster-invite-gina-0001") } })
    // Inspect and delete only this classroom's exact demo messages, never the inbox.
    const deleted: string[] = [], preserved: string[] = []
    for (let start = 0; ; start += 500) {
      const response = await fetch(`http://localhost:48026/api/v1/messages?limit=500&start=${start}`); assert(response.ok)
      const data = await response.json() as { messages: { ID: string; Subject: string; To: { Address: string }[] }[]; total: number }
      for (const m of data.messages) {
        if (m.Subject.includes("Fête du parc") && m.To.length && m.To.every(to => /^video\.roster\.(aline|bruno|claire|david|emma|owner)@example\.org$/.test(to.Address))) deleted.push(m.ID)
        else preserved.push(m.ID)
      }
      if (start + data.messages.length >= data.total) break
    }
    for (const message of deleted) assert((await fetch("http://localhost:48026/api/v1/messages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ IDs: [message] }) })).ok)
    await mkdir("videos/output/shift-roster-visibility", { recursive: true })
    await writeFile("videos/output/shift-roster-visibility/mailbox-reset-proof.json", JSON.stringify({ at: new Date().toISOString(), deleted, preserved }, null, 2))
    console.log("Dedicated roster classroom reset: on (org default too), V1 Bruno and David, hidden Claire, invitation Gina, known minor; exact fixture mail cleared.")
  } finally { await db.$disconnect(); await current.unregister() }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
