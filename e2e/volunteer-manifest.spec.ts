import { test, expect } from "@playwright/test"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "./helpers/public-signup"

/**
 * The personal page « Mes inscriptions » is installable (#593): it links a web app manifest, served
 * by the app (not rewritten to the 404 page by the proxy), valid, with its icons, and without the
 * volunteer's token in it. No other page links it.
 */

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Manifeste ${Date.now()}`, [{ label: "Bar", startTime: "10:00", endTime: "12:00", capacity: 5 }])
})

test("the personal page links a valid, token-free manifest; the home page links none", async ({ page, request }) => {
  test.setTimeout(90_000)
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  const secret = await publicSignUp(page, event, event.shifts.map((s) => s.id))
  await page.goto(`/my/${secret}`)
  await expect(page.getByRole("heading", { level: 1, name: "Mes inscriptions" })).toBeVisible()

  const href = await page.locator('link[rel="manifest"]').getAttribute("href")
  expect(href).toBe("/my/manifest.webmanifest")
  expect(href).not.toContain(secret)

  const res = await request.get(href!)
  expect(res.status()).toBe(200)
  expect(res.headers()["content-type"]).toMatch(/^application\/manifest\+json/)
  const body = await res.text()
  expect(body).not.toContain(secret)
  const manifest = JSON.parse(body) as { name: string; display: string; scope: string; start_url?: string; icons: { src: string; sizes: string }[] }
  expect(manifest).toMatchObject({ name: "Mes inscriptions", display: "standalone", scope: "/my/" })
  // No start address: the installed app opens the page it was installed from, the volunteer's own.
  expect(manifest.start_url).toBeUndefined()
  for (const icon of manifest.icons) {
    const png = await request.get(icon.src)
    expect(png.status(), icon.src).toBe(200)
    expect(png.headers()["content-type"]).toBe("image/png")
  }

  await page.goto("/")
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0)
})
