import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "fs"
import { execFileSync } from "child_process"
import { join } from "path"
import { SECURITY_HEADERS } from "../security-headers"
import { scrubUrl } from "../sentry-scrub"

// Personal tokens never reach the proxy's access log (#485): the routes carrying one have their
// access logs off (k8s/ingressroute-tokens.yaml), and no Referer carries a path.
const manifest = readFileSync(join(process.cwd(), "k8s/ingressroute-tokens.yaml"), "utf8")
const workflow = readFileSync(join(process.cwd(), ".github/workflows/deploy.yml"), "utf8")
const FAKE = "fake-value-for-tests-0000"
const q = (key: string) => `?${key}=${FAKE}`

/**
 * Every route of the app router that takes a personal token in its path: a directory named after
 * a dynamic segment whose parameter is a token (`[token]`, `[...token]`, `[inviteToken]`…). Read
 * from src/app itself, so a new token family is covered by the checks below the day it is added.
 * Returns the URL prefix before the token (`/my/`, `/api/public/availability/`), route groups
 * `(x)` and parallel slots `@x` left out of the URL as Next.js does.
 */
function tokenRoutePrefixes(dir = join(process.cwd(), "src/app"), url: string[] = []): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const name = entry.name
    if (/^\[{1,2}(?:\.\.\.)?[^\]]*token[^\]]*\]{1,2}$/i.test(name)) found.push(`/${url.join("/")}/`.replace(/\/+/g, "/"))
    const inUrl = name.startsWith("(") || name.startsWith("@") ? url : [...url, name]
    found.push(...tokenRoutePrefixes(join(dir, name), inUrl))
  }
  return [...new Set(found)].sort()
}
const TOKEN_ROUTE_PREFIXES = tokenRoutePrefixes()

// Every request shape that carries a token, as the app builds them (the path families are also
// read from the app router above; the query ones only exist here).
const TOKEN_URLS = [
  `/my/${FAKE}`,
  `/waitlist/${FAKE}/confirm`,
  `/leader/${FAKE}`,
  `/api/public/registrations/${FAKE}`,
  `/api/public/registrations/${FAKE}/calendar`,
  `/api/public/registrations/${FAKE}/calendar.ics`,
  `/api/public/member-invite/${FAKE}`,
  `/api/public/leader/${FAKE}`,
  `/api/public/waitlist/${FAKE}/confirm`,
  `/disponibilites/${FAKE}`,
  `/api/public/availability/${FAKE}`,
  `/fete-du-village${q("token")}`,
  `/admin/accept-invite${q("token")}`,
  `/admin/reset-password${q("token")}`,
  `/api/public/product-updates/unsubscribe${q("token")}`,
  `/fete-du-village${q("t")}`,
]

/** The path prefixes, exact paths and query keys the IngressRoute exempts from access logs. */
const prefixes = [...manifest.matchAll(/PathPrefix\(`([^`]+)`\)/g)].map((m) => m[1])
const exact = [...manifest.matchAll(/[^x]Path\(`([^`]+)`\)/g)].map((m) => m[1])
const queryKeys = [...new Set([...manifest.matchAll(/QueryRegexp\(`([^`]+)`/g)].map((m) => m[1]))]

function exempt(url: string): boolean {
  const u = new URL(url, "https://org.benevol.app")
  return prefixes.some((p) => u.pathname.startsWith(p)) || exact.includes(u.pathname) || queryKeys.some((k) => (u.searchParams.get(k) ?? "") !== "")
}

describe("no personal token in the proxy access log", () => {
  it("every token-carrying request is routed with access logs off, over HTTPS and HTTP", () => {
    for (const url of TOKEN_URLS) expect(exempt(url), url).toBe(true)
    expect(manifest.match(/accessLogs: false/g)).toHaveLength(2)
    expect(manifest).toMatch(/entryPoints:\n\s+- websecure\n/)
    expect(manifest).toMatch(/entryPoints:\n\s+- web\n/)
  })

  it("finds the token routes in the app router", () => {
    // Sanity check of the scan itself: a page family and its API counterpart.
    expect(TOKEN_ROUTE_PREFIXES).toEqual(expect.arrayContaining(["/my/", "/api/public/registrations/", "/disponibilites/", "/api/public/availability/"]))
  })

  it("routes every [token] route of the app with access logs off, by path", () => {
    // By path, not by luck: a query key exempted for another reason must not hide a missing prefix.
    for (const prefix of TOKEN_ROUTE_PREFIXES) {
      expect(prefixes.some((p) => `${prefix}${FAKE}`.startsWith(p)), prefix).toBe(true)
      expect(TOKEN_URLS.some((u) => u.startsWith(`${prefix}${FAKE}`)), `${prefix} missing from TOKEN_URLS`).toBe(true)
    }
  })

  it("scrubs every [token] route from error reports too (sentry-scrub.ts)", () => {
    for (const prefix of TOKEN_ROUTE_PREFIXES) expect(scrubUrl(`${prefix}${FAKE}/x`), prefix).not.toContain(FAKE)
  })

  it("keeps every [token] page out of search engines (robots.ts)", () => {
    const robots = readFileSync(join(process.cwd(), "src/app/robots.ts"), "utf8")
    const disallow = [...robots.match(/const DISALLOW = \[([^\]]*)\]/)![1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    for (const prefix of TOKEN_ROUTE_PREFIXES) expect(disallow.some((d) => prefix.startsWith(d)), prefix).toBe(true)
  })

  it("covers every family the error reports scrub (sentry-scrub.ts)", () => {
    for (const url of TOKEN_URLS) expect(scrubUrl(url), url).not.toContain(FAKE)
    expect(queryKeys.filter((k) => !["q", "deleted", "tag", "next", "callbackUrl"].includes(k)).sort()).toEqual(["t", "token"])
  })

  it("never logs a search typed in the administration (?q= is often a name or an email)", () => {
    expect(queryKeys).toContain("q")
    for (const url of [
      "/admin/members?q=dupont", "/api/admin/members?q=jean%40example.org", "/admin/events/e1/registrations?q=marie", "/admin/search?q=x",
      "/admin/members?deleted=Marie%20Dupont", "/api/admin/members?tag=malade",
      "/admin/login?callbackUrl=%2Fadmin%2Fmembers%3Fq%3Dalice", "/super-admin/use-org/o1?next=%2Fadmin%2Fevents%3Fq%3Dx",
    ]) {
      expect(exempt(url), url).toBe(true)
    }
  })

  it("applies the same rule over HTTPS and HTTP", () => {
    const rules = [...manifest.matchAll(/match: >-\n([\s\S]*?)\n\s+observability:/g)].map((m) => m[1].replace(/\s+/g, " ").trim())
    expect(rules).toHaveLength(2)
    expect(rules[0]).toBe(rules[1])
  })

  it("routes every query-string secret the app builds through the unlogged router", () => {
    // Every `?<key>=${…}` written in src (links in emails, redirects): its key must be exempt, or be
    // listed here as carrying no secret and no personal data.
    const NOT_SECRET = new Set(["org", "groupe", "embed", "wizard", "shift", "role", "audience", "since", "verify", "edit", "tri", "ok", "creneau", "decline", "registration", "admin", "slug", "v", "with", "member", "demandes", "lien", "volunteer", "link", "format", "download", "from", "to", "cursor", "limit", "tag", "kind", "includeAll", "entityType", "entityId", "actorType", "actorId", "action", "chainOf", "until", "waitlist", "requested", "active", "lastName", "shifts", "color", "shiftId", "eventId", "id", "page", "view", "type", "status", "sort",
      // a batch of emails' id (#1101), behind the admin login: no secret, no personal data
      "envoi",
      // a draft assignment's revision and a cell's person and date (#1146, lot C), behind the admin login
      "revision", "volunteerId", "date",
      // the proposal run shown (#1172, `?run=`), behind the admin login: an id, no secret
      "run",
      // the database connection string's startup options (prisma-adapter.ts, #1172), never a request URL
      "options",
      // external links, never to this server: OpenStreetMap (map-link.ts), mailto subject
      "mlat", "mlon", "subject"])
    const files = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" }).split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__") && !f.includes("__integration__"))
    const keys = new Set<string>()
    for (const f of files) {
      const text = readFileSync(join(process.cwd(), f), "utf8")
      // `?key=${…}` in a template, and searchParams.set("key", …) / params.set("key", …)
      for (const m of text.matchAll(/[?&]([A-Za-z_]+)=\$\{/g)) keys.add(m[1])
      for (const m of text.matchAll(/\.set\(\s*"([A-Za-z_]+)",/g)) keys.add(m[1])
    }
    for (const key of keys) expect(queryKeys.includes(key) || NOT_SECRET.has(key), key).toBe(true)
  })

  it("ordinary pages stay logged", () => {
    for (const url of ["/", "/fete-du-village", "/admin/events", "/api/public/registrations", "/doc/admin", "/admin/members"]) {
      expect(exempt(url), url).toBe(false)
    }
  })

  it("takes precedence over the main Ingress, and is deployed with it", () => {
    const main = readFileSync(join(process.cwd(), "k8s/ingress.yaml"), "utf8")
    const mainPriority = Number(main.match(/router\.priority: "(\d+)"/)![1])
    const priorities = [...manifest.matchAll(/priority: (\d+)/g)].map((m) => Number(m[1]))
    expect(priorities).toHaveLength(2)
    for (const p of priorities) expect(p).toBeGreaterThan(mainPriority)
    expect(workflow).toContain("kubectl apply -f k8s/ingressroute-tokens.yaml")
  })

  it("no Referer carries a path", () => {
    expect(SECURITY_HEADERS).toContainEqual({ key: "Referrer-Policy", value: "strict-origin" })
  })
})
