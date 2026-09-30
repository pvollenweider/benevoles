import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { SECURITY_HEADERS } from "../security-headers"
import { scrubUrl } from "../sentry-scrub"

// Personal tokens never reach the proxy's access log (#485): the routes carrying one have their
// access logs off (k8s/ingressroute-tokens.yaml), and no Referer carries a path.
const manifest = readFileSync(join(process.cwd(), "k8s/ingressroute-tokens.yaml"), "utf8")
const workflow = readFileSync(join(process.cwd(), ".github/workflows/deploy.yml"), "utf8")
const FAKE = "fake-value-for-tests-0000"
const q = (key: string) => `?${key}=${FAKE}`

// Every request shape that carries a token, as the app builds them.
const TOKEN_URLS = [
  `/my/${FAKE}`,
  `/waitlist/${FAKE}/confirm`,
  `/leader/${FAKE}`,
  `/api/public/registrations/${FAKE}`,
  `/api/public/registrations/${FAKE}/calendar`,
  `/api/public/member-invite/${FAKE}`,
  `/api/public/leader/${FAKE}`,
  `/api/public/waitlist/${FAKE}/confirm`,
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

  it("covers every family the error reports scrub (sentry-scrub.ts)", () => {
    for (const url of TOKEN_URLS) expect(scrubUrl(url), url).not.toContain(FAKE)
    // A token family added to the Sentry scrubbing must be added to the IngressRoute too.
    for (const family of ["my", "waitlist", "member-invite", "registrations", "leader"]) {
      expect(prefixes.some((p) => p.endsWith(`/${family}/`)), family).toBe(true)
    }
    expect(queryKeys.sort()).toEqual(["t", "token"])
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
