// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { isApexOnlyPath } from "@/lib/apex-redirect"

/**
 * Links from an organisation's pages (its host, <slug>.benevol.app) to the site's own pages. An
 * organisation's host answers the apex-only pages (documentation, legal pages, accessibility,
 * videos, features, blog...) with a 308 to the site's address (#933), so a relative link there
 * cost every reader and every crawler one redirect: these links carry the site's address instead.
 * The organisers' sign-in goes there too: administration lives on the app's own domain (#559).
 * Everything else (the organisation's events, /my, /leader, /waitlist) stays relative, on the
 * organisation's host. Pure and browser-safe: the event page's client component renders the
 * footer with a base handed down by its server page.
 */

/** Paths that are not apex-only but still belong on the app's own domain: the administration (#559). */
const APP_DOMAIN_PATHS: readonly string[] = ["/admin"]

/**
 * The base of those links: the site's address, or null where an organisation has no host of its
 * own (no address configured, or localhost: one host, `?org=` scoping; a relative link then
 * reaches the same page without leaving the server in use).
 */
export function apexLinkBase(appUrl: string | null | undefined): string | null {
  if (!appUrl) return null
  let url: URL
  try {
    url = new URL(appUrl)
  } catch {
    return null
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || /^\d+(\.\d+){3}$/.test(url.hostname)) return null
  return url.origin
}

/** Whether a path belongs on the site's address rather than an organisation's host. */
export function belongsOnApex(path: string): boolean {
  const pathname = path.split(/[?#]/)[0]
  return isApexOnlyPath(pathname) || APP_DOMAIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * The href of a link from an organisation's page: on the site's address (`base`) for the site's
 * own pages, unchanged otherwise (an event, a personal page) or without a base. Absolute URLs are
 * left as they are.
 */
export function apexHref(path: string, base: string | null | undefined): string {
  if (!base || !path.startsWith("/") || path.startsWith("//") || !belongsOnApex(path)) return path
  return `${base.replace(/\/+$/, "")}${path}`
}

/** The site's home page from an organisation's page: on the site's address, else `/` (localhost: the apex home, no `?org=`). */
export function apexHomeHref(base: string | null | undefined): string {
  return base ? `${base.replace(/\/+$/, "")}/` : "/"
}
