import { describe, it, expect } from "vitest"
import http from "node:http"
import type { AddressInfo } from "node:net"
import {
  isSafeWarmupPath,
  runBounded,
  selectWarmupPaths,
  warmup,
  warmupConfig,
  WARMUP_USER_AGENT,
  MAX_PAGES,
} from "../../../scripts/warmup.mjs"
import { readiness, readyFilePath, DEFAULT_READY_FILE } from "../readiness"

const APP = "https://www.benevol.app"
const sitemap = (urls: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`

describe("selectWarmupPaths", () => {
  it("keeps the site's own pages in sitemap order, home first, without duplicates", () => {
    const xml = sitemap([`${APP}/`, `${APP}/fonctionnalites`, `${APP}/doc/admin`, `${APP}/doc/admin`, `${APP}/videos/presentation`])
    expect(selectWarmupPaths(xml, APP)).toEqual(["/", "/fonctionnalites", "/doc/admin", "/videos/presentation"])
  })

  it("always warms the home page, even from an empty sitemap (staging, unknown host)", () => {
    expect(selectWarmupPaths(sitemap([]), APP)).toEqual(["/"])
    expect(selectWarmupPaths("", APP)).toEqual(["/"])
    expect(selectWarmupPaths("<html>oops</html>", APP)).toEqual(["/"])
  })

  it("drops other origins, queries, fragments and private areas", () => {
    const xml = sitemap([
      "https://fete.benevol.app/concert",
      "http://www.benevol.app/doc",
      `${APP}/fete-du-village?t=fake-value`,
      `${APP}/doc#faq`,
      `${APP}/admin/events`,
      `${APP}/api/health`,
      `${APP}/my/abc`,
      `${APP}/leader/abc`,
      `${APP}/waitlist/abc/confirm`,
      `${APP}/legal/cgu`,
    ])
    expect(selectWarmupPaths(xml, APP)).toEqual(["/", "/legal/cgu"])
  })

  it("decodes XML entities and normalises a trailing slash", () => {
    const xml = sitemap([`${APP}/doc/`, `${APP}/doc/a&amp;b`])
    expect(selectWarmupPaths(xml, APP)).toEqual(["/", "/doc", "/doc/a&b"])
  })

  it("is capped", () => {
    const xml = sitemap(Array.from({ length: MAX_PAGES + 50 }, (_, i) => `${APP}/doc/p${i}`))
    expect(selectWarmupPaths(xml, APP)).toHaveLength(MAX_PAGES)
    expect(selectWarmupPaths(xml, APP, 3)).toEqual(["/", "/doc/p0", "/doc/p1"])
  })

  it("falls back to the home page on an invalid site address", () => {
    expect(selectWarmupPaths(sitemap([`${APP}/doc`]), "not a url")).toEqual(["/"])
  })
})

describe("isSafeWarmupPath", () => {
  it.each(["/", "/doc", "/doc/admin", "/videos/x", "/legal/confidentialite", "/administration-guide", "/apiculture"])("%s is public", (p) => {
    expect(isSafeWarmupPath(p)).toBe(true)
  })
  it.each([
    "/admin",
    "/admin/login",
    "/super-admin/health",
    "/api/health",
    "/my/abc",
    "/leader/abc",
    "/waitlist/abc/confirm",
    "/product-updates/unsubscribe",
    "/monitoring",
    "//evil",
    "doc",
    "/doc?x=1",
  ])("%s is never requested", (p) => {
    expect(isSafeWarmupPath(p)).toBe(false)
  })
})

describe("warmupConfig", () => {
  it("targets the apex site's host on the local port", () => {
    expect(warmupConfig({ PORT: "3000", NEXT_PUBLIC_APP_URL: "https://www.benevol.app/" })).toMatchObject({
      port: 3000,
      appUrl: "https://www.benevol.app",
      host: "www.benevol.app",
      concurrency: 4,
      requestTimeoutMs: 15_000,
      totalTimeoutMs: 60_000,
    })
  })

  it("defaults to localhost without a site address, and ignores invalid numbers", () => {
    expect(warmupConfig({ PORT: "abc", WARMUP_CONCURRENCY: "-2" })).toMatchObject({ port: 3000, host: "localhost:3000", concurrency: 4 })
    expect(warmupConfig({ PORT: "8080", WARMUP_TIMEOUT_MS: "5000" })).toMatchObject({ host: "localhost:8080", totalTimeoutMs: 5000 })
  })
})

describe("runBounded", () => {
  it("never runs more than the limit at once and processes everything", async () => {
    let running = 0
    let peak = 0
    const seen: number[] = []
    const done = await runBounded([1, 2, 3, 4, 5, 6, 7], 3, Date.now() + 10_000, async (n: number) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 5))
      seen.push(n)
      running--
    })
    expect(done).toBe(7)
    expect(peak).toBe(3)
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("starts nothing new past the deadline", async () => {
    let clock = 0
    const done = await runBounded(
      [1, 2, 3, 4],
      1,
      2,
      async () => {
        clock++
      },
      () => clock,
    )
    expect(done).toBe(2)
  })
})

describe("warmup against a local server", () => {
  it("requests the sitemap pages with the site's Host and its own User-Agent, and survives errors", async () => {
    const requests: { path: string; host?: string; ua?: string }[] = []
    const server = http.createServer((req, res) => {
      requests.push({ path: req.url ?? "", host: req.headers.host, ua: req.headers["user-agent"] })
      if (req.url === "/sitemap.xml") {
        res.end(sitemap([`${APP}/`, `${APP}/doc`, `${APP}/admin/events`, `${APP}/videos`, `${APP}/broken`]))
      } else if (req.url === "/broken") {
        res.statusCode = 500
        res.end("boom")
      } else res.end("<html></html>")
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    const { port } = server.address() as AddressInfo
    const logs: string[] = []
    try {
      const result = await warmup({ PORT: String(port), NEXT_PUBLIC_APP_URL: APP, WARMUP_TIMEOUT_MS: "10000" }, (l: string) => logs.push(l))
      expect(result).toMatchObject({ pages: 4, errors: 1 })
    } finally {
      server.close()
    }
    expect(requests.map((r) => r.path).sort()).toEqual(["/", "/broken", "/doc", "/sitemap.xml", "/videos"])
    for (const r of requests) {
      expect(r.host).toBe("www.benevol.app")
      expect(r.ua).toBe(WARMUP_USER_AGENT)
    }
    expect(logs.at(-1)).toMatch(/done: 4\/4 pages/)
  })

  it("gives up within its cap when no server answers", async () => {
    const server = http.createServer()
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    const { port } = server.address() as AddressInfo
    await new Promise<void>((r) => server.close(() => r()))
    const t0 = Date.now()
    const result = await warmup({ PORT: String(port), WARMUP_TIMEOUT_MS: "600" }, () => {})
    expect(result.pages).toBe(0)
    expect(Date.now() - t0).toBeLessThan(3000)
  })
})

describe("readiness", () => {
  it("is not ready while warming up, whatever the database", () => {
    expect(readiness(false, true)).toEqual({ status: 503, body: { ok: false, warming: true } })
    expect(readiness(false, false).status).toBe(503)
  })

  it("then follows the database check", () => {
    expect(readiness(true, true)).toEqual({ status: 200, body: { ok: true } })
    expect(readiness(true, false)).toEqual({ status: 503, body: { ok: false, error: "database unreachable" } })
  })

  it("reads the flag file path from the environment", () => {
    expect(readyFilePath({})).toBe(DEFAULT_READY_FILE)
    expect(readyFilePath({ WARMUP_READY_FILE: "/run/ready" })).toBe("/run/ready")
  })
})
