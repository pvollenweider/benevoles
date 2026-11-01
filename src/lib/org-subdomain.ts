// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Subdomains that never identify an organization (system/infra hostnames),
// shared between the proxy (org-slug injection) and robots.ts (crawl rules) so the
// two never drift apart.
// "medias" serves the video tutorials (k8s/media.yaml) from its own host.
export const NON_ORG_SUBDOMAINS = new Set(["www", "app", "admin", "api", "staging", "medias"])

/**
 * The comparison key of a name against the reserved list (#642): case, accents, hyphens and one
 * trailing « s » removed, so « Medias », « média », « w-w-w » or « apis » are caught as variants.
 * Routing keeps the exact list (DNS names are exact); only organization creation and renaming
 * refuse the variants.
 */
function reservedKey(slug: string): string {
  return slug.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/-/g, "").replace(/s$/, "")
}

const RESERVED_KEYS = new Set([...NON_ORG_SUBDOMAINS].map(reservedKey))

/** A slug that would collide with (a variant of) one of benevol.app's own subdomains: never an organization's. */
export function isReservedOrgSlug(slug: string): boolean {
  return RESERVED_KEYS.has(reservedKey(slug))
}

/** The refusal shown when an organization slug is one of the reserved subdomains. */
export const RESERVED_SLUG_ERROR = "Cette adresse est réservée par le service. Choisissez-en une autre."

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

/** A machine-local host (localhost, *.localhost, a loopback address), with or without a port. */
export function isLocalHost(host: string): boolean {
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0]
  const name = hostname.toLowerCase()
  return name === "localhost" || name.endsWith(".localhost") || name === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name)
}

/**
 * Whether `?org=` may choose the organization: a convenience for development, tests and local
 * runs (no subdomains on localhost), never on a public host in production, where the organization
 * comes from the host only and the apex (also the admin origin) never renders a tenant's pages.
 */
export function orgQueryAllowed(host: string, nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production" || isLocalHost(host)
}

/**
 * The headers handed to pages and API routes (#541). Any x-org-slug the client sent is removed
 * first (header names are case-insensitive, and every value goes), so the header only ever holds
 * what the proxy resolved: the organization of the host, or else `?org=` where it is allowed
 * (orgQueryAllowed). Public routes scope their data with it and trust it as such.
 */
export function withOrgHeader(source: Headers, host: string, orgQuery: string | null, nodeEnv?: string): Headers {
  const headers = new Headers(source)
  headers.delete(ORG_HEADER)
  const orgSlug = orgSlugFromHost(host) ?? (orgQuery && orgQueryAllowed(host, nodeEnv) ? orgQuery : null)
  if (orgSlug) headers.set(ORG_HEADER, orgSlug)
  return headers
}
