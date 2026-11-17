import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * The pages a personal link opens (sign-up confirmation, waitlist offer, « Je ne peux pas ») count
 * unknown links per connection like their APIs: after 20, they say « Trop de tentatives » for up
 * to an hour, whatever the link. A dedicated address keeps the other specs unblocked.
 */

const ip = `10.83.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
const stamp = Date.now()

async function expectNotice(page: Page, path: string, title: RegExp, label: string) {
  const response = await page.goto(path)
  expect(response?.status(), label).toBe(200)
  await expect(page).toHaveTitle(title)
  await expect(page.getByRole("heading", { level: 1, name: "Trop de tentatives" })).toBeVisible()
  await expect(page.getByRole("heading")).toHaveCount(1)
  await expect(page.getByText("Ton lien n'a pas été vérifié et rien n'a été modifié.", { exact: false })).toBeVisible()
  expect(await seriousViolations(page), `${label}, 1280 px`).toEqual([])

  await page.setViewportSize({ width: 320, height: 640 })
  await expect(page.getByRole("heading", { level: 1, name: "Trop de tentatives" })).toBeVisible()
  expect(await seriousViolations(page), `${label}, 320 px`).toEqual([])
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `${label}: no horizontal scroll at 320 px`).toBeLessThanOrEqual(0)
  await page.setViewportSize({ width: 1280, height: 800 })
}

test("after 20 unknown links, the three personal-link pages pause for that connection", async ({ page, context }) => {
  test.setTimeout(120_000)
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ip })
  await page.setViewportSize({ width: 1280, height: 800 })

  for (let i = 0; i < 20; i++) {
    const res = await page.request.get(`/waitlist/e2eunknown${stamp}x${i}/confirm`, { headers: { "x-forwarded-for": ip } })
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain("Lien expiré ou invalide")
  }

  await expectNotice(page, `/waitlist/e2eoffer${stamp}/confirm`, /^Trop de tentatives$/, "waitlist offer")
  await expectNotice(page, `/confirmation/e2econfirm${stamp}`, /^Trop de tentatives$/, "sign-up confirmation")
  await expectNotice(page, `/ne-peux-pas/invitation/e2einvite${stamp}/e2eshift${stamp}`, /^Trop de tentatives — /, "« Je ne peux pas »")

  // Another connection still opens its links normally.
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.84.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` })
  await page.goto(`/waitlist/e2eother${stamp}/confirm`)
  await expect(page).toHaveTitle(/^Lien expiré ou invalide$/)
})
