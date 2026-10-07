// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** New generation, created once. No deletion or reset of either generation. Never sends mail. */
import assert from "node:assert/strict"
import { loadCurrentVideoPrisma } from "../lib/current-product-prisma"
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { MERGE_ORG, MERGE_SLUG, MERGE_OWNER, MERGE_KEEP, MERGE_ABSORB, MERGE_EVENT, MERGE_MOVED_REGISTRATION, MERGE_MOVED_INVITE, MERGE_QUESTION, assertMergeDatabase, assertMergeReviewFixture } from "../lib/member-merge-v4-fixture"

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  assertMergeDatabase(databaseUrl)
  const args = process.argv.slice(2)
  assert.equal(args.length, 0, "This generation never resets or accepts mutation flags")
  const directory = path.resolve("videos/output/members-duplicates-merge")
  const ledgerPath = path.join(directory, "generation-v4.json")
  const { db, product, tokens: { registrationToken, linkToken }, unregister } = await loadCurrentVideoPrisma("http://localhost:43110")
  try {
    const legacySnapshot = async () => {
      const generations = []
      for (const organizationId of ["video-member-merge", "video-member-merge-v2", "video-member-merge-v3"]) generations.push({ organization: await db.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { admins: true, volunteers: true, events: { include: { shifts: true, registrations: true, memberInvites: true, questions: { include: { answers: true } }, logs: true } } } }), logs: await db.orgLog.findMany({ where: { organizationId }, orderBy: { id: "asc" } }), outbox: await db.notificationOutbox.findMany({ where: { organizationId }, orderBy: { id: "asc" } }), dismissals: await db.duplicateDismissal.findMany({ where: { organizationId }, orderBy: { id: "asc" } }) })
      return generations
    }
    const legacyBeforeSha256 = createHash("sha256").update(JSON.stringify(await legacySnapshot())).digest("hex")
    const source = await db.adminUser.findUniqueOrThrow({ where: { id: "video-member-merge-owner" }, select: { organizationId: true, email: true, passwordHash: true } })
    assert(source.organizationId === "video-member-merge" && source.email === "video.merge.owner@example.org")
    const date = new Date("2026-11-28T00:00:00Z")
    await db.$transaction(async tx => {
      const existing = await tx.organization.count({ where: { OR: [{ id: MERGE_ORG }, { slug: MERGE_SLUG }] } })
      assert.equal(existing, 0, "Generation v4 already exists; it is never deleted or reconstructed")
      const passwordHash = source.passwordHash
      await tx.organization.create({ data: { id: MERGE_ORG, slug: MERGE_SLUG, name: "Formation — doublons et fusion", timeZone: "Europe/Zurich", active: true, replyToEmail: MERGE_OWNER } })
      await tx.adminUser.create({ data: { id: `${MERGE_ORG}-owner`, organizationId: MERGE_ORG, name: "Élodie Martin", email: MERGE_OWNER, passwordHash, role: "admin", isActive: true } })
      await tx.volunteer.create({ data: { id: MERGE_KEEP, organizationId: MERGE_ORG, firstName: "Robin", lastName: "Favre", email: "video.merge-v4.robin@example.org", phone: "0790000100", notes: "Disponible le matin.", birthDate: new Date("1990-01-15T00:00:00Z"), tags: ["accueil"], availabilityPeriods: ["morning"], availabilityNote: "Disponible le samedi." } })
      await tx.volunteer.create({ data: { id: MERGE_ABSORB, organizationId: MERGE_ORG, firstName: "Robin", lastName: "Favre", email: "video.merge-v4.robim@example.org", phone: "0790000101", notes: "Connaît l'entrée nord.", birthDate: new Date("1991-01-15T00:00:00Z"), tags: ["buvette"], availabilityPeriods: ["afternoon"], availabilityNote: "Préférence pour l'accueil." } })
      await tx.event.create({ data: { id: MERGE_EVENT, organizationId: MERGE_ORG, slug: "atelier-fusion-v4", title: "Fusion de fiches — démonstration", description: "Données fictives de formation uniquement.", startDate: date, endDate: date, publicStatus: "published", isListed: false, remindersEnabled: false } })
      await tx.shift.create({ data: { id: `${MERGE_ORG}-shift-main`, eventId: MERGE_EVENT, roleName: "Accueil", label: "Accueil entrée principale", date, startTime: "10:00", endTime: "12:00", capacity: 5, maxPerVolunteer: 1 } })
      await tx.shift.create({ data: { id: `${MERGE_ORG}-shift-overlap`, eventId: MERGE_EVENT, roleName: "Accueil", label: "Relève entrée nord", date, startTime: "11:00", endTime: "13:00", capacity: 5, maxPerVolunteer: 1, minAge: 60, reservedTags: ["permis-b"] } })
      for (const [id, volunteerId, shiftId, status, token] of [
        [`${MERGE_ORG}-registration-keep`, MERGE_KEEP, `${MERGE_ORG}-shift-main`, "active", "demo-member-merge-v4-kept-registration"],
        [`${MERGE_ORG}-registration-same`, MERGE_ABSORB, `${MERGE_ORG}-shift-main`, "waiting", "demo-member-merge-v4-same-registration"],
        [MERGE_MOVED_REGISTRATION, MERGE_ABSORB, `${MERGE_ORG}-shift-overlap`, "active", "demo-member-merge-v4-old-registration"],
      ]) await tx.registration.create({ data: { id, eventId: MERGE_EVENT, volunteerId, shiftId, status, source: "admin_manual", ...(status === "waiting" ? { waitingPosition: 1 } : {}), ...registrationToken.data(token) } })
      await tx.eventQuestion.create({ data: { id: MERGE_QUESTION, eventId: MERGE_EVENT, label: "Taille du t-shirt", type: "single", options: ["M", "L"] } })
      for (const [id, volunteerId, value] of [[`${MERGE_ORG}-answer-keep`, MERGE_KEEP, "M"], [`${MERGE_ORG}-answer-absorb`, MERGE_ABSORB, "L"]]) await tx.questionAnswer.create({ data: { id, eventId: MERGE_EVENT, questionId: MERGE_QUESTION, volunteerId, values: [value] } })
      for (const [id, volunteerId, token] of [[`${MERGE_ORG}-invite-keep`, MERGE_KEEP, "demo-member-merge-v4-kept-invitation"], [MERGE_MOVED_INVITE, MERGE_ABSORB, "demo-member-merge-v4-old-invitation"]]) await tx.memberInvite.create({ data: { id, eventId: MERGE_EVENT, volunteerId, ...linkToken.data(token) } })
      await tx.pushSubscription.create({ data: { id: `${MERGE_ORG}-push`, volunteerId: MERGE_ABSORB, endpoint: "https://video.invalid/push/merge-v4-fictional-only", auth: "synthetic-only", p256dh: "synthetic-only" } })
    }, { timeout: 30000 })
    await mkdir(directory, { recursive: true })
    const created = await db.organization.findUniqueOrThrow({ where: { id: MERGE_ORG }, select: { createdAt: true } })
    const legacyAfterSha256 = createHash("sha256").update(JSON.stringify(await legacySnapshot())).digest("hex")
    assert.equal(legacyBeforeSha256, legacyAfterSha256, "Old generation changed during create-only preparation")
    const ownership = { schemaVersion: 4, scenario: "members-duplicates-merge", organizationId: MERGE_ORG, organizationCreatedAt: created.createdAt.toISOString(), preparedAt: new Date().toISOString(), product, members: [MERGE_KEEP, MERGE_ABSORB], eventId: MERGE_EVENT, oldGenerationsPreserved: ["video-member-merge", "video-member-merge-v2", "video-member-merge-v3"], legacyBeforeSha256, legacyAfterSha256, createdOnceNoReset: true }
    const ownershipJson = JSON.stringify(ownership, null, 2)
    await writeFile(ledgerPath, ownershipJson)
    await writeFile(path.join(directory, "generation-v4.sha256"), createHash("sha256").update(ownershipJson).digest("hex") + "\n")
    await assertMergeReviewFixture(db, databaseUrl)
    await writeFile(path.join(directory, "preparation.json"), JSON.stringify({ preparedAt: new Date().toISOString(), organizationId: MERGE_ORG, eventId: MERGE_EVENT, members: 2, registrations: 3, invitations: 2, answerConflict: true, invitationConflict: true, otherWarnings: ["same_shift", "overlap", "role_limit", "min_age", "reserved_role"], emailsSent: false }, null, 2))
    console.log("✓ Separate fictional merge fixture created once: two members, three registrations, two invitations, real blocking conflicts and review warnings. No email sent.")
  } finally { await db.$disconnect(); await unregister() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Merge preparation failed"); process.exitCode = 1 })
