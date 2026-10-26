import { test, expect, type Page } from "@playwright/test"

/**
 * Contextual help (#568): « Aide : <section> » under a main admin page's title opens, in a new tab,
 * the page of the documentation that explains the screen (#649: a unit of content/guide/, at a heading when
 * the route names one). The units and headings are checked by src/lib/__tests__/help-links.test.ts;
 * this follows a link for real, with the mouse and with the keyboard.
 */
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function newEvent(page: Page): Promise<string> {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)
  const res = await page.request.post("/api/admin/events", {
    data: { title: `E2E Aide ${Date.now()}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const event: { id: string } = await res.json()
  return event.id
}

test("the shifts page's help link opens « Configurer les créneaux » in a new tab", async ({ page }) => {
  const id = await newEvent(page)
  await page.goto(`/admin/events/${id}/shifts`)
  const link = page.getByRole("link", { name: "Aide\u00a0: Configurer les créneaux (ouvre dans un nouvel onglet)" })
  await expect(link).toHaveAttribute("href", "/doc/configurer-les-creneaux")
  await expect(link).toHaveAttribute("target", "_blank")

  const [guide] = await Promise.all([page.context().waitForEvent("page"), link.click()])
  await guide.waitForLoadState()
  expect(new URL(guide.url()).pathname).toBe("/doc/configurer-les-creneaux")
  await expect(guide.getByRole("heading", { level: 1 })).toHaveText("Configurer les créneaux")
  // The admin page stays where it was.
  await expect(page).toHaveURL(new RegExp(`/admin/events/${id}/shifts$`))
})

test("a help link works from the keyboard", async ({ page }) => {
  const id = await newEvent(page)
  await page.goto(`/admin/events/${id}/day-of`)
  const link = page.getByRole("link", { name: "Aide\u00a0: Présences le jour J (ouvre dans un nouvel onglet)" })
  await link.focus()
  await expect(link).toBeFocused()
  const [guide] = await Promise.all([page.context().waitForEvent("page"), page.keyboard.press("Enter")])
  await guide.waitForLoadState()
  expect(new URL(guide.url()).pathname).toBe("/doc/presences-le-jour-j")
  await expect(guide.getByRole("heading", { level: 1 })).toHaveText("Présences le jour J")
})

test("the edit page's help link lands on « Modifier un événement » within the unit", async ({ page }) => {
  const id = await newEvent(page)
  await page.goto(`/admin/events/${id}/edit`)
  const link = page.getByRole("link", { name: "Aide\u00a0: Modifier un événement (ouvre dans un nouvel onglet)" })
  await expect(link).toHaveAttribute("href", "/doc/creer-un-evenement#modifier-un-evenement")
  const [guide] = await Promise.all([page.context().waitForEvent("page"), link.click()])
  await guide.waitForLoadState()
  expect(new URL(guide.url()).pathname + new URL(guide.url()).hash).toBe("/doc/creer-un-evenement#modifier-un-evenement")
  const heading = guide.getByRole("heading", { level: 2, name: "Modifier un événement" })
  await expect(heading).toHaveAttribute("id", "modifier-un-evenement")
  await expect(heading).toBeInViewport()
})

test("the guide says how to send feedback: email first, GitHub optional", async ({ page }) => {
  await page.goto("/doc/admin")
  await page.getByRole("link", { name: "Signaler un problème ou proposer une amélioration" }).click()
  await expect(page).toHaveURL(/\/doc\/aide-et-retours#signaler-un-probleme-ou-proposer-une-amelioration$/)
  const heading = page.getByRole("heading", { level: 2, name: "Signaler un problème ou proposer une amélioration" })
  await expect(heading).toBeInViewport()
  await expect(page.getByRole("link", { name: "contact@benevol.app" })).toHaveAttribute("href", "mailto:contact@benevol.app")
  await expect(page.getByRole("link", { name: "le suivi public sur GitHub" })).toHaveAttribute("href", "https://github.com/pvollenweider/benevoles/issues")
})

// #1096: the settings page's help is the organisation's settings; the team has its own link.
test("the settings page opens « Personnaliser l'organisation », the team section « Gérer l'équipe d'organisation »", async ({ page }) => {
  await newEvent(page)
  await page.goto("/admin/settings/admins")
  await expect(page.getByRole("link", { name: "Aide : Personnaliser l'organisation (ouvre dans un nouvel onglet)" })).toHaveAttribute("href", "/doc/personnaliser-l-organisation")
  await expect(page.getByRole("link", { name: "En savoir plus sur l'équipe d'organisation (ouvre dans un nouvel onglet)" })).toHaveAttribute("href", "/doc/equipe-d-organisation")
})

test("the dashboard and the members list have their help link", async ({ page }) => {
  await newEvent(page)
  await page.goto("/admin/dashboard")
  await expect(page.getByRole("link", { name: "Aide : Tableau de bord (ouvre dans un nouvel onglet)" })).toHaveAttribute("href", "/doc/tableau-de-bord")
  await page.goto("/admin/members")
  await expect(page.getByRole("link", { name: "Aide : Gérer les membres (ouvre dans un nouvel onglet)" })).toHaveAttribute("href", "/doc/gerer-les-membres")
})

test("the « Ce lien ne fonctionne pas » page links to its section of the guide", async ({ page }) => {
  await page.goto("/my/e2e-no-such-link-1096")
  await expect(page.getByRole("heading", { level: 1, name: "Ce lien ne fonctionne pas" })).toBeVisible()
  const link = page.getByRole("link", { name: "En savoir plus sur ton lien personnel (ouvre dans un nouvel onglet)" })
  await expect(link).toHaveAttribute("href", "/doc/lien-personnel#la-page-ce-lien-ne-fonctionne-pas-s-affiche")
  const [guide] = await Promise.all([page.context().waitForEvent("page"), link.click()])
  await guide.waitForLoadState()
  await expect(guide.getByRole("heading", { level: 2, name: "La page « Ce lien ne fonctionne pas » s'affiche" })).toBeInViewport()
})
