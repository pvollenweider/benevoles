// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Exact owned local scenario reset. No SMTP or notification is sent here. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { loadCurrentVideoPrisma } from "../lib/current-product-prisma"
import { linkToken, decryptValue } from "../../src/lib/token-vault"
import { assertQuestionsReviewFixture, QUESTIONS_ORG, QUESTIONS_EVENT, QUESTIONS_MEMBER, QUESTIONS_OWNER, QUESTIONS_EMAIL, QUESTIONS_DATE, QUESTIONS_SHIFTS } from "../lib/event-questions-fixture"

export function assertQuestionsOwnership(ledger: unknown, createdAt: string) {
  const value = ledger as { schemaVersion?: number; organizationId?: string; eventId?: string; memberId?: string; organizationCreatedAt?: string; fixtureSchemaSha256?: string }
  assert(value && value.schemaVersion === 1 && value.organizationId === QUESTIONS_ORG && value.eventId === QUESTIONS_EVENT && value.memberId === QUESTIONS_MEMBER && value.organizationCreatedAt === createdAt && value.fixtureSchemaSha256 === questionsSchemaSha256, "Exact prepared questions ownership proof required")
}
const schema = { organizationId: QUESTIONS_ORG, eventId: QUESTIONS_EVENT, memberId: QUESTIONS_MEMBER, owner: QUESTIONS_OWNER, email: QUESTIONS_EMAIL, date: QUESTIONS_DATE, shifts: QUESTIONS_SHIFTS }
export const questionsSchemaSha256 = createHash("sha256").update(JSON.stringify(schema)).digest("hex")

async function main() {
  const args = process.argv.slice(2)
  assert(args.length === 0 || (args.length === 1 && args[0] === "--reset-owned"), "Only --reset-owned is accepted")
  const directory = path.resolve("videos/output/event-questions")
  let ledger: unknown = null
  try { ledger = JSON.parse(await readFile(path.join(directory, "ownership.json"), "utf8")) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  const runtime = await loadCurrentVideoPrisma("http://localhost:43112")
  const { db, product } = runtime
  try {
    await db.$transaction(async tx => {
      let passwordHash: string
      const existing = await tx.organization.findFirst({ where: { OR: [{ id: QUESTIONS_ORG }, { slug: "formation-questions" }] }, select: { id: true, createdAt: true } })
      if (existing) {
        assert.equal(args[0], "--reset-owned", "Existing fixture requires explicit --reset-owned")
        assert.equal(existing.id, QUESTIONS_ORG)
        assertQuestionsOwnership(ledger, existing.createdAt.toISOString())
        const owned = await assertQuestionsReviewFixture(tx as unknown as typeof db)
        const owner = await tx.adminUser.findFirstOrThrow({ where: { id: `${QUESTIONS_ORG}-owner`, organizationId: QUESTIONS_ORG, email: QUESTIONS_OWNER, role: "admin", isActive: true }, select: { passwordHash: true } })
        passwordHash = owner.passwordHash
        // Validate every actual outbox payload before deleting by its exact ID.
        const outbox = await tx.notificationOutbox.findMany({ where: { organizationId: QUESTIONS_ORG } })
        for (const row of outbox) {
          const stored = row.payload as { enc?: string; kind?: string; recipient?: { email?: string }; data?: { eventTitle?: string; volunteerName?: string; volunteerEmail?: string } }
          const payload = stored.enc ? JSON.parse(decryptValue(stored.enc)!) as typeof stored : stored
          const confirmation = payload.kind === "registration_confirmation" && payload.recipient?.email === QUESTIONS_EMAIL
          const organizer = payload.kind === "admin_notification" && payload.recipient?.email === QUESTIONS_OWNER && payload.data?.volunteerEmail === QUESTIONS_EMAIL
          assert((confirmation || organizer) && payload.data?.eventTitle === owned.events[0].title && payload.data?.volunteerName === "Aline Exemple", "Unknown email row in questions fixture")
        }
        for (const row of outbox) await tx.notificationOutbox.delete({ where: { id: row.id } })
        await tx.event.delete({ where: { id: QUESTIONS_EVENT } })
        await tx.volunteer.delete({ where: { id: QUESTIONS_MEMBER } })
        await tx.adminUser.delete({ where: { id: `${QUESTIONS_ORG}-owner` } })
        await tx.organization.delete({ where: { id: QUESTIONS_ORG } })
      } else {
        const owner = await tx.adminUser.findFirstOrThrow({ where: { id: "video-navigation-current-owner", organizationId: "video-navigation-current", email: "video.navigation.owner@example.org", role: "admin", isActive: true }, select: { passwordHash: true } })
        passwordHash = owner.passwordHash
      }
      // Global ID collision checks: never update another organization by ID.
      assert.equal(await tx.event.count({ where: { id: QUESTIONS_EVENT } }), 0)
      assert.equal(await tx.volunteer.count({ where: { id: QUESTIONS_MEMBER } }), 0)
      assert.equal(await tx.adminUser.count({ where: { OR: [{ id: `${QUESTIONS_ORG}-owner` }, { email: QUESTIONS_OWNER }] } }), 0)
      assert.equal(await tx.shift.count({ where: { id: { in: QUESTIONS_SHIFTS } } }), 0)
      assert.equal(await tx.memberInvite.count({ where: { id: `${QUESTIONS_ORG}-invite` } }), 0)
      await tx.organization.create({ data: { id: QUESTIONS_ORG, name: "Formation — questions aux bénévoles", slug: "formation-questions", timeZone: "Europe/Zurich", replyToEmail: QUESTIONS_OWNER, active: true, hasOrgInsurance: true } })
      await tx.adminUser.create({ data: { id: `${QUESTIONS_ORG}-owner`, organizationId: QUESTIONS_ORG, name: "Élodie Exemple", email: QUESTIONS_OWNER, passwordHash, role: "admin", isActive: true } })
      await tx.volunteer.create({ data: { id: QUESTIONS_MEMBER, organizationId: QUESTIONS_ORG, firstName: "Aline", lastName: "Exemple", email: QUESTIONS_EMAIL, active: true } })
      const date = new Date(QUESTIONS_DATE)
      await tx.event.create({ data: { id: QUESTIONS_EVENT, organizationId: QUESTIONS_ORG, title: "Préparer les questions de l'équipe", slug: "atelier-questions", description: "Une formation avec des données fictives, pour préparer nos t-shirts et le matériel.", startDate: date, endDate: date, publicStatus: "published", isListed: false, registrationsOpen: true, remindersEnabled: false } })
      for (const [i, id] of QUESTIONS_SHIFTS.entries()) await tx.shift.create({ data: { id, eventId: QUESTIONS_EVENT, roleName: "Accueil", label: `Accueil — passage ${i + 1}`, date, startTime: `${10 + i * 2}:00`, endTime: `${12 + i * 2}:00`, capacity: 4 } })
      await tx.memberInvite.create({ data: { id: `${QUESTIONS_ORG}-invite`, eventId: QUESTIONS_EVENT, volunteerId: QUESTIONS_MEMBER, ...linkToken.data("demo-event-questions-aline-invitation") } })
    }, { timeout: 30000 })
    const owned = await assertQuestionsReviewFixture(db)
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, "ownership.json"), JSON.stringify({ schemaVersion: 1, ...schema, organizationCreatedAt: owned.createdAt.toISOString(), fixtureSchemaSha256: questionsSchemaSha256, preparedAt: new Date().toISOString() }, null, 2))
    await writeFile(path.join(directory, "preparation.json"), JSON.stringify({ product, preparedAt: new Date().toISOString(), organizationId: QUESTIONS_ORG, eventId: QUESTIONS_EVENT, synthetic: true, questions: 0, registrations: 0, freeSlots: 4, emailsSent: false }, null, 2))
    console.log("✓ Owned questions fixture prepared: four free shifts, one invited fictional member, no questions or registrations. No email sent.")
  } finally { await db.$disconnect(); await runtime.unregister() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error instanceof Error ? error.message || `${error.name}: questions preparation failed` : "Questions preparation failed"); if (error instanceof Error) console.error(error.stack?.split("\n").filter(line => /^\s+at /.test(line)).slice(0, 6).join("\n")); process.exitCode = 1 })
