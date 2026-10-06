import assert from "node:assert/strict"
import { chromium } from "playwright"
async function main() {
  assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43102")
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ locale: "fr-CH" })
    page.on("pageerror", error => console.log(`Browser error: ${error.message.slice(0, 200)}`))
    await page.goto("http://localhost:43102/admin/login")
    await page.getByLabel("Email").fill("video.navigation.owner@example.org")
    await page.getByLabel("Mot de passe").fill(process.env.ORG_ADMIN_PASSWORD!)
    await page.waitForTimeout(1500)
    console.log(JSON.stringify({ loginButtonEnabled: await page.getByRole("button", { name: "Se connecter" }).isEnabled(), alerts: await page.getByRole("alert").allTextContents() }))
    await page.getByRole("button", { name: "Se connecter" }).click()
    await page.waitForURL(/\/admin\/(events|dashboard)/)
    for (const route of ["/admin/events", "/admin/events/video-navigation-current-event-0", "/admin/search?q=buvette"]) {
      await page.goto(`http://localhost:43102${route}`)
      await page.waitForLoadState("networkidle")
      console.log(JSON.stringify({ route, headings: await page.getByRole("heading").allTextContents(), links: await page.getByRole("link").allTextContents(), buttons: await page.getByRole("button").allTextContents() }))
      if (route.includes("search")) {
        console.log(JSON.stringify({ searchInputs: await page.locator("input").evaluateAll(inputs => inputs.map(input => ({ type: input.getAttribute("type"), label: input.getAttribute("aria-label"), placeholder: input.getAttribute("placeholder") }))) }))
        console.log(JSON.stringify({ resultHref: await page.getByRole("link", { name: /Buvette.*village/ }).getAttribute("href"), resultTarget: await page.getByRole("link", { name: /Buvette.*village/ }).getAttribute("target") }))
        await page.getByRole("link", { name: /Buvette.*village/ }).click()
        await page.waitForLoadState("networkidle")
        console.log(JSON.stringify({ searchDestination: new URL(page.url()).pathname, headings: await page.getByRole("heading").allTextContents() }))
      }
    }
  } finally { await browser.close() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Inspection failed"); process.exitCode = 1 })
