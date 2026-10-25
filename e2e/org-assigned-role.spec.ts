import { test, expect } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "./helpers/public-signup"

/**
 * Roles « Attribué par l'organisation uniquement » (#1145): set from « Gérer les postes », such a
 * role is gone from the public page and its API, the sign-up API refuses its shift even with its
 * id, the organiser still adds someone by hand, and that person sees the assignment on their
 * personal page.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

let event: PublicEvent
const ROLE = "Régie E2E"

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Poste attribué ${Date.now()}`, [
    { label: "Bar", startTime: "10:00", endTime: "12:00" },
    { label: ROLE, startTime: "14:00", endTime: "16:00", capacity: 2 },
  ])
})

test("a role assigned by the organisation only: hidden publicly, refused by the API, added by hand, seen by the person", async ({ page, browser }) => {
  test.setTimeout(180_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  // ── Admin: the option in « Gérer les postes » › « Accès » ────────────────
  await page.goto(`/admin/events/${event.eventId}/shifts`)
  const manage = page.getByRole("button", { name: "Gérer les postes" })
  await waitForHydration(manage)
  await manage.click()
  await page.getByRole("button", { name: `Accès : tous, poste « ${ROLE} »` }).click()
  const box = page.getByRole("checkbox", { name: `Poste « ${ROLE} » attribué par l'organisation uniquement` })
  await expect(box).toBeFocused()
  await box.check()
  // The tags no longer apply: their field goes.
  await expect(page.getByLabel(`Étiquettes donnant accès au poste « ${ROLE} »`)).toHaveCount(0)
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click()
  const access = page.getByRole("button", { name: `Accès : par l'organisation uniquement, poste « ${ROLE} »` })
  await expect(access).toBeFocused()
  await expect(page.getByRole("status").filter({ hasText: `Poste « ${ROLE} » : attribué par l'organisation uniquement.` })).toBeAttached()

  // ── Public page and API: the role is not there ───────────────────────────
  const visitor = await browser.newPage()
  await visitor.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  await visitor.goto(`/${event.slug}?org=default`)
  await expect(visitor.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(visitor.getByText("Bar").first()).toBeVisible()
  await expect(visitor.getByText(ROLE)).toHaveCount(0)
  const api = await (await visitor.request.get(`/api/public/${event.slug}?org=default`)).text()
  expect(api).not.toContain(ROLE)
  await visitor.close()

  const hidden = event.shifts.find((s) => s.label === ROLE)!
  const bar = event.shifts.find((s) => s.label === "Bar")!
  const stamp = `${Date.now()}`
  const refused = await page.request.post("/api/public/registrations", {
    headers: { "x-forwarded-for": randomIp() },
    data: { eventId: event.eventId, shiftIds: [hidden.id], firstName: "E2E", lastName: `Direct${stamp}`, email: `e2e-assigned-${stamp}@example.com`, consent: true, charterAccepted: true },
  })
  expect(refused.status()).toBe(409)
  expect(await refused.text()).not.toContain(ROLE)

  // ── The organiser adds someone by hand; they see it on their personal page ─
  const token = await publicSignUp(page, event, [bar.id])
  const me = await (await page.request.get(`/api/public/registrations/${token}`, { headers: { "x-forwarded-for": randomIp() } })).json()
  const added = await page.request.post("/api/admin/registrations", {
    data: { eventId: event.eventId, shiftId: hidden.id, firstName: me.volunteer.firstName, lastName: me.volunteer.lastName, email: me.volunteer.email },
  })
  expect(added.ok(), await added.text()).toBeTruthy()

  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  await page.goto(`/my/${token}`)
  await expect(page.getByRole("heading", { level: 1, name: "Mes inscriptions" })).toBeVisible()
  await expect(page.getByText(ROLE).first()).toBeVisible()
})
