import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "fs"
import { join } from "path"
import { createHash } from "crypto"
import {
  APP_TOP_LEVEL_SEGMENTS,
  INLINE_SCRIPT_HASHES,
  SECURITY_HEADERS,
  contentSecurityPolicy,
  createNonce,
  isEventSignupPath,
  pageSecurityHeaders,
} from "../security-headers"
import { CLEAN_PATH_SCRIPT } from "../clean-path"
import { INLINE_SCRIPTS, PRINT_BUTTON_SCRIPT, PRINT_BUTTON_SCRIPT_TAG, THEME_INIT_SCRIPT } from "../inline-scripts"

// Framing (#948): only the embeddable sign-up may be shown in another site's frame.

const NONCE = "bm9uY2Utb2YtdGhlLXRlc3Q="

function headersOf(pathAndQuery: string) {
  const url = new URL(pathAndQuery, "https://club.benevol.app")
  return Object.fromEntries(pageSecurityHeaders(url.pathname, url.searchParams, { nonce: NONCE, dev: false }).map((h) => [h.key, h.value]))
}

const DENY = { "Content-Security-Policy": contentSecurityPolicy({ nonce: NONCE, framable: false, dev: false }), "X-Frame-Options": "DENY" }
const EMBED = { "Content-Security-Policy": contentSecurityPolicy({ nonce: NONCE, framable: true, dev: false }) }

describe("pageSecurityHeaders: framing, per route family", () => {
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

  it("frames with frame-ancestors only: 'none' and X-Frame-Options, or * for the embed", () => {
    expect(directives(DENY["Content-Security-Policy"])["frame-ancestors"]).toEqual(["'none'"])
    expect(directives(EMBED["Content-Security-Policy"])["frame-ancestors"]).toEqual(["*"])
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
  const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8")

  it("draws a nonce per request and applies pageSecurityHeaders to the response it lets through", () => {
    expect(proxy).toMatch(/pageSecurityHeaders\(pathname, req\.nextUrl\.searchParams, \{ nonce: createNonce\(\), dev: process\.env\.NODE_ENV === "development" \}\)/)
    expect(proxy).toMatch(/for \(const \{ key, value \} of pageHeaders\) response\.headers\.set\(key, value\)/)
  })

  it("puts the policy on the forwarded request too, where Next.js reads the nonce", () => {
    expect(proxy).toMatch(/if \(key === "Content-Security-Policy"\) requestHeaders\.set\(key, value\)/)
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

  it("leaves the script and framing policy to the proxy's per-request header", () => {
    expect(byKey["Content-Security-Policy"]).toBeUndefined()
    expect(byKey["Content-Security-Policy-Report-Only"]).toBeUndefined()
    expect(byKey["X-Frame-Options"]).toBeUndefined()
  })
})

// IN-1: an enforced script policy, nonce and hashes, no 'unsafe-inline'.
describe("contentSecurityPolicy", () => {
  const d = directives(contentSecurityPolicy({ nonce: NONCE, framable: false, dev: false }))

  it("enforces scripts by nonce and hash, never 'unsafe-inline' or 'unsafe-eval'", () => {
    expect(d["script-src"]).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'", ...INLINE_SCRIPT_HASHES])
    expect(d["script-src"]).not.toContain("'unsafe-inline'")
    expect(d["script-src"]).not.toContain("'unsafe-eval'")
  })

  it("refuses plugins, a foreign <base> and forms to other sites, and allows the workers", () => {
    expect(d["object-src"]).toEqual(["'none'"])
    expect(d["base-uri"]).toEqual(["'self'"])
    expect(d["form-action"]).toEqual(["'self'"])
    expect(d["worker-src"]).toEqual(["'self'", "blob:"])
  })

  it("restricts nothing else (styles, images, media, connections)", () => {
    expect(Object.keys(d).sort()).toEqual(["base-uri", "form-action", "frame-ancestors", "object-src", "script-src", "worker-src"])
  })

  it("adds 'unsafe-eval' in development only", () => {
    expect(directives(contentSecurityPolicy({ nonce: NONCE, framable: false, dev: true }))["script-src"]).toContain("'unsafe-eval'")
  })

  it("hashes every inline script of the app, exactly as written", () => {
    expect(INLINE_SCRIPTS).toEqual([CLEAN_PATH_SCRIPT, THEME_INIT_SCRIPT, PRINT_BUTTON_SCRIPT])
    for (const script of INLINE_SCRIPTS) {
      expect(INLINE_SCRIPT_HASHES).toContain(`'sha256-${createHash("sha256").update(script).digest("base64")}'`)
    }
  })

  it("draws a new 128-bit nonce each time", () => {
    const a = createNonce()
    expect(Buffer.from(a, "base64")).toHaveLength(16)
    expect(createNonce()).not.toBe(a)
  })
})

describe("inline scripts of the app", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name)
      if (e.isDirectory()) return e.name === "__tests__" ? [] : sourceFiles(path)
      return /\.tsx?$/.test(e.name) ? [path] : []
    })
  }
  const files = sourceFiles(join(process.cwd(), "src")).map((f) => [f, readFileSync(f, "utf8")] as const)

  it("are only the hashed constants: no other inline <script> in a component", () => {
    for (const [file, text] of files) {
      for (const [, html] of text.matchAll(/<script dangerouslySetInnerHTML=\{\{ __html: (\w+) \}\}/g)) {
        // Data blocks (<script type="application/ld+json">) are never run, so need no hash.
        expect(["CLEAN_PATH_SCRIPT", "THEME_INIT_SCRIPT"], file).toContain(html)
      }
    }
  })

  it("never use an inline event handler in generated HTML", () => {
    for (const [file, text] of files) expect(text, file).not.toMatch(/\son(click|load|error|submit|change)="/)
  })

  it("print pages carry the print button script", () => {
    for (const file of ["src/lib/print-badges.ts", "src/lib/print-sheets.ts", "src/app/api/admin/events/[id]/export/pdf/route.ts"]) {
      const text = readFileSync(join(process.cwd(), file), "utf8")
      expect(text, file).toContain("${PRINT_BUTTON_SCRIPT_TAG}")
      expect(text, file).toContain("data-print")
    }
    expect(PRINT_BUTTON_SCRIPT_TAG).toBe(`<script>${PRINT_BUTTON_SCRIPT}</script>`)
  })
})

describe("next.config.ts", () => {
  it("sets SECURITY_HEADERS on every path", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8")
    expect(config).toContain('source: "/:path*", headers: [...SECURITY_HEADERS]')
  })
})
