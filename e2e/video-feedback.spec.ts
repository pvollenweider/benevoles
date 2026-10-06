import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"

/**
 * « Cette vidéo vous a-t-elle été utile ? » (#646): below the player of /videos/[id], answered
 * with real buttons, stored anonymously, counted per video and revision for the super admin.
 * VIDEO_MEDIA_BASE_URL isn't set in e2e: the question shows under the « bientôt disponible »
 * fallback, which is the point — it doesn't depend on watching to the end.
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

function feedbackRegion(page: Page, question = "Cette vidéo vous a-t-elle été utile ?") {
  return page.getByRole("group", { name: question })
}

test("answers « Oui » with the keyboard: thank-you focused, then « déjà répondu » after a reload", async ({ page }) => {
  await page.goto("/videos/EVENT_CREATE_BLANK")
  const region = feedbackRegion(page)
  const yes = region.getByRole("button", { name: "Oui" })
  await waitForHydration(yes)
  await expect(region.getByRole("button", { name: "Non" })).toBeVisible()

  const request = page.waitForRequest((r) => r.url().endsWith("/api/public/video-feedback") && r.method() === "POST")
  await yes.focus()
  await page.keyboard.press("Enter")
  expect((await request).postDataJSON()).toEqual({ videoId: "EVENT_CREATE_BLANK", revision: expect.any(Number), useful: true, context: "masterclass" })

  const thanks = region.getByText("Merci pour votre réponse.", { exact: true }).and(page.locator("p"))
  await expect(thanks).toBeFocused()
  await expect(region.getByRole("button")).toHaveCount(0)
  expect.soft(await seriousViolations(page)).toEqual([])

  await page.reload()
  await expect(feedbackRegion(page).getByText("Vous avez déjà répondu pour cette vidéo. Merci.")).toBeVisible()
  await expect(feedbackRegion(page).getByRole("button")).toHaveCount(0)
})

test("says « tu » on a volunteer-only video", async ({ page }) => {
  await page.goto("/videos/VOLUNTEER_REGISTER")
  await expect(feedbackRegion(page, "Cette vidéo t'a-t-elle été utile ?").getByRole("button", { name: "Non" })).toBeVisible()
})

test("counts a video opened from the documentation (?from=doc), kept across the slug redirect", async ({ page }) => {
  await page.goto("/videos/volunteer-calendar?from=doc")
  await expect(page).toHaveURL(/\/videos\/VOLUNTEER_CALENDAR\?from=doc$/)
  const no = feedbackRegion(page, "Cette vidéo t'a-t-elle été utile ?").getByRole("button", { name: "Non" })
  await waitForHydration(no)
  const request = page.waitForRequest((r) => r.url().endsWith("/api/public/video-feedback") && r.method() === "POST")
  await no.click()
  expect((await request).postDataJSON()).toMatchObject({ videoId: "VOLUNTEER_CALENDAR", useful: false, context: "documentation" })
  await expect(page.getByText("Merci pour ta réponse.", { exact: true }).and(page.locator("p"))).toBeVisible()
})

test("the API refuses an unknown video and a stale revision", async ({ request }) => {
  const post = (data: object) => request.post("/api/public/video-feedback", { data })
  expect((await post({ videoId: "NOT_A_VIDEO", revision: 1, useful: true, context: "masterclass" })).status()).toBe(404)
  expect((await post({ videoId: "EVENT_CREATE_BLANK", revision: 999, useful: true, context: "masterclass" })).status()).toBe(409)
  expect((await post({ videoId: "EVENT_CREATE_BLANK", revision: 2, useful: "oui", context: "masterclass" })).status()).toBe(400)
})

test("the super admin sees Oui, Non and total per video and revision", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events|\/super-admin\/organizations/)

  const cells = async () => {
    await page.goto("/super-admin/video-feedback")
    const row = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /ORG_FIRST_STEPS/ }) }).filter({ hasText: "actuelle" })
    await expect(row).toHaveCount(1)
    const texts = await row.getByRole("cell").allInnerTexts()
    // Révision, Oui, Non, Total.
    return { revision: Number.parseInt(texts[0], 10), yes: Number(texts[1]), no: Number(texts[2]), total: Number(texts[3]) }
  }

  const before = await cells()
  const res = await page.request.post("/api/public/video-feedback", { data: { videoId: "ORG_FIRST_STEPS", revision: before.revision, useful: true, context: "masterclass" } })
  expect(res.status()).toBe(201)
  const after = await cells()
  expect(after).toEqual({ ...before, yes: before.yes + 1, total: before.total + 1 })
})
