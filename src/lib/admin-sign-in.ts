// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Whether an admin account's organization lets it sign in. The super admin has no organization
 * (cross-tenant). Any other account needs an active one: a disabled organization locks its admins
 * out, and an account whose organization is gone (organizationId set to NULL) has nothing left to
 * administer, so it must not get a session either. A suspended organisation never lets its admins
 * in, even if an inconsistent write had left it active: the suspension wins, until the super admin
 * lifts it.
 */
export function organizationAllowsSignIn(user: { role: string; organization: { active: boolean; suspendedAt?: Date | string | null } | null }): boolean {
  if (user.role === "super_admin") return true
  return user.organization?.active === true && !user.organization.suspendedAt
}
