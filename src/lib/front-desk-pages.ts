// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Which pages a front-desk session (#1142) may open. Pure, no Prisma: also imported by
 * src/proxy.ts. The role has no admin level (src/lib/permissions.ts). It opens exactly three kinds
 * of page under /admin, nothing else:
 * - its own landing page (FRONT_DESK_HOME);
 * - the day-of page of an event it holds a grant on (FRONT_DESK_EVENT_PREFIX); this rule only
 *   lets the path through, the page itself reads the grant and refuses without one;
 * - the pages that need no session (SESSIONLESS_ADMIN_PAGES): sign-in and the single-use links
 *   sent by email. Each asks for its own credentials or token and answers the same to a
 *   signed-out visitor, so being signed in as front desk gains nothing there; sending such a
 *   session away would only stop the person from following a password-reset link.
 * Every other page of the admin and super-admin spaces is refused. The rule is applied three
 * times, each on its own: the proxy (from the token, before any render), the admin layout (no
 * navigation, no organisation data), and every page's own loader (its own grant check here,
 * getOrgContext in src/lib/auth-guard.ts elsewhere).
 */

/** The one admin page of a front-desk session. */
export const FRONT_DESK_HOME = "/admin/front-desk"

/** The day-of page of one event, in its own route: `/admin/front-desk/events/<id>`. */
export const FRONT_DESK_EVENT_PREFIX = `${FRONT_DESK_HOME}/events/`

/** Whether `path` is exactly the day-of page of one event (one non-empty segment, nothing after). */
function isFrontDeskEventPage(path: string): boolean {
  if (!path.startsWith(FRONT_DESK_EVENT_PREFIX)) return false
  const eventId = path.slice(FRONT_DESK_EVENT_PREFIX.length)
  return eventId.length > 0 && !eventId.includes("/")
}

/**
 * Pages that need no session at all (sign-in, and the single-use links sent by email): kept
 * reachable for a signed-in front-desk account on purpose, see above. The same list as the
 * proxy's public admin pages plus the login page (a test compares them). The admin layout still
 * renders them without navigation for that role.
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
 * stay: its landing page for every page of the admin and super-admin spaces but that page itself,
 * one event's day-of page and the session-less ones. Exact matches only: a path that merely
 * starts like an allowed one (« /admin/front-desk/x », « /admin/front-desk/events/a/b »,
 * « /admin/login/x ») is sent to the landing page. Paths outside the two spaces (the public site)
 * are not this rule's business.
 */
export function frontDeskRedirect(pathname: string): string | null {
  const path = pathname.split(/[?#]/, 1)[0]
  if (!isAdminSpacePath(path)) return null
  if (path === FRONT_DESK_HOME || isFrontDeskEventPage(path) || SESSIONLESS_ADMIN_PAGES.includes(path)) return null
  return FRONT_DESK_HOME
}
