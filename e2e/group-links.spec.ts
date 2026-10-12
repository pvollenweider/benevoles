import { test, expect } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, randomIp, type PublicEvent } from "./helpers/public-signup"

/**
 * Share links per group (#947): the organiser creates a link for a club from « Partager
 * l'événement », the link opens the public page on that club's roles only, says so, and lets the
 * visitor see every role; a sign-up through it is counted on the link and filterable on the
 * registrations page. An unknown code shows the whole event with a short notice, never an error.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Liens par groupe ${Date.now()}`, [
    { label: "Bar", startTime: "10:00", endTime: "12:00" },
    { label: "Parking", startTime: "12:00", endTime: "14:00" },
    { label: "Accueil", startTime: "14:00", endTime: "16:00" },
  ])
})

test("a group link: created by the organiser, filtered for volunteers, sign-ups counted", async ({ page, context }) => {
  test.setTimeout(180_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  // ── Admin: create the link ────────────────────────────────────────────────
  await page.goto(`/admin/events/${event.eventId}`)
  const section = page.getByRole("region", { name: "Partager l'événement" })
  const create = section.getByRole("button", { name: "Créer un lien pour un groupe" })
  await waitForHydration(create)
  await create.click()
  const form = section.getByRole("form", { name: "Nouveau lien pour un groupe" })
  const name = form.getByLabel("Nom du groupe")
  await expect(name).toBeFocused()

  // Nothing typed: refused on the name, which keeps the focus and carries the message.
  await form.getByRole("button", { name: "Créer le lien" }).click()
  await expect(form.getByRole("alert")).toHaveText("Donnez un nom au lien, par exemple celui du club.")
  await expect(name).toBeFocused()
  await expect(name).toHaveAttribute("aria-invalid", "true")

  // A name but no role: refused on the roles.
  await name.fill("Amicale E2E")
  await form.getByRole("button", { name: "Créer le lien" }).click()
  await expect(form.getByRole("alert")).toHaveText("Choisissez au moins un poste.")
  await expect(form.getByRole("checkbox", { name: "Bar" })).toBeFocused()

  await form.getByRole("checkbox", { name: "Bar" }).check()
  await form.getByRole("checkbox", { name: "Parking" }).check()
  await form.getByRole("button", { name: "Créer le lien" }).click()

  const item = section.getByRole("listitem").filter({ hasText: "Amicale E2E" })
  await expect(item).toContainText("Postes : Bar, Parking")
  await expect(item).toContainText("Aucune inscription pour l'instant")
  // The new link's copy button takes the focus; the creation is announced.
  await expect(item.getByRole("button", { name: "Copier le lien « Amicale E2E »" })).toBeFocused()
  const url = (await item.getByText(/groupe=/).textContent())!.trim()
  const code = new URL(url).searchParams.get("groupe")!
  expect(code).toMatch(/^[a-z2-9]{8}$/)

  // Copy, with the confirmation in the section's status region.
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await item.getByRole("button", { name: "Copier le lien « Amicale E2E »" }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url)

  // Its QR code downloads, named after the link.
  const png = await page.request.get(await item.getByRole("link", { name: /^QR code PNG « Amicale E2E »/ }).getAttribute("href") as string)
  expect(png.ok()).toBeTruthy()
  expect(png.headers()["content-type"]).toBe("image/png")
  expect(png.headers()["content-disposition"]).toContain("-amicale-e2e-qr.png")

  // ── Public page through the link ──────────────────────────────────────────
  const visitor = await context.newPage()
  await visitor.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  const path = new URL(url).pathname + new URL(url).search
  await visitor.goto(path.includes("org=") ? path : `${path}&org=default`)
  const toggle = visitor.getByRole("button", { name: "Voir tous les postes" })
  await waitForHydration(toggle)
  await expect(visitor.getByText("Lien « Amicale E2E » : seuls ses 2 postes sont affichés.")).toBeVisible()
  // Only the link's roles: Bar and Parking, not Accueil.
  await expect(visitor.getByRole("button", { name: /Bar.*: sélectionner/ })).toHaveCount(1)
  await expect(visitor.getByRole("button", { name: /Parking.*: sélectionner/ })).toHaveCount(1)
  await expect(visitor.getByRole("button", { name: /Accueil.*: sélectionner/ })).toHaveCount(0)

  // « Voir tous les postes »: the same button flips, keeps the focus, and the count is announced.
  await toggle.click()
  await expect(visitor.getByRole("button", { name: /Accueil.*: sélectionner/ })).toHaveCount(1)
  await expect(visitor.getByRole("status").filter({ hasText: "Tous les postes de l'événement sont affichés." })).toHaveCount(1)
  const back = visitor.getByRole("button", { name: "Revenir aux postes de « Amicale E2E »" })
  await expect(back).toBeFocused()
  await back.click()
  await expect(visitor.getByRole("button", { name: /Accueil.*: sélectionner/ })).toHaveCount(0)

  // A sign-up through the page of the link is counted for it (the page sends the code, the server
  // resolves it).
  const lastName = `Groupe${Date.now()}`
  await visitor.getByRole("button", { name: /Bar.*: sélectionner/ }).click()
  await visitor.getByRole("button", { name: /^Continuer/ }).first().click()
  await visitor.getByLabel("Prénom *", { exact: true }).fill("E2E")
  await visitor.getByLabel("Nom *", { exact: true }).fill(lastName)
  await visitor.getByLabel("Email *", { exact: true }).fill(`e2e-groupe-${Date.now()}@example.com`)
  await visitor.getByRole("button", { name: "convention des bénévoles" }).click()
  await visitor.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
  await visitor.getByLabel(/J.accepte que l.association/).check()
  await visitor.getByRole("button", { name: "Confirmer mon inscription" }).click()
  await expect(visitor).toHaveURL(new RegExp(`/${event.slug}/success`))

  // Unknown code: the whole event and a short notice, no error page.
  const unknown = await visitor.goto(`/${event.slug}?org=default&groupe=zzzz2222`)
  expect(unknown?.status()).toBe(200)
  await expect(visitor.getByText("Ce lien de groupe n'existe plus : tous les postes de l'événement sont affichés.")).toBeVisible()
  await expect(visitor.getByRole("button", { name: /Accueil.*: sélectionner/ })).toHaveCount(1)
  await visitor.close()

  // ── Admin: the count, and the registrations filtered by the link ──────────
  await page.reload()
  await expect(item).toContainText("1 personne inscrite, 1 créneau")
  await item.getByRole("link", { name: "Voir ses inscriptions (« Amicale E2E »)" }).click()
  await expect(page).toHaveURL(/\/registrations\?lien=/)
  await expect(page.getByLabel("Filtrer par lien de groupe")).toHaveValue(/.+/)
  await expect(page.getByRole("table").getByText(`E2E ${lastName}`, { exact: true })).toBeVisible()
  await page.getByLabel("Filtrer par lien de groupe").selectOption({ label: "Sans lien de groupe" })
  await expect(page.getByText("Aucun résultat.")).toBeVisible()

  // ── Admin: delete, after confirmation; the registration stays ─────────────
  await page.goto(`/admin/events/${event.eventId}`)
  const remove = item.getByRole("button", { name: "Supprimer le lien « Amicale E2E »" })
  await waitForHydration(remove)
  await remove.click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toContainText("L'inscription venue de ce lien est conservée")
  await dialog.getByRole("button", { name: "Supprimer le lien" }).click()
  await expect(section.getByRole("listitem").filter({ hasText: "Amicale E2E" })).toHaveCount(0)
  await expect(section.getByRole("button", { name: "Créer un lien pour un groupe" })).toBeFocused()
  await page.goto(`/admin/events/${event.eventId}/registrations`)
  await expect(page.getByRole("table").getByText(`E2E ${lastName}`, { exact: true })).toBeVisible()
})
