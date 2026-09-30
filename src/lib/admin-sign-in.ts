// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Whether an admin account's organization lets it sign in. The super admin has no organization
 * (cross-tenant). Any other account needs an active one: a disabled organization locks its admins
 * out, and an account whose organization is gone (organizationId set to NULL) has nothing left to
 * administer, so it must not get a session either.
 */
export function organizationAllowsSignIn(user: { role: string; organization: { active: boolean } | null }): boolean {
  if (user.role === "super_admin") return true
  return user.organization?.active === true
}
