import { test, expect } from "@playwright/test"

/**
 * Bulk actions on the registrations list (#220): select several rows and cancel or "rendre
 * responsable" them all at once, instead of one row at a time.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

async function setUpEventWithRegistrations(page: import("@playwright/test").Page, stamp: number, count: number) {
  const eventRes = await page.request.post("/api/admin/events", {
    data: { title: `E2E Bulk Actions ${stamp}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" },
  })
  const event: { id: string } = await eventRes.json()

  const shiftRes = await page.request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-01", startTime: "10:00", endTime: "18:00", capacity: count },
  })
  const shift: { id: string } = await shiftRes.json()

  const regIds: string[] = []
  for (let i = 0; i < count; i++) {
    const res = await page.request.post("/api/admin/registrations", {
      data: {
        eventId: event.id, shiftId: shift.id,
        firstName: "E2E", lastName: `Bulk${i}`, email: `e2e-bulk-${stamp}-${i}@example.com`,
      },
    })
    const reg = await res.json()
    regIds.push(reg.id)
  }

  return { eventId: event.id, shiftId: shift.id, regIds }
}

test("selecting all visible rows and bulk-cancelling removes them all", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEventWithRegistrations(page, stamp, 3)

  await page.goto(`/admin/events/${eventId}/registrations`)
  // #582: real plurals, and each checkbox names the shift and its time in words.
  await expect(page.getByText("3 inscriptions actives", { exact: true })).toBeVisible()
  await expect(page.getByRole("checkbox", { name: /^Sélectionner l'inscription de .+, de \d+h(\d+)? à \d+h/ }).first()).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "Sélectionner l'inscription de E2E Bulk0, Bar, mardi 1 octobre, de 10h à 18h", exact: true })).toBeVisible()

  await page.getByLabel("Sélectionner toutes les inscriptions visibles").check()
  await expect(page.getByText("3 sélectionnées")).toBeVisible()

  await page.getByRole("button", { name: /^Retirer de leur créneau \(3\)$/ }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Retirer" }).click()

  // The rows leave the list at once, the request waits for the undo window (#379).
  await expect(page.getByText("Aucune inscription.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Annuler le retrait" })).toBeFocused()
  let detail = await (await page.request.get(`/api/admin/events/${eventId}`)).json()
  expect(detail.shifts[0].registrations).toHaveLength(3)

  await page.getByRole("button", { name: "Retirer maintenant" }).click()
  await expect(page.getByRole("status").filter({ hasText: "3 bénévoles retirés." })).toBeVisible()
  detail = await (await page.request.get(`/api/admin/events/${eventId}`)).json()
  expect(detail.shifts[0].registrations).toHaveLength(0)
})

test("undoing a bulk removal within the window keeps everyone registered", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEventWithRegistrations(page, stamp, 2)

  await page.goto(`/admin/events/${eventId}/registrations`)
  await page.getByLabel("Sélectionner toutes les inscriptions visibles").check()
  await page.getByRole("button", { name: /^Retirer de leur créneau \(2\)$/ }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Retirer" }).click()
  await expect(page.getByText("Aucune inscription.")).toBeVisible()

  await expect(page.getByRole("button", { name: "Annuler le retrait" })).toBeFocused()
  await page.getByRole("button", { name: "Annuler le retrait" }).click()
  await expect(page.locator("tbody tr")).toHaveCount(2)
  await expect(page.getByRole("status").filter({ hasText: "Retrait annulé" })).toBeVisible()
  // Well past the window: nothing was sent.
  await page.waitForTimeout(11_000)
  const detail = await (await page.request.get(`/api/admin/events/${eventId}`)).json()
  expect(detail.shifts[0].registrations).toHaveLength(2)
})

test("selecting a subset only cancels those rows", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEventWithRegistrations(page, stamp, 3)

  await page.goto(`/admin/events/${eventId}/registrations`)
  const rows = page.locator("tbody tr")
  await expect(rows).toHaveCount(3)

  await rows.nth(0).getByRole("checkbox").check()
  await rows.nth(1).getByRole("checkbox").check()
  await expect(page.getByText("2 sélectionnées")).toBeVisible()

  await page.getByRole("button", { name: /^Retirer de leur créneau \(2\)$/ }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Retirer" }).click()

  await expect(rows).toHaveCount(1)
  await page.getByRole("button", { name: "Retirer maintenant" }).click()
  await expect(page.getByRole("status").filter({ hasText: "2 bénévoles retirés." })).toBeVisible()
})

test("bulk 'rendre responsable' makes every selected volunteer a leader of their own shift's role", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEventWithRegistrations(page, stamp, 2)

  await page.goto(`/admin/events/${eventId}/registrations`)
  await page.getByLabel("Sélectionner toutes les inscriptions visibles").check()

  await page.getByRole("button", { name: "Rendre responsable" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Désigner" }).click()

  // The confirmation is an sr-only aria-live announcement (never visually shown), so
  // toBeAttached() rather than toBeVisible(). Each item sends a real email (sector-leader
  // invite) — this can be slow in a misconfigured local SMTP setup (see #228) but should be
  // fast in CI, which runs the pinned Node version.
  await expect(page.getByText(/\d+ responsables? ajoutés?\./)).toBeAttached({ timeout: 20_000 })

  const leaders = await (await page.request.get(`/api/admin/events/${eventId}/sector-leaders`)).json()
  expect(leaders).toHaveLength(2)
  expect(leaders.every((l: { roleName: string }) => l.roleName === "Bar")).toBe(true)
})

test("deselecting clears the selection and hides the toolbar", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEventWithRegistrations(page, stamp, 2)

  await page.goto(`/admin/events/${eventId}/registrations`)
  await page.getByLabel("Sélectionner toutes les inscriptions visibles").check()
  await expect(page.getByText("2 sélectionnées")).toBeVisible()

  await page.getByRole("button", { name: "Désélectionner" }).click()
  await expect(page.getByText("2 sélectionnées")).not.toBeVisible()
})

// Per-row action buttons were removed (#261) — every action now goes through selecting a row's
// checkbox then a single toolbar button, matching the pattern bulk actions already established.
test("selecting exactly one row and 'rendre responsable' opens the modal, not the auto bulk flow", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEventWithRegistrations(page, stamp, 2)

  await page.goto(`/admin/events/${eventId}/registrations`)
  const rows = page.locator("tbody tr")
  await rows.nth(0).getByRole("checkbox").check()
  await expect(page.getByText("1 sélectionnée")).toBeVisible()

  await page.getByRole("button", { name: "Rendre responsable" }).click()

  // The per-person modal, not the recap confirmation the multi-row path shows.
  await expect(page.getByRole("heading", { name: /Rendre .+ responsable/ })).toBeVisible()
})

test("bulk 'renvoyer le lien' resends the management link to every selected volunteer", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEventWithRegistrations(page, stamp, 2)

  await page.goto(`/admin/events/${eventId}/registrations`)
  await page.getByLabel("Sélectionner toutes les inscriptions visibles").check()

  await page.getByRole("button", { name: "Renvoyer le lien" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Renvoyer" }).click()

  await expect(page.getByText(/Lien renvoyé à \d+ bénévoles?\./)).toBeAttached({ timeout: 20_000 })
})

test("the countdown waits while the focus stays on the bar, and runs once it leaves", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEventWithRegistrations(page, stamp, 1)

  await page.goto(`/admin/events/${eventId}/registrations`)
  await page.getByLabel("Sélectionner toutes les inscriptions visibles").check()
  await page.getByRole("button", { name: /^Retirer de leur créneau \(1\)$/ }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Retirer" }).click()
  await expect(page.getByRole("button", { name: "Annuler le retrait" })).toBeFocused()

  // Focus on the bar: well past the window, still waiting.
  await page.waitForTimeout(11_000)
  await expect(page.getByRole("button", { name: "Annuler le retrait" })).toBeVisible()
  let detail = await (await page.request.get(`/api/admin/events/${eventId}`)).json()
  expect(detail.shifts[0].registrations).toHaveLength(1)

  // Focus elsewhere: the window runs out and the removal is committed.
  await page.locator("#reg-search").focus()
  await expect(page.getByRole("status").filter({ hasText: "1 bénévole retiré." })).toBeVisible({ timeout: 15_000 })
  detail = await (await page.request.get(`/api/admin/events/${eventId}`)).json()
  expect(detail.shifts[0].registrations).toHaveLength(0)
})
