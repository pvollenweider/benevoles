import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server"

// The proxy's matcher is a literal of src/proxy.ts (Next.js reads it from the source), so the test
// reads it from there rather than importing the proxy and its dependencies.
function proxyMatcher(): string[] {
  const source = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8")
  const literal = source.match(/matcher:\s*(\[[^\]]*\])/)![1]
  return JSON.parse(literal) as string[]
}

function goesThroughProxy(path: string): boolean {
  return unstable_doesMiddlewareMatch({ config: { matcher: proxyMatcher() }, url: `https://club.benevol.app${path}` })
}

describe("proxy matcher", () => {
  it("skips the Sentry tunnel, Next.js's own files and the favicon", () => {
    for (const path of [
      "/monitoring",
      "/monitoring?o=123&p=456",
      "/monitoring/",
      "/_next/static/chunks/main.js",
      "/_next/static/css/app.css",
      "/_next/image?url=%2Fdoc-img%2Fa.png&w=64&q=75",
      "/favicon.ico",
    ]) expect(goesThroughProxy(path), path).toBe(false)
  })

  // An event slug only has to start like an excluded path to have skipped the proxy: no org header
  // from the host, the client's org header kept, no framing headers.
  it("runs on paths that only start like an excluded one", () => {
    for (const path of [
      "/monitoring-foret",
      "/monitoring-foret/success",
      "/monitoringx/success",
      "/monitoring-des-oiseaux?embed=1",
      "/_next/staticx",
      "/_next/image-x",
      "/_next/imagex/y",
      "/favicon.icox",
      "/faviconxico",
      "/favicon-ico",
    ]) expect(goesThroughProxy(path), path).toBe(true)
  })

  it("runs on the app's pages and API routes", () => {
    for (const path of ["/", "/admin", "/admin/events/abc", "/api/health", "/fete-du-village", "/my/token123", "/doc/admin"]) {
      expect(goesThroughProxy(path), path).toBe(true)
    }
  })
})
