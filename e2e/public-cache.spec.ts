import { test, expect } from "@playwright/test"

/**
 * Anonymous public content pages (#773, #759 F3): no Auth.js cookie, a cacheable response, no
 * X-Powered-By. The rules are unit-tested (src/lib/__tests__/public-cache.test.ts, and the proxy in
 * src/__tests__/proxy-public-cache.test.ts); this checks what the built server really sends, and
 * that signing in still works with its CSRF cookie.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

const PUBLIC_PAGES = ["/", "/doc", "/doc/admin", "/doc/revenir-sur-la-page-d-inscription", "/nouveautes", "/fonctionnalites", "/videos", "/accessibilite", "/legal/privacy"]

for (const path of PUBLIC_PAGES) {
  test(`${path} sets no cookie and can be cached`, async ({ request }) => {
    const response = await request.get(path)
    expect(response.status()).toBe(200)
    const headers = response.headersArray()
    expect(headers.filter((h) => h.name.toLowerCase() === "set-cookie")).toEqual([])
    const cacheControl = response.headers()["cache-control"]
    expect(cacheControl).toMatch(/^public, /)
    expect(cacheControl).not.toContain("no-store")
    expect(response.headers()["x-powered-by"]).toBeUndefined()
    // The security header stays.
    expect(response.headers()["referrer-policy"]).toBe("strict-origin")
  })
}

test("an organisation's page keeps Auth.js and no-store", async ({ request }) => {
  const response = await request.get("/?org=default")
  expect(response.headers()["cache-control"]).toContain("no-store")
})

test("a visitor browsing the documentation gets no cookie", async ({ page }) => {
  await page.goto("/doc")
  await page.getByRole("link", { name: "Guide administrateur" }).first().click()
  await expect(page).toHaveURL(/\/doc\/admin$/)
  expect(await page.context().cookies()).toEqual([])
})

test("signing in still works, with its CSRF cookie, and a signed-in visit is never cached", async ({ page }) => {
  const login = await page.goto("/admin/login")
  expect(login?.headers()["cache-control"]).toContain("no-store")
  expect((await page.context().cookies()).some((c) => c.name.endsWith("authjs.csrf-token"))).toBe(true)

  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  // With the session cookie, the documentation goes through Auth.js again: no shared caching.
  const doc = await page.goto("/doc")
  expect(doc?.status()).toBe(200)
  expect(doc?.headers()["cache-control"]).toContain("no-store")
})
