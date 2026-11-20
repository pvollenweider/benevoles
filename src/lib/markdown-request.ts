// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NOT_FOUND_ROUTE } from "@/lib/server-not-found"
import { isKnownHost } from "@/lib/urls"

/**
 * Where a `.md` request goes (src/proxy.ts): the internal route `src/app/md/[...path]/route.ts`
 * on the apex site, the site's 404 everywhere else. Pure, so the host rule is tested without the
 * proxy's auth and database imports.
 */

/** The internal prefix of the Markdown route; it is never a page address of its own. */
export const MARKDOWN_ROUTE_PREFIX = "/md"

/**
 * Whether a host serves the Markdown variants: the apex site only, as /llms.txt (the same rule as
 * src/lib/llms-sources.ts). An organisation's host, staging and an unknown host get a 404.
 */
export function servesMarkdown(host: string, hasOrg: boolean): boolean {
  const hostname = host.split(":")[0]
  return !hasOrg && isKnownHost(hostname) && !hostname.startsWith("staging.")
}

/**
 * The path a `.md` request is rewritten to: the internal Markdown route on the apex host, the
 * route no page matches (the site's 404) on an organisation's host, staging or an unknown host.
 * Null when the path is not a Markdown variant at all; the internal prefix requested directly is
 * always the 404.
 */
export function markdownRequestTarget(pathname: string, host: string, hasOrg: boolean): string | null {
  // The internal route is never an address of its own, whatever its encoding (`/md/x%2Emd`
  // decodes to `x.md` in the route's parameters): a direct request gets the site's 404.
  if (pathname === MARKDOWN_ROUTE_PREFIX || pathname.startsWith(`${MARKDOWN_ROUTE_PREFIX}/`)) return NOT_FOUND_ROUTE
  if (!pathname.endsWith(".md")) return null
  return servesMarkdown(host, hasOrg) ? `${MARKDOWN_ROUTE_PREFIX}${pathname}` : NOT_FOUND_ROUTE
}
