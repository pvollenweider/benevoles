import { test, expect, type Browser, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { resetSuperAdminSecondFactor, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, superAdminCode } from "./helpers/super-admin"
import { base32Decode, totp } from "../src/lib/totp"

/**
 * The super admin's second factor (pentest F6), end to end: enrolment at the first sign-in, a code
 * refused when replayed, recovery codes used once, nothing of the super admin space reachable
 * before the second step (pages and APIs), and a client unable to complete its own session.
 * Runs serially: each test builds on the factor enrolled by the first.
 */
test.describe.configure({ mode: "serial" })

async function password(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/two-factor/)
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}

let enrolmentCode = ""
let recoveryCodes: string[] = []

test("first sign-in enrols an authenticator app and shows ten recovery codes once", async ({ page }) => {
  resetSuperAdminSecondFactor()
  await password(page)
  await expect(page.getByRole("heading", { level: 1, name: "Activez la double authentification" })).toBeVisible()
  await expect(page.getByRole("img", { name: "Code QR à scanner avec votre application d'authentification" })).toBeVisible()
  expect.soft(await seriousViolations(page), "enrolment").toEqual([])

  const secret = (await page.locator("code").first().innerText()).replace(/\s/g, "")
  expect(secret).toMatch(/^[A-Z2-7]{32}$/)
  // A reload offers the same secret: the entry already added to the app keeps working.
  await page.reload()
  expect((await page.locator("code").first().innerText()).replace(/\s/g, "")).toBe(secret)

  const code = page.getByLabel("Code à 6 chiffres affiché par l'application")
  await expect(code).toHaveAttribute("autocomplete", "one-time-code")
  await expect(code).toHaveAttribute("inputmode", "numeric")
  await code.fill("000000")
  await page.getByRole("button", { name: "Activer" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Code incorrect" })).toBeVisible()

  enrolmentCode = totp(base32Decode(secret), Date.now())
  await code.fill(`${enrolmentCode.slice(0, 3)} ${enrolmentCode.slice(3)}`)
  await page.getByRole("button", { name: "Activer" }).click()
  const heading = page.getByRole("heading", { level: 2, name: "Vos codes de secours" })
  await expect(heading).toBeFocused()
  await expect(page.getByRole("status").filter({ hasText: "Double authentification activée." })).toBeVisible()
  recoveryCodes = await page.locator("ol").last().locator("li").allInnerTexts()
  expect(recoveryCodes).toHaveLength(10)
  expect.soft(await seriousViolations(page), "recovery codes").toEqual([])

  await page.getByRole("button", { name: "J'ai noté mes codes, continuer" }).click()
  await expect(page).toHaveURL(/\/super-admin\/organizations/)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
})

test("before the second step, no super admin page or API answers, and the client can't complete its own session", async ({ browser }) => {
  const { context, page } = await freshPage(browser)
  await password(page)
  await expect(page.getByRole("heading", { level: 1, name: "Double authentification" })).toBeVisible()
  expect.soft(await seriousViolations(page), "verification").toEqual([])

  await page.goto("/super-admin/health")
  await expect(page).toHaveURL(/\/admin\/two-factor\?callbackUrl=%2Fsuper-admin%2Fhealth/)
  expect((await page.request.get("/api/super-admin/organizations")).status()).toBe(401)
  expect((await page.request.get("/api/admin/events")).status()).toBe(401)

  // What a client can send to next-auth's session update changes nothing.
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()) as { csrfToken: string }
  await page.request.post("/api/auth/session", { data: { csrfToken: csrf.csrfToken, data: { secondFactorAt: Date.now(), secondFactorProof: "x", secondFactor: { pending: false } } } })
  expect((await page.request.get("/api/super-admin/organizations")).status()).toBe(401)
  const session = (await (await page.request.get("/api/auth/session")).json()) as { secondFactor?: { pending: boolean }; user?: { role?: string } }
  expect(session.secondFactor?.pending).toBe(true)
  expect(session.user?.role).toBeUndefined()
  await context.close()
})

test("a code already used is refused; a recovery code works once", async ({ browser }) => {
  const { context, page } = await freshPage(browser)
  await password(page)
  // The enrolment code's step is spent: replaying it within its 90 seconds is refused.
  await page.getByLabel("Code à 6 chiffres affiché par l'application").fill(enrolmentCode)
  await page.getByRole("button", { name: "Valider" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Code incorrect ou déjà utilisé" })).toBeVisible()

  await page.getByRole("button", { name: "Utiliser un code de secours" }).click()
  const recovery = page.getByLabel("Code de secours")
  await expect(recovery).toBeFocused()
  await recovery.fill(recoveryCodes[0].toUpperCase())
  await page.getByRole("button", { name: "Valider" }).click()
  await expect(page).toHaveURL(/\/super-admin\/organizations/)
  expect((await page.request.get("/api/super-admin/organizations")).status()).toBe(200)
  await context.close()

  const second = await freshPage(browser)
  await password(second.page)
  await second.page.getByRole("button", { name: "Utiliser un code de secours" }).click()
  await second.page.getByLabel("Code de secours").fill(recoveryCodes[0])
  await second.page.getByRole("button", { name: "Valider" }).click()
  await expect(second.page.getByRole("alert").filter({ hasText: "Code incorrect ou déjà utilisé" })).toBeVisible()
  await second.context.close()
})

test("the profile shows the codes left and makes new ones with a current code", async ({ browser }) => {
  const { context, page } = await freshPage(browser)
  await password(page)
  await page.getByLabel("Code à 6 chiffres affiché par l'application").fill(superAdminCode())
  await page.getByRole("button", { name: "Valider" }).click()
  await expect(page).toHaveURL(/\/super-admin\/organizations/)

  await page.goto("/super-admin/profile")
  const card = page.getByRole("region", { name: "Double authentification" })
  await expect(card).toContainText("Codes de secours restants : 9 sur 10.")
  expect.soft(await seriousViolations(page), "profile").toEqual([])
  await card.getByLabel("Code à 6 chiffres affiché par l'application").fill(superAdminCode())
  await card.getByRole("button", { name: "Créer de nouveaux codes de secours" }).click()
  await expect(card.getByRole("heading", { level: 3, name: "Vos codes de secours" })).toBeFocused()
  await expect(card.locator("ol li")).toHaveCount(10)
  await card.getByRole("button", { name: "Terminé" }).click()
  await expect(card).toContainText("Codes de secours restants : 10 sur 10.")
  await context.close()
})
