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
  return `${orgBaseUrl(orgSlug)}/${eventSlug}`
}
