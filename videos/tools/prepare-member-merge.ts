// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Dedicated fictional fixture; only a guarded exact-ID reset is allowed. Never sends mail. */
import assert from "node:assert/strict"
import { loadCurrentVideoPrisma } from "../lib/current-product-prisma"
import { assertMergeResetFixture, mergeOwnedSchema, mergeOwnedSchemaSha256, type MergeOwnershipLedger } from "../lib/member-merge-reset-guard"
import { createHash } from "node:crypto"
import { mkdir, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import { MERGE_ORG, MERGE_SLUG, MERGE_OWNER, MERGE_KEEP, MERGE_ABSORB, MERGE_EVENT, MERGE_MOVED_REGISTRATION, MERGE_MOVED_INVITE, MERGE_QUESTION, assertMergeDatabase, assertMergeReviewFixture } from "../lib/member-merge-fixture"
import { readPrivateIdentityVersion } from "../lib/private-identity-version"

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  assertMergeDatabase(databaseUrl)
  const args = process.argv.slice(2)
  assert(args.length === 0 || (args.length === 1 && args[0] === "--reset-owned"), "Only explicit --reset-owned is accepted")
  assert(!await readPrivateIdentityVersion("merge"), "Migrated merge identities must not be reconstructed by the legacy reset; preserve current records and ledger")
  const directory = path.resolve("videos/output/members-duplicates-merge")
  const ledgerPath = path.join(directory, "ownership.json")
  let ledger: MergeOwnershipLedger | null = null
  try { ledger = JSON.parse(await readFile(ledgerPath, "utf8")) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  const { db, tokens: { registrationToken, linkToken }, unregister } = await loadCurrentVideoPrisma("http://localhost:43110")
  try {
    const source = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" }, select: { passwordHash: true } })
    const date = new Date("2026-11-28T00:00:00Z")
    await db.$transaction(async tx => {
      const existing = await tx.organization.count({ where: { OR: [{ id: MERGE_ORG }, { slug: MERGE_SLUG }] } })
      let passwordHash = source.passwordHash
      if (existing) {
        assert(args[0] === "--reset-owned", "Merge fixture already exists: explicit owned reset required")
        const proof = await assertMergeResetFixture(tx as unknown as typeof db, databaseUrl, ledger)
        passwordHash = proof.passwordHash
        // All cascading children and cross-organization member relations were
        // checked above inside this same transaction. Never delete by prefix.
        await tx.event.delete({ where: { id: MERGE_EVENT } })
        await tx.pushSubscription.deleteMany({ where: { id: `${MERGE_ORG}-push`, volunteerId: MERGE_ABSORB } })
        // Members/admins use SetNull on organization deletion, not Cascade.
        // Remove only these verified IDs explicitly before recreating them.
        await tx.volunteer.delete({ where: { id: MERGE_ABSORB } })
        await tx.volunteer.delete({ where: { id: MERGE_KEEP } })
        await tx.adminUser.delete({ where: { id: `${MERGE_ORG}-owner` } })
        await tx.organization.delete({ where: { id: MERGE_ORG } })
      }
      await tx.organization.create({ data: { id: MERGE_ORG, slug: MERGE_SLUG, name: "Formation — doublons et fusion", timeZone: "Europe/Zurich", active: true, replyToEmail: MERGE_OWNER } })
      await tx.adminUser.create({ data: { id: `${MERGE_ORG}-owner`, organizationId: MERGE_ORG, name: "Élodie Exemple", email: MERGE_OWNER, passwordHash, role: "admin", isActive: true } })
      await tx.volunteer.create({ data: { id: MERGE_KEEP, organizationId: MERGE_ORG, firstName: "Robin", lastName: "Exemple", email: "video.merge.robin@example.org", phone: "0790000100", notes: "Disponible le matin.", birthDate: new Date("1990-01-15T00:00:00Z"), tags: ["accueil"], availabilityPeriods: ["morning"], availabilityNote: "Disponible le samedi." } })
      await tx.volunteer.create({ data: { id: MERGE_ABSORB, organizationId: MERGE_ORG, firstName: "Robin", lastName: "Exemple", email: "video.merge.robim@example.org", phone: "0790000101", notes: "Connaît l'entrée nord.", birthDate: new Date("1991-01-15T00:00:00Z"), tags: ["buvette"], availabilityPeriods: ["afternoon"], availabilityNote: "Préférence pour l'accueil." } })
      await tx.event.create({ data: { id: MERGE_EVENT, organizationId: MERGE_ORG, slug: "atelier-fusion", title: "Fusion de fiches — démonstration", description: "Données fictives de formation uniquement.", startDate: date, endDate: date, publicStatus: "published", isListed: false, remindersEnabled: false } })
      await tx.shift.create({ data: { id: `${MERGE_ORG}-shift-main`, eventId: MERGE_EVENT, roleName: "Accueil", label: "Accueil entrée principale", date, startTime: "10:00", endTime: "12:00", capacity: 5, maxPerVolunteer: 1 } })
      await tx.shift.create({ data: { id: `${MERGE_ORG}-shift-overlap`, eventId: MERGE_EVENT, roleName: "Accueil", label: "Relève entrée nord", date, startTime: "11:00", endTime: "13:00", capacity: 5, maxPerVolunteer: 1, minAge: 60, reservedTags: ["permis-b"] } })
      for (const [id, volunteerId, shiftId, status, token] of [
        [`${MERGE_ORG}-registration-keep`, MERGE_KEEP, `${MERGE_ORG}-shift-main`, "active", "demo-member-merge-kept-registration"],
        [`${MERGE_ORG}-registration-same`, MERGE_ABSORB, `${MERGE_ORG}-shift-main`, "waiting", "demo-member-merge-same-registration"],
        [MERGE_MOVED_REGISTRATION, MERGE_ABSORB, `${MERGE_ORG}-shift-overlap`, "active", "demo-member-merge-old-registration"],
      ]) await tx.registration.create({ data: { id, eventId: MERGE_EVENT, volunteerId, shiftId, status, source: "admin_manual", ...(status === "waiting" ? { waitingPosition: 1 } : {}), ...registrationToken.data(token) } })
      await tx.eventQuestion.create({ data: { id: MERGE_QUESTION, eventId: MERGE_EVENT, label: "Taille du t-shirt", type: "single", options: ["M", "L"] } })
      for (const [id, volunteerId, value] of [[`${MERGE_ORG}-answer-keep`, MERGE_KEEP, "M"], [`${MERGE_ORG}-answer-absorb`, MERGE_ABSORB, "L"]]) await tx.questionAnswer.create({ data: { id, eventId: MERGE_EVENT, questionId: MERGE_QUESTION, volunteerId, values: [value] } })
      for (const [id, volunteerId, token] of [[`${MERGE_ORG}-invite-keep`, MERGE_KEEP, "demo-member-merge-kept-invitation"], [MERGE_MOVED_INVITE, MERGE_ABSORB, "demo-member-merge-old-invitation"]]) await tx.memberInvite.create({ data: { id, eventId: MERGE_EVENT, volunteerId, ...linkToken.data(token) } })
      await tx.pushSubscription.create({ data: { id: `${MERGE_ORG}-push`, volunteerId: MERGE_ABSORB, endpoint: "https://video.invalid/push/merge-fictional-only", auth: "synthetic-only", p256dh: "synthetic-only" } })
    }, { timeout: 30000 })
    await mkdir(directory, { recursive: true })
    const created = await db.organization.findUniqueOrThrow({ where: { id: MERGE_ORG }, select: { createdAt: true } })
    const ownership: MergeOwnershipLedger = { schemaVersion: 1, scenario: "members-duplicates-merge", organizationId: MERGE_ORG, organizationCreatedAt: created.createdAt.toISOString(), preparedAt: new Date().toISOString(), fixtureSchemaSha256: mergeOwnedSchemaSha256, owned: mergeOwnedSchema }
    const ownershipJson = JSON.stringify(ownership, null, 2)
    await writeFile(ledgerPath, ownershipJson)
    await writeFile(path.join(directory, "ownership.sha256"), createHash("sha256").update(ownershipJson).digest("hex") + "  ownership.json\n")
    await assertMergeReviewFixture(db, databaseUrl)
    await writeFile(path.join(directory, "preparation.json"), JSON.stringify({ preparedAt: new Date().toISOString(), organizationId: MERGE_ORG, eventId: MERGE_EVENT, members: 2, registrations: 3, invitations: 2, answerConflict: true, invitationConflict: true, otherWarnings: ["same_shift", "overlap", "role_limit", "min_age", "reserved_role"], emailsSent: false }, null, 2))
    console.log("✓ Separate fictional merge fixture created once: two members, three registrations, two invitations, real blocking conflicts and review warnings. No email sent.")
  } finally { await db.$disconnect(); await unregister() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Merge preparation failed"); process.exitCode = 1 })
