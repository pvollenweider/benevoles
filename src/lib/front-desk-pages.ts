// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Which pages a front-desk session (#1142) may open. Pure, no Prisma: also imported by
 * src/proxy.ts. The role has no admin level (src/lib/permissions.ts): of the admin, it opens its
 * own landing page and nothing else. The rule is applied three times, each on its own: the proxy
 * (from the token, before any render), the admin layout (no navigation, no organisation data),
 * and every page's own loader (getOrgContext in src/lib/auth-guard.ts, the account page).
 */

/** The one admin page of a front-desk session. */
export const FRONT_DESK_HOME = "/admin/front-desk"

/**
 * Pages that need no session at all (sign-in, and the single-use links sent by email): they work
 * the same signed out, so a signed-in front-desk account is not sent away from them. The admin
 * layout still renders them without navigation for that role.
 */
export const SESSIONLESS_ADMIN_PAGES: readonly string[] = [
  "/admin/login",
  "/admin/accept-invite",
  "/admin/reset-password",
  "/admin/forgot-password",
  "/admin/reactivate",
  "/admin/reactivate/confirm",
  "/admin/keep",
]

/** Whether `pathname` (no query) is a page under /admin or /super-admin. */
function isAdminSpacePath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/super-admin" || pathname.startsWith("/super-admin/")
}

/**
 * Where a front-desk session asking for `pathname` must be sent instead, or null when it may
 * stay: its landing page for every page of the admin and super-admin spaces but that page itself
 * and the session-less ones. Exact matches only: a path that merely starts like an allowed one
 * (« /admin/front-desk/x », « /admin/login/x ») is sent to the landing page. Paths outside the
 * two spaces (the public site) are not this rule's business.
 */
export function frontDeskRedirect(pathname: string): string | null {
  const path = pathname.split(/[?#]/, 1)[0]
  if (!isAdminSpacePath(path)) return null
  if (path === FRONT_DESK_HOME || SESSIONLESS_ADMIN_PAGES.includes(path)) return null
  return FRONT_DESK_HOME
}
