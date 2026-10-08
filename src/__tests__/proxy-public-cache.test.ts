import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest, type NextFetchEvent } from "next/server"
import { PUBLIC_PAGE_CACHE } from "@/lib/public-cache"

// The proxy itself (#773, #759 F3): an anonymous visit to a public content page gets no Auth.js
// cookie and a cacheable response; the admin, the login page and organisations keep Auth.js (and
// its CSRF cookie) exactly as before.
type Proxy = (req: NextRequest, event: NextFetchEvent) => Promise<Response> | Response

let proxy: Proxy
const event = { waitUntil: () => {} } as unknown as NextFetchEvent

beforeAll(async () => {
  vi.stubEnv("AUTH_SECRET", "test-secret-for-the-proxy-test-32-characters")
  vi.stubEnv("AUTH_TRUST_HOST", "true")
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.benevol.app")
  proxy = (await import("@/proxy")).default as Proxy
})
afterAll(() => vi.unstubAllEnvs())

// The Host header, as a browser sends it (a bare NextRequest has none).
const get = (url: string, headers: Record<string, string> = {}) => proxy(new NextRequest(url, { headers: { host: new URL(url).host, ...headers } }), event)
const setCookies = (res: Response) => res.headers.getSetCookie()

describe("proxy: anonymous public content pages", () => {
  it("sets no cookie and a cacheable Cache-Control", async () => {
    for (const path of ["/", "/doc", "/doc/admin", "/nouveautes", "/fonctionnalites", "/videos", "/accessibilite", "/legal/privacy"]) {
      const res = await get(`https://www.benevol.app${path}`)
      expect(setCookies(res), path).toEqual([])
      expect(res.headers.get("cache-control"), path).toBe(PUBLIC_PAGE_CACHE)
      // Handed on to the page (NextResponse.next), not answered by the proxy.
      expect(res.headers.get("x-middleware-next"), path).toBe("1")
    }
  })

  it("strips an x-org-slug sent by the client, as before (#541)", async () => {
    const res = await get("https://www.benevol.app/", { "x-org-slug": "intruder" })
    expect(res.headers.get("x-middleware-request-x-org-slug")).toBeNull()
  })

  it("still redirects the bare domain to www, without a cookie", async () => {
    const res = await get("https://benevol.app/doc")
    expect(res.status).toBe(308)
    expect(res.headers.get("location")).toBe("https://www.benevol.app/doc")
    expect(setCookies(res)).toEqual([])
  })
})

describe("proxy: everything else still goes through Auth.js", () => {
  it("gives the login page its CSRF cookie and no cache override", async () => {
    const res = await get("https://www.benevol.app/admin/login")
    expect(setCookies(res).some((c) => c.includes("authjs.csrf-token"))).toBe(true)
    expect(res.headers.get("cache-control")).toBeNull()
  })

  it("sends an anonymous admin visit to the login page", async () => {
    const res = await get("https://www.benevol.app/admin/events")
    expect([302, 307]).toContain(res.status)
    expect(res.headers.get("location")).toContain("/admin/login")
  })

  it("sends an anonymous super-admin visit to the login page", async () => {
    const res = await get("https://www.benevol.app/super-admin")
    expect(res.headers.get("location")).toContain("/admin/login")
  })

  it("never makes an organisation's page cacheable", async () => {
    for (const url of ["https://lausanne-rocks.benevol.app/", "https://lausanne-rocks.benevol.app/doc", "https://www.benevol.app/?org=lausanne-rocks"]) {
      const res = await get(url)
      expect(res.headers.get("cache-control"), url).toBeNull()
    }
  })

  it("never makes a signed-in visitor's page cacheable", async () => {
    const res = await get("https://www.benevol.app/doc", { cookie: "__Secure-authjs.session-token=not-a-valid-jwt" })
    expect(res.headers.get("cache-control")).toBeNull()
  })
})
