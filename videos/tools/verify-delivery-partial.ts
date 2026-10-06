// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { chromium } from "playwright"
import { controlledSmtp } from "../lib/controlled-smtp"
import { registrationToken } from "../../src/lib/token-vault"

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43102")
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "41028", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SECURE: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "" })
  const { prisma: db } = await import("../../src/lib/prisma")
  const { deliverOutbox } = await import("../../src/lib/notifications/outbox")
  const fixture = await controlledSmtp()
  const browser = await chromium.launch()
  const base = "http://localhost:43106", eventId = "video-delivery-event", memberId = "video-delivery-member-recoverable", regId = "video-delivery-registration-partial"
  try {
    const event = await db.event.findUniqueOrThrow({ where: { id: eventId } })
    assert(event.organizationId === "video-delivery" && event.title === "Atelier des emails")
    const member = await db.volunteer.findUniqueOrThrow({ where: { id: memberId } })
    assert(member.organizationId === event.organizationId && member.email === "video.delivery.recoverable@example.org")
    const shift = await db.shift.findUniqueOrThrow({ where: { id: "video-delivery-shift" } })
    assert.equal(shift.eventId, eventId)
    const previous = await db.registration.findUnique({ where: { id: regId } })
    if (previous) assert(previous.eventId === eventId && previous.volunteerId === memberId && previous.shiftId === shift.id)
    else await db.registration.create({ data: { id: regId, eventId, volunteerId: memberId, shiftId: shift.id, status: "active", source: "admin_manual", ...registrationToken.data("demo-delivery-partial-registration") } })
    assert.equal(await db.registration.count({ where: { eventId, status: "active" } }), 2)
    assert(await db.targetedMessage.count({ where: { eventId } }) < 4, "Demonstration send cap reached")
    fixture.rejected.add(member.email!)
    const page = await browser.newPage()
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill("video.delivery.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    const sent = await page.request.post(`${base}/api/admin/events/${eventId}/message`, { data: { audience: { kind: "event" }, subject: "Formation — échec partiel", message: "Bonjour {prénom}, merci pour ton aide !" } })
    assert.equal(sent.status(), 200)
    assert.equal((await sent.json()).sent, 2)
    const history = await db.targetedMessage.findFirstOrThrow({ where: { eventId, subject: "Formation — échec partiel" }, orderBy: { createdAt: "desc" } })
    let rows = await db.notificationOutbox.findMany({ where: { targetedMessageId: history.id } })
    for (let n = 0; n < 30 && !(rows.some(row => row.status === "sent") && rows.some(row => row.attempts === 1)); n++) {
      await page.waitForTimeout(500)
      rows = await db.notificationOutbox.findMany({ where: { targetedMessageId: history.id } })
    }
    assert.equal(rows.length, 2)
    const successful = rows.find(row => row.status === "sent")
    const failed = rows.find(row => row.status === "pending" && row.attempts === 1)
    assert(successful && failed)
    const transitions: { now: string; attempts: number; status: string }[] = []
    for (let n = 1; n < 6; n++) {
      const before = await db.notificationOutbox.findUniqueOrThrow({ where: { id: failed.id } })
      const now = new Date(Math.max(Date.now(), before.nextAttemptAt.getTime()) + 1)
      await deliverOutbox({ ids: [failed.id], now })
      const after: (typeof rows)[number] = await db.notificationOutbox.findUniqueOrThrow({ where: { id: failed.id } })
      assert.equal(after.attempts, n + 1)
      transitions.push({ now: now.toISOString(), attempts: after.attempts, status: after.status })
    }
    assert.equal((await db.notificationOutbox.findUniqueOrThrow({ where: { id: failed.id } })).status, "failed")
    await page.goto(`${base}/admin/events/${eventId}/message`)
    const article = page.getByRole("article").filter({ has: page.locator(`[id="msg-${history.id}"]`) })
    await article.getByRole("heading", { name: "Formation — échec partiel", exact: true }).waitFor()
    await article.locator("summary").click()
    assert((await article.innerText()).includes("Bonjour {prénom}, merci pour ton aide !"))
    await article.scrollIntoViewIfNeeded()
    await page.screenshot({ path: "videos/output/email-delivery-failures/partial-history-before.png" })
    fixture.rejected.delete(member.email!)
    const retryUrl = `${base}/api/admin/events/${eventId}/messages/${history.id}/resend-failed`
    const retryResponse = page.waitForResponse(response => response.url() === retryUrl && response.request().method() === "POST")
    await article.getByRole("button", { name: /^Renvoyer/ }).click()
    const retry = await retryResponse
    assert.equal(retry.status(), 200)
    assert.equal((await retry.json()).resent, 1)
    const usedButton = article.getByRole("button", { name: /^Remis en file/ })
    await usedButton.waitFor()
    assert.equal(await usedButton.getAttribute("aria-disabled"), "true")
    let repeatedUiRequests = 0
    const observe = (request: import("playwright").Request) => { if (request.url() === retryUrl && request.method() === "POST") repeatedUiRequests++ }
    page.on("request", observe)
    // Playwright correctly refuses locator.click on aria-disabled controls.
    // A physical pointer click tests the application's no-op guard without
    // removing aria-disabled or changing the page's event handlers.
    const bounds = await usedButton.boundingBox()
    assert(bounds)
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.waitForTimeout(300)
    page.off("request", observe)
    assert.equal(repeatedUiRequests, 0)
    const repeat = await page.request.post(retryUrl)
    assert.equal((await repeat.json()).resent, 0)
    let final = await db.notificationOutbox.findUniqueOrThrow({ where: { id: failed.id } })
    for (let n = 0; n < 30 && final.status !== "sent"; n++) { await page.waitForTimeout(500); final = await db.notificationOutbox.findUniqueOrThrow({ where: { id: failed.id } }) }
    assert.equal(final.status, "sent")
    const stillSuccessful = await db.notificationOutbox.findUniqueOrThrow({ where: { id: successful.id } })
    assert.equal(stillSuccessful.sentAt?.toISOString(), successful.sentAt?.toISOString())
    assert.equal(fixture.attempts.filter(attempt => !attempt.accepted).length, 6)
    assert.equal(fixture.attempts.filter(attempt => attempt.accepted).length, 2)
    await writeFile("videos/output/email-delivery-failures/partial-details.json", JSON.stringify({ checkedAt: new Date().toISOString(), historyId: history.id, actualCampaignRecipients: 2, actualSmtpAttempts: fixture.attempts, acceleratedWorkerClock: transitions, actualHistoryTextOpened: true, actualUiRetry: true, repeatedUiClickCreatedNoRequest: true, onlyFailedResent: 1, repeatedResend: 0, successfulDeliveryTimestampUnchanged: true, allFinallySent: true, scope: "Actual history UI and retry button plus application routes/SMTP/worker, not yet a narrated capture" }, null, 2))
    console.log("✓ Real two-person campaign: six SMTP failures for one recipient, other delivered once; retry only the failure, repeated retry sends nothing")
  } finally { await browser.close(); await db.$disconnect(); await fixture.close() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Partial delivery verification failed"); process.exitCode = 1 })
