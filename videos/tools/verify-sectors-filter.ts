// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Read-only factual countercheck; never claims that browser chrome was filmed. */
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright"
import { launchVideoBrowser, videoRequestProxy, PUBLIC_APP_URL } from "../lib/public-hosts"
import { verifyProductBuild } from "../lib/product-build"

async function main() {
  assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43102")
  const product = await verifyProductBuild(process.env.VIDEO_BASE_URL)
  const browser = await launchVideoBrowser(chromium, { env: { ...process.env, LANG: "fr_CH.UTF-8", LC_ALL: "fr_CH.UTF-8" } })
  try {
    const page = await browser.newPage({ proxy: { server: videoRequestProxy(browser)! }, ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 }, locale: "fr-CH", timezoneId: "Europe/Zurich" })
    await page.goto(`${PUBLIC_APP_URL}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill("video.beta.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/dashboard/)
    await page.goto(`${PUBLIC_APP_URL}/admin/events/video-beta-event/registrations`)
    const field = page.getByLabel("Secteur", { exact: true })
    await field.selectOption({ label: "Parking" })
    const sectorId = await field.inputValue()
    assert(sectorId)
    await page.waitForURL(url => url.searchParams.get("secteur") === sectorId)
    const actualUrl = page.url()
    await page.goto(actualUrl)
    assert.equal(await field.inputValue(), sectorId)
    const text = await page.locator("body").innerText()
    assert(text.includes("5 inscriptions actives"))
    const directory = "videos/output/sectors/review"
    await mkdir(directory, { recursive: true })
    await page.screenshot({ path: `${directory}/independent-filter-reopened.png` })
    await writeFile(`${directory}/filter-url-countercheck.json`, JSON.stringify({ checkedAt: new Date().toISOString(), product, actualUrl, selectedSector: "Parking", sectorId, selectedAfterReopening: true, actualCount: 5, browserChromeFilmed: false, note: "Independent read-only check of the explanatory URL statement. The final video shows the filter and persistence; it does not promise to display browser chrome. Raw AV observation remains preserved." }, null, 2) + "\n")
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
