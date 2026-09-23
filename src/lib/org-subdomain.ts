// Subdomains that never identify an organization (system/infra hostnames),
// shared between the middleware (org-slug injection) and robots.ts (crawl rules) so the
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
