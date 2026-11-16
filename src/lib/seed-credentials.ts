// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { passwordErrors } from "./password"

export type SeedPasswords = { superAdminPassword: string; orgAdminPassword: string }

/**
 * The passwords prisma/seed.ts gives the super admin and the default organisation's admin.
 *
 * In development and tests, the documented defaults (`change-me`, or the values of
 * .env.development.example) keep working. With NODE_ENV=production, both passwords must be set
 * explicitly and follow the password policy that every other way of setting a password enforces:
 * a seed run by hand on a server must never leave a known or weak password behind. Checked before
 * the seed writes anything.
 */
export function seedPasswords(env: Record<string, string | undefined>): SeedPasswords | { error: string } {
  const superAdminPassword = env.ADMIN_PASSWORD
  const orgAdminPassword = env.ORG_ADMIN_PASSWORD
  if (env.NODE_ENV !== "production") {
    const superAdmin = superAdminPassword ?? "change-me"
    return { superAdminPassword: superAdmin, orgAdminPassword: orgAdminPassword ?? superAdmin }
  }
  const problems: string[] = []
  for (const [name, value] of [["ADMIN_PASSWORD", superAdminPassword], ["ORG_ADMIN_PASSWORD", orgAdminPassword]] as const) {
    if (!value) problems.push(`${name} n'est pas défini`)
    else {
      const errors = passwordErrors(value)
      if (errors.length > 0) problems.push(`${name} ne respecte pas les règles : ${errors.join(", ").toLowerCase()}`)
    }
  }
  if (problems.length > 0) return { error: `Seed refusé en production : ${problems.join(" ; ")}.` }
  return { superAdminPassword: superAdminPassword!, orgAdminPassword: orgAdminPassword! }
}
