import { test, expect } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, type PublicEvent } from "./helpers/public-signup"
import { seriousViolations } from "./helpers/axe"

/**
 * Milestones on the event page (#189, #989, #985): add one with an owner chosen among the
 * organisation's admins, see the owner under its title, change it back to « Aucun » in place,
 * and the API refuses an owner who is not an active admin of the organisation.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Jalons ${Date.now()}`, [{ label: "Bar", startTime: "10:00", endTime: "12:00" }])
})

test("a milestone with an owner: added, shown, removed in place; a foreign owner refused", async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)

  await page.goto(`/admin/events/${event.eventId}`)
  const add = page.getByRole("button", { name: "+ Ajouter un jalon" })
  await waitForHydration(add)
  await add.click()

  const form = page.getByRole("form", { name: "Nouveau jalon" })
  await form.getByRole("textbox", { name: "Titre" }).fill("Louer la tente")
  await form.getByLabel(/^Échéance/).fill("2030-09-20")
  const owner = form.getByRole("combobox", { name: /^Qui s'en occupe/ })
  await expect(owner).toHaveValue("")
  await expect(owner.getByRole("option").first()).toHaveText("Aucun")
  // The signed-in admin is an active admin of the organisation: one of the choices.
  const me = await owner.getByRole("option").filter({ hasNotText: "Aucun" }).first().textContent()
  await owner.selectOption({ label: me! })
  expect.soft(await seriousViolations(page), "milestone form").toEqual([])
  await form.getByRole("button", { name: "Ajouter" }).click()

  const row = page.getByRole("listitem").filter({ hasText: "Louer la tente" })
  await expect(row.getByText(`Qui s'en occupe : ${me}`)).toBeVisible()
  await expect(row.getByRole("checkbox", { name: "Louer la tente" })).toBeVisible()
  expect.soft(await seriousViolations(page), "list with an owner").toEqual([])
  // 320 px: the owner wraps under the title, nothing scrolls sideways.
  await page.setViewportSize({ width: 320, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.setViewportSize({ width: 1280, height: 800 })

  // Back to « Aucun », in place.
  await row.getByRole("button", { name: /^Modifier\W+le jalon\W+Louer la tente\W+$/ }).click()
  const editForm = page.getByRole("form", { name: /^Modifier le jalon/ })
  await editForm.getByRole("combobox", { name: /^Qui s'en occupe/ }).selectOption("")
  await editForm.getByRole("button", { name: "Enregistrer" }).click()
  await expect(page.getByRole("button", { name: /^Modifier\W+le jalon\W+Louer la tente\W+$/ })).toBeFocused()
  await expect(page.getByRole("listitem").filter({ hasText: "Louer la tente" }).getByText(/^Qui s'en occupe/)).toHaveCount(0)

  // An id that is no active admin of this organisation is refused, nothing created.
  const res = await page.request.post(`/api/admin/events/${event.eventId}/milestones`, {
    data: { title: "Jalon refusé", dueDate: "2030-09-21", ownerId: "not-an-admin-of-this-org" },
  })
  expect(res.status()).toBe(422)
  expect((await res.json()).field).toBe("ownerId")
  const list = await page.request.get(`/api/admin/events/${event.eventId}/milestones`)
  expect((await list.json()).map((m: { title: string }) => m.title)).toEqual(["Louer la tente"])
})
