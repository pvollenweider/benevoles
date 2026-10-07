// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { Page } from "playwright"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { loadCurrentDeliveryRuntime } from "../tools/prepare-delivery"
import { verifyProductBuild } from "./product-build"

const org = "video-data-exports", eventId = "video-data-exports-event"
const memberId = "video-data-exports-member-2", shiftId = "cmuvpbr9i0001jsa553j0izrc"
const base = "http://localhost:43102"
export const exportEnrichmentFile = "fourteen-column-actions.json"

export async function readExportEnrichment(directory: string) {
  let bytes: Buffer
  try { bytes = await readFile(path.join(directory, exportEnrichmentFile)) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
  const hash = (await readFile(path.join(directory, `${exportEnrichmentFile}.sha256`), "utf8")).trim()
  assert.equal(createHash("sha256").update(bytes).digest("hex"), hash, "Export action ledger changed")
  const ledger = JSON.parse(bytes.toString("utf8"))
  assert.equal(ledger.organizationId, org); assert.equal(ledger.eventId, eventId)
  assert.equal(ledger.memberId, memberId); assert.equal(ledger.shiftId, shiftId)
  assert.equal(ledger.signupStatus, 201)
  assert(typeof ledger.registrationId === "string" && ledger.registrationId.length > 10)
  assert(Array.isArray(ledger.initialRegistrationIds) && ledger.initialRegistrationIds.join(",") === "cmuvpbr9k0002jsa5lu09cnww,cmuvpbr9p0003jsa5nh9ohyc1,cmuvpbr9q0004jsa58dp7b9b4")
  return ledger
}

/** Real public signup and current-main worker, strictly local and scoped. No timestamps seeded. */
export async function enrichExportClassroom(db: PrismaClient, page: Page, directory: string) {
  const existing = await readExportEnrichment(directory)
  if (existing?.completed) return existing
  assert(!existing, "Partial enrichment requires inspection; never replay a signup blindly")
  assert(["localhost", "127.0.0.1"].includes(process.env.SMTP_HOST ?? ""))
  assert.equal(process.env.SMTP_PORT, "41026", "Local Mailpit SMTP only")
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, include: { shifts: true, registrations: true } })
  assert.equal(event.organizationId, org); assert.equal(event.publicStatus, "draft")
  assert.equal(event.registrations.length, 3)
  const shift = event.shifts.find(s => s.id === shiftId)
  assert(shift && shift.status === "open" && shift.capacity === 4 && shift.startTime === "12:00" && shift.endTime === "14:00")
  assert(!event.registrations.some(r => r.volunteerId === memberId && r.shiftId === shiftId))
  assert.equal(await db.pushSubscription.count({ where: { volunteer: { organizationId: org } } }), 0, "No push devices in export classroom")
  const beforeOutbox = await db.notificationOutbox.findMany({ where: { organizationId: org }, select: { id: true } })
  const published = await page.request.patch(`${base}/api/admin/events/${eventId}`, { data: { publicStatus: "published", isListed: false } })
  assert(published.ok(), "Private classroom publishing failed")
  const response = await page.request.post(`${base}/api/public/registrations`, { data: {
    eventId, shiftIds: [shiftId], firstName: "Zoé", lastName: "Exemple", email: "video.exports.member.2@example.org",
    phone: "+41 79 000 0002", consent: true, charterAccepted: true,
  } })
  assert.equal(response.status(), 201, "Actual public signup failed; inspect state before any retry")
  const added = await db.registration.findFirstOrThrow({ where: { eventId, volunteerId: memberId, shiftId } })
  assert.equal(added.status, "active")
  const proof = added as typeof added & { charterAcceptedAt: Date | null; charterAcceptedHash: string | null }
  assert(proof.charterAcceptedAt && proof.charterAcceptedHash, "Real signup did not record charter acceptance")
  const ledger = { organizationId: org, eventId, memberId, shiftId, signupStatus: 201, registrationId: added.id,
    initialRegistrationIds: event.registrations.map(r => r.id).sort(), charterAcceptedAt: proof.charterAcceptedAt.toISOString(),
    charterAcceptedHash: proof.charterAcceptedHash, publicStatus: "published", isListed: false, completed: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ledger extended step by step and read back from disk
    product: await verifyProductBuild(base) } as Record<string, any>
  const save = async () => {
    const bytes = Buffer.from(JSON.stringify(ledger, null, 2))
    await writeFile(path.join(directory, exportEnrichmentFile), bytes)
    await writeFile(path.join(directory, `${exportEnrichmentFile}.sha256`), createHash("sha256").update(bytes).digest("hex") + "\n")
  }
  await save() // Persist exact API-created ID before any subsequent action.
  const sent = await page.request.post(`${base}/api/admin/events/${eventId}/message`, { data: {
    audience: { kind: "shift", shiftId }, subject: "Formation — copie des résultats d'envoi",
    message: "Bonjour ! Cet email de démonstration permet de comprendre les résultats d'envoi dans votre export.", push: false,
  } })
  assert(sent.ok(), "Actual classroom message failed")
  const runtime = await loadCurrentDeliveryRuntime("http://localhost:43102")
  try {
    const ids = (await db.notificationOutbox.findMany({ where: { organizationId: org }, select: { id: true, payload: true } }))
      .filter(row => !beforeOutbox.some(before => before.id === row.id))
    assert(ids.length > 0)
    for (const row of ids) {
      const payload = runtime.openPayload(row.payload)
      if (payload.organizationId) assert.equal(payload.organizationId, org)
      assert(/^video\.exports\.(?:member\.[0-3]|owner|leader)@example\.org$/.test(payload.recipient.email ?? ""))
    }
    await runtime.deliverOutbox({ ids: ids.map(row => row.id) }) // Never a global worker sweep.
    const outcomes = await db.deliveryOutcome.findMany({ where: { organizationId: org, volunteerId: memberId } })
    assert(outcomes.some(o => o.outcome === "accepted_by_relay"), "Real email result missing")
    const inbox = await (await fetch("http://localhost:48026/api/v1/messages?limit=1000")).json() as { messages: { ID: string; Subject: string; To: { Address: string }[] }[] }
    const mail = inbox.messages.find(m => m.Subject === "Formation — copie des résultats d'envoi — Fête des archives — démonstration" && m.To.some(to => to.Address === "video.exports.member.2@example.org"))
    assert(mail, "Local Mailpit evidence missing")
    ledger.outboxIds = ids.map(row => row.id); ledger.outcomeIds = outcomes.map(o => o.id)
    ledger.mailpitMessageId = mail.ID; ledger.workerProduct = runtime.product; ledger.workerSourcePaths = runtime.importedSourcePaths
    ledger.completed = true; await save()
    return ledger
  } finally { await runtime.db.$disconnect(); await runtime.unregister() }
}
