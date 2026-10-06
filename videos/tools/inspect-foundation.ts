import assert from "node:assert/strict"
import { chromium } from "playwright"
async function main() {
  assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43102")
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ locale: "fr-CH" })
    await page.goto("http://localhost:43102/rencontre-0?org=formation-charter")
    await page.waitForLoadState("networkidle")
    console.log(JSON.stringify({ publicHeadings: await page.getByRole("heading").allTextContents(), publicButtons: await page.getByRole("button").allTextContents(), publicBody: (await page.locator("body").innerText()).slice(0, 1600) }))
    await page.goto("http://localhost:43102/rencontre-0?org=formation-pages")
    await page.waitForLoadState("networkidle")
    const practical = page.getByRole("link", { name: "Ce qu’il faut apporter", exact: true })
    if (await practical.count()) {
      const href = await practical.getAttribute("href")
      console.log(JSON.stringify({ practicalHref: href, practicalTarget: await practical.getAttribute("target") }))
      assert(href?.startsWith("/"))
      await page.goto(`http://localhost:43102${href}`)
      await page.waitForLoadState("networkidle")
      console.log(JSON.stringify({ practicalHeadings: await page.getByRole("heading").allTextContents(), practicalBody: (await page.locator("body").innerText()).slice(0, 1600) }))
    }
    await page.goto("http://localhost:43102/admin/login")
    await page.getByLabel("Email").fill("video.milestones.owner@example.org")
    await page.getByLabel("Mot de passe").fill(process.env.ORG_ADMIN_PASSWORD!)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await page.waitForURL(/\/admin\/(events|dashboard)/)
    await page.getByRole("link", { name: "Tableau de bord", exact: true }).click()
    await page.waitForLoadState("networkidle")
    console.log(JSON.stringify({ dashboardHeadings: await page.getByRole("heading").allTextContents(), dashboardBody: (await page.locator("body").innerText()).slice(0, 3500) }))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Foundation inspection failed"); process.exitCode = 1 })
