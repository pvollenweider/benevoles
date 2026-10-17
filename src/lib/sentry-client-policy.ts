// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { scrubUrl } from "@/lib/sentry-scrub"

/**
 * What the browser Sentry SDK records besides errors (#773). Pure: imported by
 * instrumentation-client.ts, which every page loads (sentry-scrub.ts only brings a few regexes).
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

/**
 * The pages under /admin a visitor reaches without a session (src/proxy.ts), several of them from
 * an emailed link whose one-time token is in the query string (password reset, invitation, keep or
 * reactivate a space). Never replayed (#1042): the recorder keeps the page address as it is, and
 * the token would reach Sentry while it is still valid.
 */
const PUBLIC_ADMIN_PAGES = new Set([
  "/admin/login",
  "/admin/forgot-password",
  "/admin/reset-password",
  "/admin/accept-invite",
  "/admin/reactivate",
  "/admin/reactivate/confirm",
  "/admin/keep",
])

function normalizedPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
}

/** Whether an address carries an access token (or an email address), raw or percent-encoded. */
export function urlCarriesSecret(href: string): boolean {
  if (scrubUrl(href) !== href) return true
  try {
    const decoded = decodeURIComponent(href)
    return scrubUrl(decoded) !== decoded
  } catch {
    // Malformed escape: cannot be checked, so treated as unsafe.
    return true
  }
}

/**
 * Whether session replay may record this address (absolute or relative href). Only the signed-in
 * back office, and never an address that carries a token (#1042). Decided before the recorder
 * starts, and again at every navigation.
 */
export function replayAllowedFor(href: string): boolean {
  const pathname = normalizedPath(pathnameOf(href))
  if (!isStaffPath(pathname) || PUBLIC_ADMIN_PAGES.has(pathname)) return false
  return !urlCarriesSecret(href)
}

/** Path part of an href given to `onRouterTransitionStart` (absolute or relative). */
export function pathnameOf(href: string): string {
  try {
    return new URL(href, "http://localhost").pathname
  } catch {
    return "/"
  }
}
