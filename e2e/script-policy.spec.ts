import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"

/**
 * The enforced script policy (src/lib/security-headers.ts): every page carries a nonce-based
 * `script-src` without 'unsafe-inline', the app still runs everywhere (Next.js's scripts carry the
 * nonce, the app's own inline scripts match their hashes), and a script injected into a page does
 * not run.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

/** Records the policy's refusals, from the first script of each document on. */
async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { __cspViolations: string[] }).__cspViolations = seen
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.effectiveDirective} ${e.blockedURI}`))
  })
}

async function violations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [])
}

function scriptSrc(csp: string | undefined): string[] {
  return csp?.split(";").map((d) => d.trim().split(/\s+/)).find(([name]) => name === "script-src")?.slice(1) ?? []
}

async function visit(page: Page, path: string, status = 200) {
  const res = await page.goto(path)
  expect(res?.status(), path).toBe(status)
  const src = scriptSrc(res?.headers()["content-security-policy"])
  expect(src, path).toContain("'strict-dynamic'")
  expect(src.some((s) => s.startsWith("'nonce-")), path).toBe(true)
  expect(src, path).not.toContain("'unsafe-inline'")
  // The page is live: React hydrated its body, then nothing was refused.
  await waitForHydration(page.locator("body"))
  expect(await violations(page), path).toEqual([])
}

test("public pages run under the enforced policy with nothing refused", async ({ page }) => {
  test.setTimeout(180_000)
  await recordViolations(page)
  for (const path of [
    "/",
    "/fonctionnalites",
    "/tarifs",
    "/doc",
    "/doc/admin",
    "/videos",
    "/blog",
    "/nouveautes",
    "/accessibilite",
    "/legal/privacy",
    "/inscription",
    "/spectacle-cirque-2026?org=default",
    "/spectacle-cirque-2026?org=default&embed=1",
    "/admin/login",
    "/admin/forgot-password",
  ]) await visit(page, path)
  // The server-rendered 404 (#935) too.
  await visit(page, "/une-page-qui-n-existe-pas", 404)
})

test("the policy's nonce changes on every response", async ({ page }) => {
  const nonceOf = async () => scriptSrc((await page.request.get("/fonctionnalites")).headers()["content-security-policy"]).find((s) => s.startsWith("'nonce-"))
  const first = await nonceOf()
  expect(first).toBeTruthy()
  expect(await nonceOf()).not.toBe(first)
})

test("the admin, its client navigation and the print pages run under the policy", async ({ page }) => {
  test.setTimeout(180_000)
  await recordViolations(page)
  await page.goto("/admin/login")
  await waitForHydration(page.getByRole("button", { name: "Se connecter" }))
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)
  expect(await violations(page)).toEqual([])

  // Client navigations (the document's policy stays; the chunks they load are allowed).
  await page.getByRole("link", { name: "Événements", exact: true }).first().click()
  await expect(page).toHaveURL(/\/admin\/events/)
  await page.getByRole("link", { name: /Spectacle/ }).first().click()
  await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/)
  expect(await violations(page)).toEqual([])
  const eventPath = new URL(page.url()).pathname

  // Members list: zod validates without its eval probe.
  await visit(page, "/admin/members")
  await visit(page, `${eventPath}/print`)

  // The print pages: their « Imprimer » button works without an inline handler.
  const base = `${eventPath.replace("/admin/events/", "/api/admin/events/")}/export`
  for (const path of ["sheets/day", "pdf", "badges"]) {
    await page.goto(`${base}/${path}`)
    await page.evaluate(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => { (window as unknown as { __printed: number }).__printed++ } })
    await page.locator("[data-print]").click()
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed), path).toBe(1)
    expect(await violations(page), path).toEqual([])
  }
})

test("a script injected into a page does not run", async ({ page }) => {
  await recordViolations(page)
  await page.goto("/spectacle-cirque-2026?org=default")
  await waitForHydration(page.locator("body"))
  const refused = page.evaluate(
    () => new Promise<string>((resolve) => document.addEventListener("securitypolicyviolation", (e) => resolve(e.effectiveDirective), { once: true })),
  )
  await page.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", `<img src="/does-not-exist.png" onerror="window.__injected = true">`)
  })
  expect(await refused).toMatch(/^script-src/)
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined()
})
