// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Subdomains that never identify an organization (system/infra hostnames),
// shared between the proxy (org-slug injection) and robots.ts (crawl rules) so the
// two never drift apart.
export const NON_ORG_SUBDOMAINS = new Set(["www", "app", "admin", "api", "staging"])

// Extracts an org slug from a `[orgSlug].benevol.app` host, or null when the host doesn't
// carry one (apex domain, a system subdomain, or a bare hostname like localhost).
export function orgSlugFromHost(host: string): string | null {
  const hostname = host.split(":")[0]
  const parts = hostname.split(".")
  if (parts.length !== 3) return null
  const [subdomain] = parts
  return NON_ORG_SUBDOMAINS.has(subdomain) ? null : subdomain
}

/** The request header carrying the current organization, set by the proxy only. */
export const ORG_HEADER = "x-org-slug"

/**
 * The headers handed to pages and API routes (#541). Any x-org-slug the client sent is removed
 * first (header names are case-insensitive, and every value goes), so the header only ever holds
 * what the proxy resolved: the organization of the host, or else `?org=` (no org subdomain:
 * the apex, localhost). Public routes scope their data with it and trust it as such.
 */
export function withOrgHeader(source: Headers, host: string, orgQuery: string | null): Headers {
  const headers = new Headers(source)
  headers.delete(ORG_HEADER)
  const orgSlug = orgSlugFromHost(host) ?? (orgQuery || null)
  if (orgSlug) headers.set(ORG_HEADER, orgSlug)
  return headers
}
