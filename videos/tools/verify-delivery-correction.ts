// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Real application campaign after a synthetic member's address correction. */
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { registrationToken } from "../../src/lib/token-vault"

async function main() {
  const base = process.env.VIDEO_BASE_URL
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert.equal(base, "http://localhost:43102")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch()
  const orgId = "video-delivery", eventId = "video-delivery-event", shiftId = "video-delivery-shift", registrationId = "video-delivery-registration"
  try {
    const member = await db.volunteer.findUniqueOrThrow({ where: { id: "video-delivery-member-wrong" } })
    assert(member.organizationId === orgId && member.email === "video.delivery.corrected@example.org")
    const existing = await db.event.findUnique({ where: { id: eventId } })
    if (existing) assert(existing.organizationId === orgId && existing.title === "Atelier des emails" && existing.slug === "atelier-des-emails")
    else await db.event.create({ data: { id: eventId, organizationId: orgId, title: "Atelier des emails", slug: "atelier-des-emails", startDate: new Date("2026-11-07T00:00:00Z"), endDate: new Date("2026-11-07T00:00:00Z"), publicStatus: "draft", isListed: false, remindersEnabled: false } })
    const shift = await db.shift.findUnique({ where: { id: shiftId } })
    if (shift) assert(shift.eventId === eventId && shift.roleName === "Accueil")
    else await db.shift.create({ data: { id: shiftId, eventId, roleName: "Accueil", label: "Accueil de démonstration", date: new Date("2026-11-07T00:00:00Z"), startTime: "10:00", endTime: "12:00", capacity: 5, status: "open" } })
    const registrations = await db.registration.findMany({ where: { OR: [{ eventId }, { id: registrationId }] } })
    assert(registrations.every(row => row.id === registrationId && row.eventId === eventId && row.volunteerId === member.id && row.shiftId === shiftId && row.status === "active"))
    if (!registrations.length) await db.registration.create({ data: { id: registrationId, eventId, volunteerId: member.id, shiftId, status: "active", source: "admin_manual", ...registrationToken.data("demo-delivery-corrected-registration") } })
    const historyBefore = await db.targetedMessage.count({ where: { eventId } })
    assert(historyBefore < 3, "Three demonstration campaigns already exist; refusing repeated sends")
    const page = await browser.newPage()
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill("video.delivery.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    await page.goto(`${base}/admin/events/${eventId}/message`)
    await page.getByLabel("Objet *", { exact: true }).fill("Formation — adresse corrigée")
    await page.getByLabel("Message *", { exact: true }).fill("Bonjour {prénom}, voici ton nouveau message, préparé après correction de ton adresse. Merci pour ton aide !")
    await page.getByRole("button", { name: "Voir l'aperçu et envoyer", exact: true }).click()
    await page.getByRole("dialog", { name: "Aperçu de l'email" }).getByRole("button", { name: "Envoyer à 1 personne", exact: true }).click()
    await page.getByRole("dialog", { name: "Confirmer l'envoi" }).getByRole("button", { name: "Confirmer l'envoi", exact: true }).click()
    await page.getByRole("heading", { name: "Message envoyé à 1 personne", exact: true }).waitFor()
    const history = await db.targetedMessage.findFirstOrThrow({ where: { eventId }, orderBy: { createdAt: "desc" } })
    assert.equal(await db.targetedMessage.count({ where: { eventId } }), historyBefore + 1)
    const rows = await db.notificationOutbox.findMany({ where: { targetedMessageId: history.id } })
    assert.equal(rows.length, 1)
    let delivered = rows[0]
    for (let attempt = 0; attempt < 30 && delivered.status !== "sent"; attempt++) {
      await page.waitForTimeout(500)
      delivered = await db.notificationOutbox.findUniqueOrThrow({ where: { id: delivered.id } })
    }
    assert.equal(delivered.status, "sent")
    const inbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
    const matches = inbox.messages.filter((mail: { Subject: string; To: { Address: string }[] }) => mail.Subject === "Formation — adresse corrigée — Atelier des emails")
    assert(matches.length > 0 && matches.every((mail: { To: { Address: string }[] }) => mail.To.length === 1 && mail.To[0].Address === member.email))
    await writeFile("videos/output/email-delivery-failures/correction-details.json", JSON.stringify({ checkedAt: new Date().toISOString(), actualUiPreviewAndConfirmedCampaign: true, eventId, historyId: history.id, outboxId: delivered.id, recipient: member.email, actualMailId: matches[0].ID, recipientCount: 1, delivered: true, note: "Actual new message, not a retry of the old payload; no partial SMTP failure claimed" }, null, 2))
    console.log("✓ New message previewed and confirmed in the actual UI, delivered to the corrected address, with real campaign history")
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Correction verification failed"); process.exitCode = 1 })
