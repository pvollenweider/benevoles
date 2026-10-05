import { test, expect, type Page } from "@playwright/test"

/**
 * Contextual help (#568): « Aide : <section> » under a main admin page's title opens the admin
 * guide in a new tab, at the section that explains the page. The anchors of the guide's headings
 * are checked against GUIDE_ADMIN.md by src/lib/__tests__/help-links.test.ts; this follows a link
 * for real, with the mouse and with the keyboard.
 */
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function newEvent(page: Page): Promise<string> {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
  const res = await page.request.post("/api/admin/events", {
    data: { title: `E2E Aide ${Date.now()}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const event: { id: string } = await res.json()
  return event.id
}

test("the shifts page's help link opens the guide at « Configurer les créneaux » in a new tab", async ({ page }) => {
  const id = await newEvent(page)
  await page.goto(`/admin/events/${id}/shifts`)
  const link = page.getByRole("link", { name: "Aide : Configurer les créneaux (ouvre dans un nouvel onglet)" })
  await expect(link).toHaveAttribute("href", "/doc/admin#configurer-les-creneaux")
  await expect(link).toHaveAttribute("target", "_blank")

  const [guide] = await Promise.all([page.context().waitForEvent("page"), link.click()])
  await guide.waitForLoadState()
  expect(new URL(guide.url()).pathname + new URL(guide.url()).hash).toBe("/doc/admin#configurer-les-creneaux")
  const heading = guide.getByRole("heading", { level: 2, name: "Configurer les créneaux" })
  await expect(heading).toHaveAttribute("id", "configurer-les-creneaux")
  await expect(heading).toBeInViewport()
  // The admin page stays where it was.
  await expect(page).toHaveURL(new RegExp(`/admin/events/${id}/shifts$`))
})

test("a help link works from the keyboard, and lands on a third-level section", async ({ page }) => {
  const id = await newEvent(page)
  await page.goto(`/admin/events/${id}/day-of`)
  const link = page.getByRole("link", { name: "Aide : Présences le jour J (ouvre dans un nouvel onglet)" })
  await link.focus()
  await expect(link).toBeFocused()
  const [guide] = await Promise.all([page.context().waitForEvent("page"), page.keyboard.press("Enter")])
  await guide.waitForLoadState()
  expect(new URL(guide.url()).hash).toBe("#presences-le-jour-j")
  await expect(guide.getByRole("heading", { level: 3, name: "Présences le jour J" })).toBeInViewport()
})

test("the guide says how to send feedback: email first, GitHub optional", async ({ page }) => {
  await page.goto("/doc/admin")
  await page.getByRole("link", { name: "Signaler un problème ou proposer une amélioration" }).click()
  await expect(page).toHaveURL(/#signaler-un-probleme-ou-proposer-une-amelioration$/)
  const heading = page.getByRole("heading", { level: 3, name: "Signaler un problème ou proposer une amélioration" })
  await expect(heading).toBeInViewport()
  await expect(page.getByRole("link", { name: "contact@benevol.app" })).toHaveAttribute("href", "mailto:contact@benevol.app")
  await expect(page.getByRole("link", { name: "le suivi public sur GitHub" })).toHaveAttribute("href", "https://github.com/pvollenweider/benevoles/issues")
})
