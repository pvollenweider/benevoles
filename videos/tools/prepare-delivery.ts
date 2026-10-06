// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Actual outbox worker + controlled SMTP, only this local synthetic organization. */
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { controlledSmtp } from "../lib/controlled-smtp"

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43102")
  const fixture = await controlledSmtp()
  // These settings apply only to this tool's process, never to the running app.
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "41028", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
  const { prisma: db } = await import("../../src/lib/prisma")
  const { enqueueNotifications, deliverOutbox, openPayload } = await import("../../src/lib/notifications/outbox")
  const orgId = "video-delivery", orgName = "Formation — suivi des emails", slug = "formation-livraisons"
  const originalError = console.error
  let controlledErrors = 0
  console.error = (...args: unknown[]) => {
    const prefix = String(args[0])
    if (prefix === "[notif:email] targeted_message failed:" || prefix === "[outbox.gave_up.targeted_message]") { controlledErrors++; return }
    originalError(...args)
  }
  try {
    const existing = await db.organization.findUnique({ where: { id: orgId } })
    if (existing) assert(existing.name === orgName && existing.slug === slug)
    const previousCampaigns = await db.targetedMessage.findMany({ where: { organizationId: orgId } })
    const expectedCampaignText: Record<string, string> = {
      "Formation — adresse corrigée": "Bonjour {prénom}, voici ton nouveau message, préparé après correction de ton adresse. Merci pour ton aide !",
      "Formation — échec partiel": "Bonjour {prénom}, merci pour ton aide !",
    }
    const expectedAuthors: Record<string, string> = { "video-delivery-owner": "Élodie Exemple", "video-delivery-organizer": "Marc Exemple" }
    assert(previousCampaigns.every(message => message.eventId === "video-delivery-event" && message.authorId && expectedAuthors[message.authorId] === message.authorName && expectedCampaignText[message.subject] === message.message), "Unrecognized campaign in delivery fixture; refusing cleanup")
    const campaignIds = new Set(previousCampaigns.map(message => message.id))
    const oldRows = await db.notificationOutbox.findMany({ where: { organizationId: orgId }, select: { id: true, payload: true, dedupeKey: true, targetedMessageId: true } })
    for (const row of oldRows) {
      const payload = openPayload(row.payload)
      const prepared = row.dedupeKey?.startsWith("video-delivery-preparation:") && row.targetedMessageId === null
      const campaign = row.targetedMessageId && campaignIds.has(row.targetedMessageId) && row.dedupeKey?.startsWith("message:") && expectedCampaignText[String(payload.data.subject)] === payload.data.message
      // Campaign bodies are personalized by the route, so check the original
      // campaign above and the exact rendered fictitious first names here.
      const personalizedCampaign = row.targetedMessageId && campaignIds.has(row.targetedMessageId) && row.dedupeKey?.startsWith("message:") && Object.values(expectedCampaignText).some(text => ["Léa", "Emma"].some(name => text.replace("{prénom}", name) === payload.data.message))
      assert((prepared || campaign || personalizedCampaign) && payload.kind === "targeted_message" && /^video\.delivery\.[a-z-]+@example\.org$/.test(payload.recipient.email ?? "") && payload.data.eventTitle === "Atelier des emails", "Unrecognized outbox row; refusing fixture cleanup")
    }
    await db.$transaction(async tx => {
      if (oldRows.length) await tx.notificationOutbox.deleteMany({ where: { id: { in: oldRows.map(row => row.id) }, organizationId: orgId } })
      if (campaignIds.size) await tx.targetedMessage.deleteMany({ where: { id: { in: [...campaignIds] }, organizationId: orgId } })
    })
    if (!existing) await db.organization.create({ data: { id: orgId, name: orgName, slug, timeZone: "Europe/Zurich", replyToEmail: "video.delivery.owner@example.org", hasOrgInsurance: true } })
    const ownerId = "video-delivery-owner", ownerEmail = "video.delivery.owner@example.org"
    const owner = await db.adminUser.findUnique({ where: { id: ownerId } })
    if (owner) assert(owner.email === ownerEmail && owner.organizationId === orgId && owner.name === "Élodie Exemple")
    else {
      const source = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" }, select: { passwordHash: true } })
      await db.adminUser.create({ data: { id: ownerId, organizationId: orgId, name: "Élodie Exemple", email: ownerEmail, role: "admin", passwordHash: source.passwordHash } })
    }
    const organizerId = "video-delivery-organizer", organizerEmail = "video.delivery.organizer@example.org"
    const organizer = await db.adminUser.findUnique({ where: { id: organizerId } })
    if (organizer) assert(organizer.organizationId === orgId && organizer.email === organizerEmail && organizer.role === "organizer")
    else await db.adminUser.create({ data: { id: organizerId, organizationId: orgId, name: "Marc Exemple", email: organizerEmail, role: "organizer", passwordHash: (await db.adminUser.findUniqueOrThrow({ where: { id: ownerId } })).passwordHash } })
    const names: Record<string, string> = { pending: "Jules", retrying: "Sarah", recoverable: "Emma", wrong: "Léa", sent: "Nicolas" }
    // IDs are globally unique: validate their ownership before an upsert can
    // update an existing member, even if that member belongs to another tenant.
    const fixtureIds = Object.keys(names).map(label => `video-delivery-member-${label}`)
    const globallyMatchingPeople = await db.volunteer.findMany({ where: { id: { in: fixtureIds } } })
    assert(globallyMatchingPeople.every(person => person.organizationId === orgId), "Delivery fixture member ID belongs to another organization; refusing to update")
    const previousPeople = await db.volunteer.findMany({ where: { organizationId: orgId } })
    assert(previousPeople.every(person => Object.keys(names).some(label => person.id === `video-delivery-member-${label}` && person.firstName === names[label] && person.lastName === "Exemple" && [ `video.delivery.${label}@example.org`, ...(label === "wrong" ? ["video.delivery.corrected@example.org"] : []) ].includes(person.email ?? ""))))
    for (const [label, firstName] of Object.entries(names)) await db.volunteer.upsert({ where: { id: `video-delivery-member-${label}` }, create: { id: `video-delivery-member-${label}`, organizationId: orgId, firstName, lastName: "Exemple", email: `video.delivery.${label}@example.org`, notes: "Données fictives pour la démonstration des livraisons." }, update: { email: `video.delivery.${label}@example.org` } })
    const snapshots: { id: string; recipient: string; now: string; status: string; attempts: number; nextAttemptAt: string; outcome: unknown }[] = []
    const ids: Record<string, string> = {}
    async function create(label: string) {
      const recipient = `video.delivery.${label}@example.org`
      const name = `${names[label]} Exemple`
      const [id] = await enqueueNotifications([{ kind: "targeted_message", organizationId: orgId, dedupeKey: `video-delivery-preparation:${label}`, recipient: { email: recipient, name }, data: { volunteerName: name, organizationName: orgName, eventTitle: "Atelier des emails", subject: `Formation — ${label}`, message: "Données fictives. Rendez-vous au stand quinze minutes avant votre créneau.", shifts: [] } }])
      ids[label] = id
      return { id, recipient }
    }
    await create("pending")
    for (const [label, attempts] of [["retrying", 1], ["recoverable", 6], ["wrong", 6], ["sent", 1]] as const) {
      const row = await create(label)
      if (label !== "sent") fixture.rejected.add(row.recipient)
      for (let attempt = 0; attempt < attempts; attempt++) {
        const before = await db.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })
        // Advance the worker's supported clock, not the persisted state or attempts.
        const now = new Date(Math.max(Date.now(), before.nextAttemptAt.getTime()) + 1)
        const outcome = await deliverOutbox({ ids: [row.id], now })
        const after = await db.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })
        assert.equal(after.attempts, label === "sent" ? 0 : attempt + 1)
        assert.equal(after.status, label === "sent" ? "sent" : attempt === 5 ? "failed" : "pending")
        if (label !== "sent") assert(after.lastError?.includes("550 5.1.1 Synthetic recipient rejected"))
        snapshots.push({ id: row.id, recipient: row.recipient, now: now.toISOString(), status: after.status, attempts: after.attempts, nextAttemptAt: after.nextAttemptAt.toISOString(), outcome })
      }
    }
    assert.equal(fixture.attempts.filter(attempt => !attempt.accepted).length, 13)
    assert.equal(fixture.attempts.filter(attempt => attempt.accepted).length, 1)
    const pending = await db.notificationOutbox.findUniqueOrThrow({ where: { id: ids.pending } })
    assert(pending.status === "pending" && pending.attempts === 0)
    const inbox = await (await fetch("http://localhost:48026/api/v1/messages?limit=1000")).json() as { messages: { ID: string; Subject: string; To: { Address: string }[] }[] }
    const sent = inbox.messages.find(mail => mail.Subject === "Formation — sent — Atelier des emails" && mail.To.some(to => to.Address === "video.delivery.sent@example.org"))
    assert(sent, "Actual successful worker delivery missing")
    await mkdir("videos/output/email-delivery-failures", { recursive: true })
    await writeFile("videos/output/email-delivery-failures/outbox-preparation.json", JSON.stringify({ checkedAt: new Date().toISOString(), organizationId: orgId, ids, clock: "Supported deliverOutbox now parameter advanced to each real scheduled due time; accelerated demonstration clock, no status/attempt columns manually changed", actualSmtpAttempts: fixture.attempts, workerSnapshots: snapshots, pendingWithoutAttempt: true, actualDeliveredMailId: sent.ID, controlledErrorLogsCount: controlledErrors, note: "Real worker/SMTP evidence; UI retry, address correction and campaign still to film" }, null, 2))
    console.log("✓ Real outbox: pending without attempt, retry scheduled, two failures after six actual SMTP attempts each, and one actual successful Mailpit delivery; clock acceleration recorded")
  } finally { console.error = originalError; await db.$disconnect(); await fixture.close() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Delivery preparation failed"); process.exitCode = 1 })
