// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What the browser Sentry SDK records besides errors (#773). Pure and dependency-free: imported by
 * instrumentation-client.ts, which every page loads.
 *
 * Errors are always reported, on every page. Performance traces and session replays only on the
 * organizer and super-admin back offices, where they help debug real work: on a public page (home,
 * documentation, videos, event page) they sent a request to /monitoring on page views where nothing
 * went wrong, and the replay recorder alone was about half of the JavaScript shared by every page.
 */

const STAFF_PREFIXES = ["/admin", "/super-admin"]

/** `/admin`, `/admin/...`, `/super-admin`, `/super-admin/...` (not `/administration`). */
export function isStaffPath(pathname: string): boolean {
  return STAFF_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** Share of page loads and navigations traced (was 0.1 everywhere before #773). */
export const STAFF_TRACES_SAMPLE_RATE = 0.1

/**
 * Sample rate of a pageload or navigation span. `name` is the span name the SDK passes to
 * `tracesSampler` (a path or a route such as `/admin/events/[id]`); when it is not a path, the
 * current location decides.
 */
export function tracesSampleRateFor(name: string | undefined, currentPathname: string): number {
  const path = name?.startsWith("/") ? name : currentPathname
  return isStaffPath(path) ? STAFF_TRACES_SAMPLE_RATE : 0
}

/** Session replay is loaded (on demand, in its own chunk) only on back-office pages. */
export function wantsReplay(pathname: string): boolean {
  return isStaffPath(pathname)
}

/** Path part of an href given to `onRouterTransitionStart` (absolute or relative). */
export function pathnameOf(href: string): string {
  try {
    return new URL(href, "http://localhost").pathname
  } catch {
    return "/"
  }
}
