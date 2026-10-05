// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Local preflight evidence; not a recording or an audiovisual validation. */
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { selectRecipients, selectInvitedWithoutShift, type Audience } from "../../src/lib/targeted-message"
import { mkdir, writeFile } from "node:fs/promises"

async function main() {
  const base = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Video preflight requires local host and isolated video DB")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill(process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    const event = await db.event.findFirstOrThrow({ where: { organizationId: "default", slug: "fete-du-village" } })
    const registrations = await db.registration.findMany({ where: { eventId: event.id }, include: { volunteer: true, shift: true } })
    const invites = await db.memberInvite.findMany({ where: { eventId: event.id }, include: { volunteer: true } })
    const shift = await db.shift.findFirstOrThrow({ where: { eventId: event.id, roleName: "Buvette", status: "open" }, orderBy: [{ date: "asc" }, { startTime: "asc" }] })
    const historyBefore = await db.targetedMessage.count({ where: { eventId: event.id } })
    const outboxBefore = await db.notificationOutbox.count({ where: { organizationId: "default" } })
    const audiences: Audience[] = [{ kind: "event" }, { kind: "role", roleName: "Buvette" }, { kind: "shift", shiftId: shift.id }, { kind: "waitlist" }, { kind: "invited_without_shift" }]
    const results = []
    const url = `${base}/api/admin/events/${event.id}/message`
    for (const audience of audiences) {
      const expected = audience.kind === "invited_without_shift" ? selectInvitedWithoutShift(invites, registrations).length : selectRecipients(registrations, audience).length
      const response = await page.request.post(url, { data: { audience, subject: "Bonjour {prénom}", message: "Merci pour ton aide à {événement} !", dryRun: true } })
      if (!response.ok()) throw new Error(`Dry run ${audience.kind}: HTTP ${response.status()}`)
      const result = await response.json()
      if (expected < 1 || result.recipients !== expected || !result.preview?.html || result.preview.subject.includes("{prénom}")) throw new Error(`Incomplete audience or unrendered preview: ${audience.kind}`)
      results.push({ audience: audience.kind, recipients: result.recipients, pushDevices: result.pushDevices, personalizedSubject: true })
    }
    for (const [message, audience, expected] of [
      ["Bonjour {lieu}", { kind: "event" }, "Variable inconnue"],
      ["Rendez-vous {créneau}", { kind: "event" }, "créneau"],
    ] as const) {
      // This deliberately omits dryRun: validation must block a real send too.
      const response = await page.request.post(url, { data: { audience, subject: "Test de validation", message } })
      const result = await response.json()
      if (response.status() !== 400 || !result.error?.includes(expected)) throw new Error("Invalid variables did not block send")
    }
    const historyAfter = await db.targetedMessage.count({ where: { eventId: event.id } })
    const outboxAfter = await db.notificationOutbox.count({ where: { organizationId: "default" } })
    if (historyAfter !== historyBefore || outboxAfter !== outboxBefore) throw new Error("Previews or invalid variables created an actual send")
    const report = { checkedAt: new Date().toISOString(), scope: "local API preflight, not a video or delivery check", audiences: results, invalidVariablesBlocked: true, previewsAndValidationCreatedNoSend: true, historyBefore, historyAfter, outboxBefore, outboxAfter }
    await mkdir("videos/output/targeted-messages", { recursive: true })
    await writeFile("videos/output/targeted-messages/preflight.json", JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await browser.close()
    await db.$disconnect()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
