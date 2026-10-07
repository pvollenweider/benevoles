// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The bare domain (benevol.app) served every page in 200 next to www.benevol.app, the canonical
 * site (#759): duplicates for search engines. When the site's address is a www host, a request to
 * the bare domain gets the same path and query on that address. Pure, so the proxy only wires it.
 *
 * Returns null when nothing should change: another host (www, an organization's subdomain,
 * localhost) or a site address without « www. ».
 */
export function apexRedirectUrl(host: string, pathAndQuery: string, appUrl: string): string | null {
  let canonical: URL
  try {
    canonical = new URL(appUrl)
  } catch {
    return null
  }
  if (!canonical.hostname.startsWith("www.")) return null
  const bare = canonical.hostname.slice("www.".length)
  if (host.split(":")[0].toLowerCase() !== bare) return null
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`
  return `${canonical.origin}${path}`
}
