// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { registrationToken } from "../../src/lib/token-vault"
import { mkdir, writeFile } from "node:fs/promises"

async function main() {
  const base = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Isolated local video environment required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch()
  try {
    const eventId = "video-last-minute-event"
    const event = await db.event.findUniqueOrThrow({ where: { id: eventId } })
    if (event.organizationId !== "video-last-minute") throw new Error("Wrong fixture scope")
    const page = await browser.newPage()
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill("video.last-minute.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    const reg = (n: number) => db.registration.findUniqueOrThrow({ where: { id: `video-last-minute-registration-${n}` } })
    const aline = await reg(0), nicolas = await reg(1), attendance = (await reg(5)).checkedInAt
    if (aline.status !== "active" || nicolas.status !== "waiting" || !attendance) throw new Error("Reset the dedicated fixture before verification")
    const withdrawal = await page.request.delete(`${base}/api/public/registrations/${encodeURIComponent(registrationToken.reveal(aline))}`)
    if (!withdrawal.ok() || (await reg(0)).status !== "cancelled" || (await reg(1)).status !== "offered") throw new Error("Actual withdrawal did not produce the expected offer")
    const confirmation = await page.request.post(`${base}/api/public/waitlist/${encodeURIComponent(registrationToken.reveal(nicolas))}/confirm`)
    if (!confirmation.ok() || (await reg(1)).status !== "active") throw new Error("Actual offered registration was not confirmed")
    const audience = { kind: "shift", shiftId: "video-last-minute-shift-1" }
    const payload = { audience, subject: "Un coup de main pour la logistique ?", message: "Il reste une place de 12h à 14h. Merci de nous répondre avant de modifier votre planning." }
    const preview = await page.request.post(`${base}/api/admin/events/${eventId}/message`, { data: { ...payload, dryRun: true } })
    if (!preview.ok() || (await preview.json()).recipients !== 1) throw new Error("Targeted preview recipient differs")
    const sent = await page.request.post(`${base}/api/admin/events/${eventId}/message`, { data: payload })
    if (!sent.ok() || (await sent.json()).sent !== 1) throw new Error("Actual targeted message failed")
    const zoe = await db.volunteer.findUniqueOrThrow({ where: { id: "video-last-minute-person-2" } })
    const added = await page.request.post(`${base}/api/admin/registrations`, { data: { eventId, shiftId: "video-last-minute-shift-1", firstName: zoe.firstName, lastName: zoe.lastName, email: zoe.email } })
    if (!added.ok() || await db.registration.count({ where: { shiftId: "video-last-minute-shift-1", status: "active" } }) !== 2) throw new Error("Actual manual replacement did not fill the shift")
    const changed = await page.request.patch(`${base}/api/admin/shifts/video-last-minute-shift-2`, { data: { startTime: "14:30", endTime: "16:30" } })
    if (!changed.ok() || (await changed.json()).notified !== 1) throw new Error("Changed schedule must notify only its active registration")
    const cancelled = await page.request.delete(`${base}/api/admin/shifts/video-last-minute-shift-3`)
    if (!cancelled.ok() || (await reg(5)).status !== "cancelled" || (await reg(6)).status !== "cancelled" || (await reg(5)).checkedInAt?.getTime() !== attendance.getTime()) throw new Error("Cancellation statuses or retained attendance differ")
    const logs = await db.eventLog.findMany({ where: { eventId } })
    if (!logs.some(log => log.action === "registration.waitlist_confirmed" && log.causedByLogId) || !logs.some(log => log.action === "shift.cancelled")) throw new Error("Actual causal journal entries missing")
    const directory = "videos/output/last-minute-changes"
    await mkdir(directory, { recursive: true })
    await writeFile(`${directory}/functional-checks.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scope: "actual local routes and database only; inbox and audiovisual review still required", withdrawalPromotesOffer: true, offerConfirmed: true, targetedRecipients: 1, manualReplacementFillsShift: true, changedScheduleNotified: 1, cancelledActiveAndRequested: true, priorAttendancePreserved: true, actualCausalJournal: true, journalEntries: logs.length, fixtureMustBeResetBeforeCapture: true }, null, 2))
    console.log("✓ Actual last-minute actions verified; inbox and audiovisual checks remain; reset fixture before capture")
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Last-minute verification failed"); process.exitCode = 1 })
