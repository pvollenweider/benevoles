// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { execFileSync } from "node:child_process"
import { expect, type Page } from "@playwright/test"

/**
 * Sign-in of the seeded super admin, second factor included (pentest F6): password on the login
 * page, then a current code of the account's app, from scripts/e2e-super-admin-totp.ts (which
 * enrols the account on first use). Specs that test the second factor itself drive it by hand.
 */

export const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
export const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

/** A current code of the super admin's app (the account is enrolled on first use). */
export function superAdminCode(email = SUPER_ADMIN_EMAIL): string {
  return execFileSync("npx", ["tsx", "scripts/e2e-super-admin-totp.ts", "code", email], { encoding: "utf8" }).trim()
}

/** Clears the super admin's second factor: the next sign-in enrols again. */
export function resetSuperAdminSecondFactor(email = SUPER_ADMIN_EMAIL): void {
  execFileSync("npx", ["tsx", "scripts/e2e-super-admin-totp.ts", "reset", email], { stdio: "inherit" })
}

/** Gives the code on the two-factor page the browser is on (or about to land on). */
export async function passSecondFactor(page: Page, email = SUPER_ADMIN_EMAIL): Promise<void> {
  await expect(page).toHaveURL(/\/admin\/two-factor/)
  const code = superAdminCode(email)
  await page.getByLabel("Code à 6 chiffres").fill(code)
  await page.getByRole("button", { name: "Valider" }).click()
  await expect(page).not.toHaveURL(/\/admin\/two-factor/)
}

/** Password then second factor, from the login page (or a page that sent there). */
export async function signInSuperAdmin(page: Page, options: { goto?: boolean; email?: string; password?: string } = {}): Promise<void> {
  const email = options.email ?? SUPER_ADMIN_EMAIL
  if (options.goto !== false) await page.goto("/admin/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Mot de passe").fill(options.password ?? SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await passSecondFactor(page, email)
}
