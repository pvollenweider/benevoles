// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * NEXT_PUBLIC_APP_URL as the running server sees it, read on every call. Never a module constant
 * and never `process.env.NEXT_PUBLIC_APP_URL` written out: the build inlines that expression (even
 * through `const env = process.env`) with the value it sees, and the Docker image is built without
 * it (it only exists in the running container), so a value frozen at build gave
 * `http://localhost:3000` in the canonical and Open Graph URLs of every prerendered page. A lookup
 * by a name passed as an argument is left to run time. The pages themselves are rendered per
 * request (src/app/layout.tsx, `connection()`).
 */
function runtimeEnv(name: string): string | undefined {
  return process.env[name]
}

function appUrl(): string {
  return (runtimeEnv("NEXT_PUBLIC_APP_URL") || "http://localhost:3000").replace(/\/+$/, "")
}

/** The apex (marketing and documentation) base URL, e.g. https://www.benevol.app. */
export function apexBaseUrl(): string {
  return appUrl()
}

// Returns the base URL for a given org subdomain.
// Production: https://lausanne-rocks.benevol.app
// Dev (localhost): http://localhost:3000  (subdomains not available locally)
export function orgBaseUrl(orgSlug: string): string {
  const APP_URL = appUrl()
  if (APP_URL.includes("localhost")) return APP_URL
  const url = new URL(APP_URL)
  const baseDomain = url.hostname.replace(/^www\./, "")
  return `${url.protocol}//${orgSlug}.${baseDomain}`
}

export function eventPublicUrl(orgSlug: string, eventSlug: string): string {
  const APP_URL = appUrl()
  if (APP_URL.includes("localhost")) return `${APP_URL}/${eventSlug}?org=${orgSlug}`
  return `${orgBaseUrl(orgSlug)}/${eventSlug}`
}

/** An organisation's own sitemap; locally, without subdomains, the apex one scoped by `?org=`. */
export function orgSitemapUrl(orgSlug: string): string {
  const APP_URL = appUrl()
  if (APP_URL.includes("localhost")) return `${APP_URL}/sitemap.xml?org=${encodeURIComponent(orgSlug)}`
  return `${orgBaseUrl(orgSlug)}/sitemap.xml`
}

// Whether a request host belongs to this deployment's own domain (production base domain,
// any of its subdomains, or localhost in dev) — as opposed to a staging mirror, a preview
// deployment, or an unrelated host. Used by robots.ts to avoid indexing anything outside
// the app's own production domain.
export function isKnownHost(hostname: string): boolean {
  const APP_URL = appUrl()
  if (APP_URL.includes("localhost")) return hostname === "localhost" || hostname.endsWith(".localhost")
  const prodHost = new URL(APP_URL).hostname.replace(/^www\./, "")
  return hostname === prodHost || hostname.endsWith(`.${prodHost}`)
}
