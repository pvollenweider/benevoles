// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

async function main() {
  const base = process.env.VIDEO_BASE_URL
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert.equal(base, "http://localhost:43102")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  const preparation = JSON.parse(await readFile("videos/output/email-delivery-failures/outbox-preparation.json", "utf8"))
  assert.equal(preparation.organizationId, "video-delivery")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch()
  try {
    const org = await db.organization.findUniqueOrThrow({ where: { id: "video-delivery" } })
    assert.equal(org.slug, "formation-livraisons")
    const before = await db.notificationOutbox.findUniqueOrThrow({ where: { id: preparation.ids.recoverable } })
    assert(before.organizationId === org.id && before.status === "failed" && before.attempts === 6)
    const member = await db.volunteer.findUniqueOrThrow({ where: { id: "video-delivery-member-wrong" } })
    assert(member.organizationId === org.id && member.email === "video.delivery.wrong@example.org")
    const oldWrong = await db.notificationOutbox.findUniqueOrThrow({ where: { id: preparation.ids.wrong } })
    assert.equal(oldWrong.organizationId, org.id)
    const page = await browser.newPage()
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill("video.delivery.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    await page.goto(`${base}/admin/settings/notifications`)
    for (const label of ["En attente d'envoi", "Nouvel essai prévu", "Échec définitif", "Envoyé"]) assert(await page.getByText(label, { exact: true }).count() > 0, `Missing actual UI state: ${label}`)
    const row = page.getByRole("row").filter({ hasText: "video.delivery.recoverable@example.org" })
    await row.getByRole("button", { name: /Renvoyer/ }).click()
    await page.getByRole("status").filter({ hasText: "Renvoi programmé" }).waitFor()
    let delivered = await db.notificationOutbox.findUniqueOrThrow({ where: { id: before.id } })
    for (let attempt = 0; attempt < 30 && delivered.status !== "sent"; attempt++) {
      await page.waitForTimeout(500)
      delivered = await db.notificationOutbox.findUniqueOrThrow({ where: { id: before.id } })
    }
    assert.equal(delivered.status, "sent")
    assert(JSON.stringify(delivered.payload) === JSON.stringify(before.payload), "A retry must keep its original recipient/payload")
    assert.equal(delivered.attempts, 0)
    const repeated = await page.request.post(`${base}/api/admin/settings/notifications/${before.id}/retry`)
    assert.equal(repeated.status(), 404)
    await page.goto(`${base}/admin/members`)
    await page.getByRole("button", { name: "Éditer Léa Exemple", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Modifier le membre" })
    await dialog.getByLabel("Email", { exact: true }).fill("video.delivery.corrected@example.org")
    const saved = page.waitForResponse(response => response.url().endsWith(`/api/admin/members/${member.id}`) && response.request().method() === "PATCH")
    await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click()
    assert.equal((await saved).status(), 200)
    assert.equal((await db.volunteer.findUniqueOrThrow({ where: { id: member.id } })).email, "video.delivery.corrected@example.org")
    assert(JSON.stringify((await db.notificationOutbox.findUniqueOrThrow({ where: { id: oldWrong.id } })).payload) === JSON.stringify(oldWrong.payload), "Address correction must not rewrite the old payload")
    const inbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
    const mail = inbox.messages.find((item: { ID: string; Subject: string; To: { Address: string }[] }) => item.Subject === "Formation — recoverable — Atelier des emails" && item.To.some(to => to.Address === "video.delivery.recoverable@example.org"))
    assert(mail, "Actual UI retry email absent from Mailpit")
    await writeFile("videos/output/email-delivery-failures/ui-details.json", JSON.stringify({ checkedAt: new Date().toISOString(), organizationId: org.id, fourActualStatesVisible: true, actualUiRetryDelivered: true, retryMailId: mail.ID, sameOutboxIdAndPayload: true, retryOfSentRefused: true, actualMemberEmailCorrection: true, oldMessagePayloadUnchangedAfterCorrection: true, remaining: "New message to corrected address and partial-failure campaign still to demonstrate" }, null, 2))
    console.log("✓ Four real UI states, actual retry delivered, repeated retry refused, member email corrected without rewriting the old message")
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Delivery UI verification failed"); process.exitCode = 1 })
