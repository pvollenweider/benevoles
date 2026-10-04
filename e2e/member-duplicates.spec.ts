import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"

/**
 * Possible duplicates (#601): two members with the same name and the same phone number written
 * differently appear as a suggested pair with worded reasons; dismissing it removes it from the
 * list; the owner can then follow the merge link straight to the #600 preview, with the second
 * record already chosen (?with=<otherId>, no re-search needed).
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

test("two members with the same name and phone (written differently) appear as a pair, dismiss removes it, the owner can reach the merge preview", async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)

  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }

  const suffix = Date.now()
  const lastName = `DupE2E${suffix}`
  // A phone unique to this run (built from `suffix`), written two different ways: a leftover
  // member from an earlier, non-cleaned e2e run sharing the literal same hardcoded phone would
  // otherwise also match this run's members by phone alone, which is exactly the "shared phone
  // possible" signal this test isn't about.
  const nationalDigits = `79${String(suffix).slice(-7)}`
  const phoneA = `0${nationalDigits.slice(0, 2)} ${nationalDigits.slice(2, 5)} ${nationalDigits.slice(5, 7)} ${nationalDigits.slice(7, 9)}`
  const phoneB = `0041${nationalDigits}`
  await post("/api/admin/members", { firstName: "Jean", lastName, email: `jean-dup-a-${suffix}@example.com`, phone: phoneA })
  await post("/api/admin/members", { firstName: "Jean", lastName, email: `jean-dup-b-${suffix}@example.com`, phone: phoneB })

  await page.goto("/admin/members")
  const duplicatesLink = page.getByRole("link", { name: /Doublons possibles \(\d+\)/ })
  await waitForHydration(page.getByRole("heading", { level: 1 }))
  await expect(duplicatesLink).toBeVisible()
  await duplicatesLink.click()

  await expect(page).toHaveURL(/\/admin\/members\/duplicates$/)
  await expect(page.getByRole("heading", { name: "Doublons possibles" })).toBeVisible()

  const pairText = new RegExp(`Jean ${lastName} et Jean ${lastName}`)
  const row = page.getByRole("listitem").filter({ hasText: pairText })
  await expect(row).toBeVisible()
  await expect(row.getByText(/Même nom et prénom/)).toBeVisible()
  await expect(row.getByText(/Même numéro de téléphone/)).toBeVisible()

  const dismissButton = page.getByRole("button", { name: new RegExp(`^Ignorer.*Jean ${lastName} et Jean ${lastName}`) })
  await waitForHydration(dismissButton)
  const mergeLink = page.getByRole("link", { name: new RegExp(`^Comparer et fusionner.*Jean ${lastName} et Jean ${lastName}`) })
  await expect(mergeLink).toBeVisible()
  const mergeHref = await mergeLink.getAttribute("href")
  expect(mergeHref).toMatch(/\?with=/)

  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/admin/members/duplicates/dismiss") && r.ok()),
    dismissButton.click(),
  ])
  // The dismissal announcement itself names both members ("Paire ignorée : X et Y."), so the
  // check that the pair is gone is scoped to the list rows, not any text on the page.
  await expect(row).toHaveCount(0)
  await expect(page.getByRole("status")).toHaveText(new RegExp(`Paire ignorée : ${pairText.source}\\.`))

  // Reload: the dismissal persisted (not just removed from the client's local state).
  await page.reload()
  await expect(page.getByRole("listitem").filter({ hasText: pairText })).toHaveCount(0)

  // The merge link, captured before the dismissal, lands directly on the preview for that pair —
  // no re-search needed — with the same focus and announcement as picking it by hand (#600).
  await page.goto(mergeHref!)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Fusionner")
  const previewHeading = page.getByRole("heading", { name: new RegExp(`^Aperçu de la fusion avec Jean ${lastName}`) })
  await expect(previewHeading).toBeVisible()
  await expect(previewHeading).toBeFocused()
  await expect(page.getByRole("status")).toHaveText(new RegExp(`Aperçu de la fusion avec Jean ${lastName}`))
  // Never shown: the picker is bypassed entirely when `?with=` resolves.
  await expect(page.getByRole("heading", { name: "Choisir la fiche à absorber" })).toHaveCount(0)
})
