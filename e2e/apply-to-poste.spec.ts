import { test, expect, type Page } from "@playwright/test"

/**
 * « Appliquer au poste » from the Frise popover (#1017): places and label of one shift onto the
 * poste's shifts of the whole event, across two days, after a confirmation with the counts; every
 * day's timeline shows them at once, and they are saved.
 */
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)
}

test("places and label applied to the whole event, across two days", async ({ page }) => {
  await login(page)
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { data })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const event: { id: string } = await post("/api/admin/events", { title: `E2E Apply to poste ${Date.now()}`, startDate: "2030-10-01", endDate: "2030-10-02", publicStatus: "draft" })
  await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-01", startTime: "10:00", endTime: "12:00", capacity: 3 })
  await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-01", startTime: "14:00", endTime: "16:00", capacity: 3 })
  await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-02", startTime: "10:00", endTime: "12:00", capacity: 2 })
  await post("/api/admin/shifts", { eventId: event.id, roleName: "Accueil", label: "Accueil", date: "2030-10-02", startTime: "10:00", endTime: "12:00", capacity: 2 })
  await page.goto(`/admin/events/${event.id}/shifts`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

  const firstDay = page.getByRole("region", { name: /Planning du mardi 1 octobre/i })
  const secondDay = page.getByRole("region", { name: /Planning du mercredi 2 octobre/i })
  await firstDay.getByRole("button", { name: /^Bar, 10h–12h/ }).click()
  const popover = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /^Bar ?, de 10h à 12h/ }) })
  await popover.getByLabel("Libellé").fill("Bar soir")
  await popover.getByLabel("Places").fill("5")

  const event_ = popover.getByRole("group", { name: "Appliquer au poste « Bar » :" }).getByRole("button", { name: "Tout l'événement" })
  await expect(event_).toHaveAccessibleDescription(/Applique 5 places et le libellé « Bar soir »\./)
  await event_.click()
  const question = popover.getByRole("group", { name: "Appliquer à 3 créneaux sur 2 jours ?" })
  const confirm = question.getByRole("button", { name: "Confirmer" })
  await expect(confirm).toBeFocused()
  await confirm.click()
  await expect(popover.getByRole("status")).toHaveText("Appliqué à 3 créneaux du poste « Bar » sur 2 jours.")
  await expect(event_).toBeFocused()
  await popover.getByRole("button", { name: "Fermer et enregistrer" }).click()

  // The other day and the other shift of the first day show it without a reload; Accueil is untouched.
  await expect(secondDay.getByRole("button", { name: /^Bar, 10h–12h, Bar soir, 0\/5 inscrit/ })).toBeVisible()
  await expect(firstDay.getByRole("button", { name: /^Bar, 14h–16h, Bar soir, 0\/5 inscrit/ })).toBeVisible()
  await expect(secondDay.getByRole("button", { name: /^Accueil, 10h–12h/ })).toBeVisible()

  // And it is saved.
  await page.reload()
  await expect(page.getByRole("region", { name: /Planning du mercredi 2 octobre/i }).getByRole("button", { name: /^Bar, 10h–12h, Bar soir, 0\/5 inscrit/ })).toBeVisible()
  await expect(page.getByRole("region", { name: /Planning du mardi 1 octobre/i }).getByRole("button", { name: /^Bar, 14h–16h, Bar soir, 0\/5 inscrit/ })).toBeVisible()
})
