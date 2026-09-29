import { test, expect } from "@playwright/test"

/**
 * Global search (#377): Ctrl+K reaches the top-bar field, Enter shows grouped results, and a result
 * leads to the matching page.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("an admin finds an event from the top-bar search", async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  // An event of the list, by its title: each card links to the event twice, by title and « Gérer ».
  // (Other links to an event, such as the onboarding checklist's, don't carry the title.)
  const links = await page.locator('a[href^="/admin/events/"]').evaluateAll((as) =>
    as.map((a) => ({ href: a.getAttribute("href") ?? "", text: (a.textContent ?? "").trim() })),
  )
  const managed = new Set(links.filter((l) => l.text.startsWith("Gérer")).map((l) => l.href))
  const event = links.find((l) => managed.has(l.href) && !l.text.startsWith("Gérer") && l.text)
  expect(event).toBeTruthy()
  const word = event!.text.split(/\s+/)[0]

  await page.keyboard.press("Control+k")
  const field = page.getByRole("searchbox", { name: "Rechercher un bénévole, un événement ou un poste" }).first()
  await expect(field).toBeFocused()
  await field.fill(word)
  await field.press("Enter")

  await expect(page).toHaveURL(/\/admin\/search\?q=/)
  const eventsGroup = page.getByRole("region", { name: /Événements/ })
  await expect(eventsGroup).toBeVisible()
  await eventsGroup.locator(`a[href="${event!.href}"]`).click()
  await expect(page).toHaveURL(new RegExp(`${event!.href}$`))
})
