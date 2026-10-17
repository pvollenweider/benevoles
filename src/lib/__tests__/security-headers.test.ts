import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "fs"
import { join } from "path"
import {
  APP_TOP_LEVEL_SEGMENTS,
  FRAME_DENY_HEADERS,
  FRAME_EMBED_HEADERS,
  SECURITY_HEADERS,
  frameHeaders,
  isEventSignupPath,
  scriptPolicyReportOnly,
  securityHeaders,
} from "../security-headers"

// Framing (#948): only the embeddable sign-up may be shown in another site's frame.

function headersOf(pathAndQuery: string) {
  const url = new URL(pathAndQuery, "https://club.benevol.app")
  return Object.fromEntries(frameHeaders(url.pathname, url.searchParams).map((h) => [h.key, h.value]))
}

const DENY = { "Content-Security-Policy": "frame-ancestors 'none'", "X-Frame-Options": "DENY" }
const EMBED = { "Content-Security-Policy": "frame-ancestors *" }

describe("frameHeaders, per route family", () => {
  it("lets any site frame the embeddable sign-up and its confirmation, with no X-Frame-Options", () => {
    for (const path of [
      "/fete-du-village?embed=1",
      "/fete-du-village?groupe=abcd2345&embed=1",
      "/fete-du-village?org=club&embed=1",
      "/fete-du-village/success?token=abc&embed=1",
      "/fete-du-village/?embed=1",
    ]) expect(headersOf(path), path).toEqual(EMBED)
  })

  it("refuses the public event page and its confirmation without embed=1", () => {
    for (const path of ["/fete-du-village", "/fete-du-village?embed=0", "/fete-du-village?embed=true", "/fete-du-village/success?token=abc"]) {
      expect(headersOf(path), path).toEqual(DENY)
    }
  })

  it("refuses an event's information pages, even with embed=1 (they open in a new tab)", () => {
    expect(headersOf("/fete-du-village/infos-pratiques?embed=1")).toEqual(DENY)
  })

  it("refuses the admin, super admin, personal, leader, sign-in, waitlist and API routes, embed=1 or not", () => {
    for (const path of [
      "/admin", "/admin?embed=1", "/admin/events/abc", "/admin/login?embed=1", "/admin/accept-invite?embed=1",
      "/super-admin?embed=1",
      "/my/token123", "/my/token123?embed=1", "/my?embed=1",
      "/leader/token123?embed=1", "/leader?embed=1",
      "/waitlist/confirm?embed=1", "/waitlist?embed=1",
      "/api/health?embed=1", "/api?embed=1", "/api/public/registrations?embed=1", "/api/auth/session?embed=1",
      "/monitoring?embed=1",
    ]) expect(headersOf(path), path).toEqual(DENY)
  })

  it("refuses the site's own pages (marketing, docs, legal) and the organisation's home", () => {
    for (const path of [
      "/", "/?embed=1", "/fonctionnalites?embed=1", "/doc?embed=1", "/doc/admin", "/legal?embed=1", "/legal/privacy",
      "/blog?embed=1", "/videos?embed=1", "/nouveautes?embed=1", "/inscription?embed=1", "/accessibilite?embed=1",
      "/logiciel-planning-benevoles?embed=1", "/product-updates?embed=1", "/robots.txt?embed=1", "/llms.txt?embed=1",
      "/_next/data?embed=1",
    ]) expect(headersOf(path), path).toEqual(DENY)
  })

  it("keeps the two header sets as documented", () => {
    expect(FRAME_DENY_HEADERS).toEqual([
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Frame-Options", value: "DENY" },
    ])
    expect(FRAME_EMBED_HEADERS).toEqual([{ key: "Content-Security-Policy", value: "frame-ancestors *" }])
  })
})

describe("APP_TOP_LEVEL_SEGMENTS", () => {
  it("names every top-level page folder of src/app, so none of them is taken for an event", () => {
    const folders = readdirSync(join(process.cwd(), "src/app"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("[") && !d.name.startsWith("(") && !d.name.includes("."))
      .map((d) => d.name)
    for (const folder of folders) expect(APP_TOP_LEVEL_SEGMENTS, folder).toContain(folder)
    for (const folder of folders) expect(isEventSignupPath(`/${folder}`), folder).toBe(false)
  })

  it("names the Sentry tunnel of next.config.ts", () => {
    const tunnel = readFileSync(join(process.cwd(), "next.config.ts"), "utf8").match(/tunnelRoute: "\/([^"]+)"/)![1]
    expect(APP_TOP_LEVEL_SEGMENTS).toContain(tunnel)
  })
})

describe("the proxy sets them", () => {
  it("applies frameHeaders to the response it lets through", () => {
    const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8")
    expect(proxy).toMatch(/frameHeaders\(pathname, req\.nextUrl\.searchParams\)\) response\.headers\.set\(key, value\)/)
  })
})

// #1052: nosniff, Permissions-Policy and a report-only script policy.

function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(policy.split(";").map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]))
}

describe("SECURITY_HEADERS (next.config.ts, every response)", () => {
  const byKey = Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]))

  it("keeps Referrer-Policy strict-origin and adds nosniff", () => {
    expect(byKey["Referrer-Policy"]).toBe("strict-origin")
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff")
  })

  it("turns off only device features the app never uses", () => {
    expect(byKey["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=(), payment=(), usb=()")
  })

  it("never restricts what the app uses: clipboard, share sheet, full screen, picture-in-picture, autoplay", () => {
    for (const feature of ["clipboard-write", "clipboard-read", "web-share", "fullscreen", "picture-in-picture", "autoplay"]) {
      expect(byKey["Permissions-Policy"], feature).not.toContain(feature)
    }
  })

  it("adds the script policy in report-only mode, never as an enforced CSP", () => {
    expect(byKey["Content-Security-Policy-Report-Only"]).toBe(scriptPolicyReportOnly({ dev: false }))
    expect(byKey["Content-Security-Policy"]).toBeUndefined()
  })

  it("leaves framing to the proxy's per-request decision", () => {
    expect(byKey["X-Frame-Options"]).toBeUndefined()
    for (const { value } of SECURITY_HEADERS) expect(value).not.toContain("frame-ancestors")
  })

  it("is the same set in development but for the policy's 'unsafe-eval'", () => {
    const dev = Object.fromEntries(securityHeaders({ dev: true }).map((h) => [h.key, h.value]))
    expect(Object.keys(dev)).toEqual(Object.keys(byKey))
    expect(dev["Content-Security-Policy-Report-Only"]).toBe(scriptPolicyReportOnly({ dev: true }))
  })
})

describe("scriptPolicyReportOnly", () => {
  it("allows the app's own scripts and inline scripts, and refuses plugins and a foreign <base>", () => {
    const d = directives(scriptPolicyReportOnly({ dev: false }))
    expect(d["script-src"]).toEqual(["'self'", "'unsafe-inline'"])
    expect(d["worker-src"]).toEqual(["'self'", "blob:"])
    expect(d["object-src"]).toEqual(["'none'"])
    expect(d["base-uri"]).toEqual(["'self'"])
  })

  it("carries no nonce or hash, which would make browsers ignore 'unsafe-inline'", () => {
    expect(scriptPolicyReportOnly({ dev: false })).not.toMatch(/'(nonce|sha256|sha384|sha512)-/)
  })

  it("adds 'unsafe-eval' in development only", () => {
    expect(directives(scriptPolicyReportOnly({ dev: true }))["script-src"]).toContain("'unsafe-eval'")
    expect(directives(scriptPolicyReportOnly({ dev: false }))["script-src"]).not.toContain("'unsafe-eval'")
  })

  it("sends reports nowhere and never touches framing", () => {
    const policy = scriptPolicyReportOnly({ dev: true })
    expect(policy).not.toMatch(/report-(uri|to)/)
    expect(policy).not.toContain("frame-ancestors")
  })
})

describe("next.config.ts", () => {
  it("sets securityHeaders on every path, in development with the development policy", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8")
    expect(config).toContain('source: "/:path*", headers: [...securityHeaders({ dev: process.env.NODE_ENV === "development" })]')
  })
})
