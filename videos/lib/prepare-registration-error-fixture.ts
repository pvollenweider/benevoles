// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Explicitly owned synthetic fixture, separate from default and accessibility. */
import assert from "node:assert/strict"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { registrationToken } from "../../src/lib/token-vault"
import { openPayload } from "../../src/lib/notifications/outbox"

// TEST-NET-1, used only by this fixture's local browser; never a deployed client.
export const registrationErrorFixtureIp = "192.0.2.29"

export async function prepareRegistrationErrorFixture(db: PrismaClient, reset = false) {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video", "Dedicated local video database required")
  const orgId = "video-errors", eventId = `${orgId}-event`
  const existing = await db.organization.findUnique({ where: { id: orgId } })
  const source = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" }, select: { passwordHash: true } })
  if (existing) {
    assert(existing.slug === "formation-erreurs" && existing.name === "Formation — inscription robuste" && existing.replyToEmail === "video.errors.owner@example.org", "Fixture namespace mismatch")
    assert(reset, "Existing fixture requires explicit reset")
  }
  const events = await db.event.findMany({ where: { organizationId: orgId } })
  assert(events.every(event => event.id === eventId && event.slug === "atelier-inscription" && event.title === "Inscription robuste — démonstration" && event.description === "Données fictives de formation uniquement."), "Unknown event in fixture")
  const people = await db.volunteer.findMany({ where: { organizationId: orgId } })
  assert(people.every(person => person.lastName === "Exemple" && ["video.errors.aline@example.org", "video.errors.alex@example.org", "video.errors.nicolas@example.org", "video.errors.zoe@example.org"].includes(person.email ?? "") && (!person.phone || (person.email === "video.errors.alex@example.org" && person.phone === "079 000 12 34"))), "Unknown person in fixture")
  const owners = await db.adminUser.findMany({ where: { organizationId: orgId } })
  if (existing) assert.equal(owners.length, 1, "Fixture owner missing")
  assert(owners.every(owner => owner.id === `${orgId}-owner` && owner.email === "video.errors.owner@example.org" && owner.name === "Élodie Exemple"), "Unknown owner in fixture")
  const queued = await db.notificationOutbox.findMany({ where: { organizationId: orgId } })
  for (const row of queued) {
    const payload = openPayload(row.payload)
    assert(/^video\.errors\.(aline|alex|nicolas|zoe|owner)@example\.org$/.test(payload.recipient?.email ?? ""), "Unknown recipient in fixture outbox")
  }
  const day = new Date("2026-11-14T00:00:00Z")
  await db.$transaction(async tx => {
    // The application still enforces its real 20/hour limit. Only the exact
    // recorder-owned test bucket is reset, never loopback/shared counters.
    await tx.rateLimit.deleteMany({ where: { key: `registrations:${registrationErrorFixtureIp}` } })
    // Delete only the IDs inspected above; never the default/shared organization.
    await tx.notificationOutbox.deleteMany({ where: { organizationId: orgId, id: { in: queued.map(row => row.id) } } })
    if (events.length) await tx.event.delete({ where: { id: eventId } })
    await tx.volunteer.deleteMany({ where: { organizationId: orgId, id: { in: people.map(person => person.id) } } })
    if (!existing) {
      await tx.organization.create({ data: { id: orgId, slug: "formation-erreurs", name: "Formation — inscription robuste", timeZone: "Europe/Zurich", active: true, hasOrgInsurance: true, replyToEmail: "video.errors.owner@example.org" } })
      await tx.adminUser.create({ data: { id: `${orgId}-owner`, organizationId: orgId, email: "video.errors.owner@example.org", name: "Élodie Exemple", role: "admin", isActive: true, passwordHash: source.passwordHash } })
    }
    await tx.volunteer.create({ data: { id: `${orgId}-aline`, organizationId: orgId, firstName: "Aline", lastName: "Exemple", email: "video.errors.aline@example.org", active: true } })
    await tx.event.create({ data: { id: eventId, organizationId: orgId, slug: "atelier-inscription", title: "Inscription robuste — démonstration", description: "Données fictives de formation uniquement.", startDate: day, endDate: day, publicStatus: "published", isListed: false, remindersEnabled: false } })
    await tx.eventQuestion.create({ data: { id: `${orgId}-question`, eventId, label: "Taille du t-shirt", type: "single", options: ["S", "M", "L"], required: true } })
    for (const [index, [roleName, startTime, endTime]] of [["Accueil", "10:00", "12:00"], ["Vestiaire", "11:00", "13:00"], ["Logistique", "14:00", "16:00"]].entries()) await tx.shift.create({ data: { id: `${orgId}-shift-${index}`, eventId, roleName, label: `${roleName} — démonstration`, date: day, startTime, endTime, capacity: 3, status: "open", displayOrder: index } })
    await tx.registration.create({ data: { id: `${orgId}-initial`, eventId, shiftId: `${orgId}-shift-0`, volunteerId: `${orgId}-aline`, status: "active", source: "admin_manual", ...registrationToken.data("demo-errors-aline-initial") } })
  })
  assert.equal(await db.registration.count({ where: { eventId } }), 1)
  assert.equal(await db.shift.count({ where: { eventId } }), 3)
  return { organizationId: orgId, eventId, removedSyntheticPeople: people.length, removedSyntheticOutboxRows: queued.length, resetPerformed: !!existing }
}
