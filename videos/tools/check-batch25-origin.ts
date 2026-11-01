// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Actual browser POSTs, never a forged successful response or an Origin override. */
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright"
import { launchVideoBrowser, videoRequestProxy } from "../lib/public-hosts"
import { verifyProductBuild } from "../lib/product-build"
import { passOperatorSecondFactor } from "../lib/operator-second-factor"
async function main() {
  const operator = process.argv[2] === "operator"
  assert(process.argv.length === (operator ? 3 : 2))
  const publicCapture = process.env.VIDEO_OPERATOR_PUBLIC === "1"
  const localBase = operator ? "http://localhost:43104" : "http://localhost:43102"
  const base = publicCapture ? "https://www.benevol.app" : localBase
  const slug = operator ? "platform-internal-administration" : "last-minute-changes"
  const product = await verifyProductBuild(localBase)
  const browser = await launchVideoBrowser(chromium, { headless: true, env: { ...process.env, LANG: "fr_CH.UTF-8", LC_ALL: "fr_CH.UTF-8" } }, localBase)
  try {
    const page = await browser.newPage({ ...(publicCapture ? { proxy: { server: videoRequestProxy(browser)! }, ignoreHTTPSErrors: true } : {}), locale: "fr-CH", timezoneId: "Europe/Zurich" })
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill(operator ? "video.operator.platform@example.org" : "video.last-minute.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    if (operator) await passOperatorSecondFactor(page)
    await page.waitForURL(/\/(admin\/(events|dashboard)|super-admin\/organizations)/)
    if (operator) {
      await page.goto(`${base}/super-admin/use-org/video-operator-org-a`)
      await page.getByRole("heading", { name: "Changer d'organisation", exact: true }).waitFor()
      await page.getByRole("button", { name: "Travailler dans Formation Opérateur Parc", exact: true }).waitFor()
      assert.equal((await page.request.get(`${base}/api/admin/events`)).status(), 409, "Opening confirmation must not switch context")
    }
    const pathname = operator ? "/api/super-admin/organizations" : "/api/admin/events/video-last-minute-event/message"
    // The operator route has no dry-run: an empty payload reaches validation (400), creates nothing.
    const payload = operator ? {} : { audience: { kind: "shift", shiftId: "video-last-minute-shift-1" }, subject: "Vérification", message: "Vérification sans envoi", dryRun: true }
    const sameOrigin = await page.evaluate(async ({ pathname, payload }) => {
      const response = await fetch(pathname, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      return { origin: location.origin, status: response.status, body: await response.json() }
    }, { pathname, payload })
    assert.equal(sameOrigin.status, operator ? 400 : 200)
    if (!operator) assert.equal(sameOrigin.body.recipients, 1)
    // Synthetic foreign page is fulfilled locally; Chromium itself sends the foreign Origin.
    await page.route("http://foreign.invalid/**", route => route.fulfill({ contentType: "text/html", body: `<form method="post" action="${base}${pathname}"><button>Test</button></form>` }))
    await page.goto("http://foreign.invalid/")
    const responsePromise = page.waitForResponse(r => r.url() === `${base}${pathname}` && r.request().method() === "POST")
    await page.getByRole("button", { name: "Test", exact: true }).click()
    const response = await responsePromise
    const foreignOrigin = { origin: response.request().headers().origin, status: response.status(), body: await response.json() }
    assert.equal(foreignOrigin.origin, "http://foreign.invalid")
    assert.equal(foreignOrigin.status, 403)
    assert.match(foreignOrigin.body.error, /ne vient pas d'une page de ce site/)
    const dir = `videos/output/${slug}/review`
    await mkdir(dir, { recursive: true })
    await writeFile(`${dir}/${publicCapture ? "public-origin-check" : "origin-check"}.json`, JSON.stringify({ product, sameOrigin, foreignOrigin, noMutation: true, note: "Unmodified real browser Origins; admin dry-run, operator invalid empty payload" }, null, 2))
    console.log(`${slug}: browser same-origin ${sameOrigin.status}, foreign Origin ${foreignOrigin.status}; no mutation`)
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
