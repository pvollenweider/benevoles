import { test, expect } from "@playwright/test"

/**
 * The super admin's organization switch (#1048): an email link to an event of another
 * organization opens a confirmation page that changes nothing, its button switches (a POST), and
 * the admin APIs refuse a state-changing call from another origin or with a form body.
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

test("an event link of another organization asks before switching", async ({ page }) => {
  const stamp = Date.now()
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard|\/super-admin\/organizations/)

  const createOrg = async (name: string) => {
    const res = await page.request.post("/api/super-admin/organizations", {
      data: { name, adminEmail: `${name}@example.com`, adminName: "E2E" },
    })
    expect(res.ok()).toBeTruthy()
    return (await res.json()).org as { id: string; name: string }
  }
  const orgB = await createOrg(`e2e-switch-b-${stamp}`)
  const orgC = await createOrg(`e2e-switch-c-${stamp}`)

  // An event in B, then the super admin works in C.
  expect((await page.request.post(`/api/super-admin/use-org/${orgB.id}`)).ok()).toBeTruthy()
  const eventRes = await page.request.post("/api/admin/events", { data: { title: `E2E Switch ${stamp}`, startDate: "2030-07-01", endDate: "2030-07-02" } })
  expect(eventRes.ok()).toBeTruthy()
  const event: { id: string } = await eventRes.json()
  expect((await page.request.post(`/api/super-admin/use-org/${orgC.id}`)).ok()).toBeTruthy()

  // The link opens the confirmation page; opening it switched nothing.
  await page.goto(`/admin/events/${event.id}`)
  await expect(page.getByRole("heading", { level: 1, name: "Changer d'organisation" })).toBeVisible()
  await expect(page.getByText(`La page demandée appartient à l'organisation ${orgB.name}.`)).toBeVisible()
  await expect(page.getByText(`Vous travaillez actuellement dans ${orgC.name}.`)).toBeVisible()
  await page.reload()
  await expect(page.getByText(`Vous travaillez actuellement dans ${orgC.name}.`)).toBeVisible()

  // The old GET address changes nothing either.
  await page.goto(`/api/super-admin/use-org/${orgB.id}?next=${encodeURIComponent(`/admin/events/${event.id}`)}`)
  await expect(page.getByText(`Vous travaillez actuellement dans ${orgC.name}.`)).toBeVisible()

  // The button switches and opens the event.
  await page.getByRole("button", { name: `Travailler dans ${orgB.name}` }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/events/${event.id}`))
  await expect(page.getByRole("heading", { name: "Changer d'organisation" })).toHaveCount(0)
})

test("the admin APIs refuse a call from another origin or with a form body", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard|\/super-admin\/organizations/)

  const foreign = await page.request.post("/api/super-admin/use-org/any", { headers: { Origin: "https://evil.example" } })
  expect(foreign.status()).toBe(403)
  const crossSite = await page.request.post("/api/admin/events", { headers: { "Sec-Fetch-Site": "same-site" }, data: { title: "x" } })
  expect(crossSite.status()).toBe(403)
  const plain = await page.request.post("/api/admin/events", { headers: { "Content-Type": "text/plain" }, data: JSON.stringify({ title: "x" }) })
  expect(plain.status()).toBe(415)
})
