const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

// Returns the base URL for a given org subdomain.
// Production: https://lausanne-rocks.benevol.app
// Dev (localhost): http://localhost:3000  (subdomains not available locally)
export function orgBaseUrl(orgSlug: string): string {
  if (APP_URL.includes("localhost")) return APP_URL
  const url = new URL(APP_URL)
  const baseDomain = url.hostname.replace(/^www\./, "")
  return `${url.protocol}//${orgSlug}.${baseDomain}`
}

export function eventPublicUrl(orgSlug: string, eventSlug: string): string {
  if (APP_URL.includes("localhost")) return `${APP_URL}/${eventSlug}?org=${orgSlug}`
  return `${orgBaseUrl(orgSlug)}/${eventSlug}`
}

// Whether a request host belongs to this deployment's own domain (production base domain,
// any of its subdomains, or localhost in dev) — as opposed to a staging mirror, a preview
// deployment, or an unrelated host. Used by robots.ts to avoid indexing anything outside
// the app's own production domain.
export function isKnownHost(hostname: string): boolean {
  if (APP_URL.includes("localhost")) return hostname === "localhost" || hostname.endsWith(".localhost")
  const prodHost = new URL(APP_URL).hostname.replace(/^www\./, "")
  return hostname === prodHost || hostname.endsWith(`.${prodHost}`)
}
