// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Actual local mutations, not synthetic EventLog rows; not audiovisual proof. */
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { mkdir, writeFile } from "node:fs/promises"
import { registrationToken } from "../../src/lib/token-vault"

async function main() {
  const base = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Local video environment required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch()
  try {
    const event = await db.event.findFirstOrThrow({ where: { organizationId: "default", slug: "atelier-journal" }, include: { shifts: true, registrations: true } })
    if (await db.eventLog.count({ where: { eventId: event.id } })) throw new Error("Fresh event-activity-log seed required; refusing duplicate history")
    const shift = event.shifts[0]
    const active = event.registrations.find(r => r.status === "active")!
    const waiting = event.registrations.find(r => r.status === "waiting")!
    if (!shift?.waitlistEnabled || !active || !waiting) throw new Error("Occupied shift and real waitlist required")
    const page = await browser.newPage()
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill(process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    const initial = await page.request.post(`${base}/api/admin/events/${event.id}/log/baseline`)
    if (!initial.ok()) throw new Error(`Initial state HTTP ${initial.status()}`)
    const initialCount = (await initial.json()).created
    const pageCreated = await page.request.post(`${base}/api/admin/events/${event.id}/pages`, { data: { title: "Consignes d'accueil", content: "TEXTE_FICTIF_NON_RECOPIE_DANS_LE_JOURNAL" } })
    if (!pageCreated.ok()) throw new Error("Actual page creation failed")
    const pageId = (await pageCreated.json()).id as string
    const pageUpdated = await page.request.patch(`${base}/api/admin/events/${event.id}/pages/${pageId}`, { data: { content: "AUTRE_TEXTE_FICTIF_NON_RECOPIE_DANS_LE_JOURNAL" } })
    if (!pageUpdated.ok()) throw new Error("Actual page update failed")
    const pageLogs = await db.eventLog.findMany({ where: { eventId: event.id, entityId: pageId }, select: { changes: true } })
    if (pageLogs.length !== 2 || JSON.stringify(pageLogs).includes("TEXTE_FICTIF_NON_RECOPIE")) throw new Error("Page content leaked into its journal")
    // Actual capacity edits provide enough entries to exercise the real pagination.
    // Keep exactly one place at the end, so withdrawal must offer it to the waiter.
    for (let index = 0; index < 56; index++) {
      const capacity = index % 2 === 0 ? 2 : 1
      const response = await page.request.patch(`${base}/api/admin/shifts/${shift.id}`, { data: { capacity } })
      if (!response.ok()) throw new Error(`Actual capacity edit ${index + 1}: HTTP ${response.status()}`)
    }
    const list = await page.request.get(`${base}/api/admin/events/${event.id}/log`)
    if (!list.ok()) throw new Error(`Journal HTTP ${list.status()}`)
    const firstPage = await list.json()
    if (firstPage.entries?.length !== 50 || !firstPage.nextCursor) throw new Error("Actual journal pagination not demonstrated")
    const next = await page.request.get(`${base}/api/admin/events/${event.id}/log?cursor=${encodeURIComponent(firstPage.nextCursor)}`)
    if (!next.ok() || !(await next.json()).entries?.length) throw new Error("Actual second journal page missing")
    const cancelled = await page.request.delete(`${base}/api/public/registrations/${encodeURIComponent(registrationToken.reveal(active))}`)
    if (!cancelled.ok()) throw new Error(`Withdrawal HTTP ${cancelled.status()}`)
    const root = await db.eventLog.findFirstOrThrow({ where: { eventId: event.id, entityId: active.id, action: "registration.cancelled" } })
    const consequences = await db.eventLog.findMany({ where: { eventId: event.id, causedByLogId: root.id } })
    const offered = await db.registration.findUniqueOrThrow({ where: { id: waiting.id } })
    if (offered.status !== "offered" || !offered.waitingExpiresAt || !consequences.some(log => log.entityId === waiting.id)) throw new Error("Actual withdrawal did not produce a linked waitlist offer")
    let received = false
    for (let attempt = 0; attempt < 40; attempt++) {
      const response = await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")
      if (!response.ok()) throw new Error("Local mailbox unavailable")
      const messages = (await response.json()).messages as { ID: string; To: { Address: string }[]; Subject: string }[]
      for (const message of messages.filter(m => m.To.some(to => to.Address === "video.event-log.1@example.org"))) {
        const detail = await page.request.get(`http://localhost:48026/api/v1/message/${message.ID}`)
        if (detail.ok()) {
          const content = await detail.json() as { Text?: string; HTML?: string }
          if (message.Subject.includes(event.title) && (content.HTML?.includes(event.title) || content.Text?.includes(event.title))) received = true
        }
      }
      if (received) break
      await page.waitForTimeout(250)
    }
    if (!received) throw new Error("Actual local offer email not received")
    const baselineWitness = await db.event.findFirstOrThrow({ where: { organizationId: "default", slug: "atelier-journal-etat-initial" } })
    if (await db.eventLog.count({ where: { eventId: baselineWitness.id } })) throw new Error("Baseline witness must remain untouched for the film")
    const report = {
      preparedAt: new Date().toISOString(), scope: "actual local routes and database/mailbox assertions; not audiovisual validation",
      eventId: event.id, shiftId: shift.id, baselineWitnessId: baselineWitness.id,
      initialCount, actualCapacityEdits: 56, firstPageCount: 50, secondPageVerified: true,
      rootLogId: root.id, consequenceLogIds: consequences.map(log => log.id), offeredRegistrationId: offered.id,
      causalLinkVerified: true, offerEmailReceived: true, baselineWitnessUntouched: true,
      volunteerActorVerified: root.actorType === "volunteer", pageId, pageContentNotCopied: true,
    }
    await mkdir("videos/output/event-activity-log", { recursive: true })
    await writeFile("videos/output/event-activity-log/preparation.json", JSON.stringify(report, null, 2))
    console.log("✓ Actual journal pagination, replay history and withdrawal→waitlist offer→local email; baseline witness untouched")
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Event-log preparation failed"); process.exitCode = 1 })
