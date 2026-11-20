import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { markdownAnswer, servesMarkdown } from "../markdown-request"
import { loadLlmsSources } from "../llms-sources"

// The proxy's answer to a `.md` request (src/proxy.ts), tested without its auth and database
// imports. The host rule is the one of /llms.txt: the apex site only. The proxy serves the
// Markdown itself: the standalone server runs the proxy again on a rewritten request, so a rewrite
// to an internal route would be refused on that second pass (seen in production).

const BASE = "https://www.benevol.app"

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_APP_URL", BASE))
afterEach(() => vi.unstubAllEnvs())

const ask = (pathname: string, host = "www.benevol.app", hasOrg = false, method = "GET") => {
  const load = vi.fn(() => loadLlmsSources(true))
  return { answer: markdownAnswer({ pathname, method, host, hasOrg }, load), load }
}

describe("servesMarkdown", () => {
  it("accepts the apex site's hosts", () => {
    expect(servesMarkdown("www.benevol.app", false)).toBe(true)
    expect(servesMarkdown("benevol.app", false)).toBe(true)
    expect(servesMarkdown("www.benevol.app:443", false)).toBe(true)
  })

  it("refuses an organisation's host, staging and an unknown host", () => {
    expect(servesMarkdown("club.benevol.app", true)).toBe(false)
    expect(servesMarkdown("staging.benevol.app", false)).toBe(false)
    expect(servesMarkdown("example.org", false)).toBe(false)
    expect(servesMarkdown("localhost:3000", false)).toBe(false)
  })
})

describe("markdownAnswer", () => {
  it("serves a covered page's Markdown with its canonical HTML address", () => {
    const { answer } = ask("/fonctionnalites.md")
    expect(answer?.status).toBe(200)
    if (answer?.status !== 200) return
    expect(answer.headers["Content-Type"]).toBe("text/markdown; charset=utf-8")
    expect(answer.headers["Cache-Control"]).toBe("public, max-age=3600")
    expect(answer.headers.Link).toBe(`<${BASE}/fonctionnalites>; rel="canonical"`)
    expect(answer.headers["X-Content-Type-Options"]).toBe("nosniff")
    expect(answer.body).toContain(`> Version Markdown de ${BASE}/fonctionnalites`)
  })

  it("serves the home, a documentation unit and HEAD requests", () => {
    expect(ask("/index.html.md").answer?.status).toBe(200)
    expect(ask("/doc/admin.md").answer?.status).toBe(200)
    expect(ask("/fonctionnalites.md", "www.benevol.app", false, "HEAD").answer?.status).toBe(200)
  })

  it("answers 404 on an organisation's host, staging and an unknown host, without reading the sources", () => {
    for (const [host, hasOrg] of [["club.benevol.app", true], ["staging.benevol.app", false], ["example.org", false]] as const) {
      const { answer, load } = ask("/fonctionnalites.md", host, hasOrg)
      expect(answer, host).toEqual({ status: 404 })
      expect(load).not.toHaveBeenCalled()
    }
  })

  it("answers 404 for a method other than GET or HEAD", () => {
    expect(ask("/fonctionnalites.md", "www.benevol.app", false, "POST").answer).toEqual({ status: 404 })
  })

  it("answers 404 for a page without a variant and for odd paths", () => {
    for (const p of ["/page-qui-n-existe-pas.md", "/admin.md", "/super-admin/stats.md", "/fonctionnalites.md.md", "/doc/../admin.md", "//x.md", "/.md", "/md/fonctionnalites.md"]) {
      expect(ask(p).answer, p).toEqual({ status: 404 })
    }
  })

  it("leaves every path that is not a .md variant alone", () => {
    for (const p of ["/", "/fonctionnalites", "/doc/admin", "/llms.txt", "/blog/feed.xml", "/x.md/", "/x.MD", "/md/fonctionnalites%2Emd"]) {
      expect(ask(p).answer, p).toBeNull()
    }
  })
})
