// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { chromium } from "playwright"
async function main() {
  assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43104")
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/benevoles_video_operator")
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto("http://localhost:43104/admin/login")
    await page.getByLabel("Email", { exact: true }).fill("video.operator.platform@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/super-admin\/organizations/)
    const cookies = await page.context().cookies()
    console.log("Original session cookie names:", cookies.map(cookie => cookie.name))
    await page.context().clearCookies()
    await page.goto("http://localhost:43104/admin/login")
    await page.getByLabel("Email", { exact: true }).fill("video.operator.disposable.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill("Formation-Operator-2026!")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    await page.context().clearCookies(); await page.context().addCookies(cookies)
    const session = await (await page.request.get("http://localhost:43104/api/auth/session")).json()
    console.log("Restored role/id only:", session.user?.role, session.user?.id)
    await page.goto("http://localhost:43104/super-admin/organizations/formation-operateur-jetable")
    console.log("Restored path:", new URL(page.url()).pathname)
    if (new URL(page.url()).pathname !== "/admin/login") console.log("Disposable row:", await page.getByRole("row").filter({ hasText: "video.operator.disposable.owner@example.org" }).innerText())
  } finally { await browser.close() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Session inspection failed"); process.exitCode = 1 })
