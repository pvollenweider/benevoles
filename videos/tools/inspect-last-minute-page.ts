// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { chromium } from "playwright"
import { launchVideoBrowser } from "../lib/public-hosts"
import { PrismaClient } from "../../src/generated/prisma/client"
import { pgAdapter } from "../../src/lib/prisma-adapter"
import { registrationToken } from "../../src/lib/token-vault"
async function main() {
  assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43102")
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(url.pathname === "/benevoles_video" && url.port === "45433" && ["localhost", "127.0.0.1"].includes(url.hostname))
  const db = new PrismaClient({ adapter: pgAdapter(process.env.DATABASE_URL) })
  const browser = await launchVideoBrowser(chromium)
  try {
    const row = await db.registration.findUniqueOrThrow({ where: { id: "video-last-minute-registration-0" } })
    assert.equal(row.eventId, "video-last-minute-event")
    const page = await browser.newPage()
    const token = registrationToken.reveal(row)
    assert(token)
    const counters = await db.rateLimit.findMany({ where: { key: { in: ["reg-token-read:unknown", "reg-token-read:127.0.0.1", "reg-token-read:::1"] } }, select: { key: true, count: true, resetAt: true } })
    console.log(JSON.stringify({ localReadCounters: counters }))
    const response = await page.goto(`http://localhost:43102/my/${token}`)
    await page.waitForTimeout(2000)
    console.log(JSON.stringify({ httpStatus: response?.status(), headings: await page.getByRole("heading").allTextContents(), buttons: await page.getByRole("button").allTextContents(), body: (await page.locator("body").innerText()).replaceAll(token, "[personal link]").slice(0, 3000) }))
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Local page inspection failed"); process.exitCode = 1 })
