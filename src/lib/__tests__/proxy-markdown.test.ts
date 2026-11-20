import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MARKDOWN_ROUTE_PREFIX, markdownRequestTarget, servesMarkdown } from "../markdown-request"
import { NOT_FOUND_ROUTE } from "../server-not-found"

// The `.md` rewrite of the proxy, tested without its auth and database imports (src/proxy.ts).
// The host rule is the one of /llms.txt: the apex site only.

const BASE = "https://www.benevol.app"

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_APP_URL", BASE))
afterEach(() => vi.unstubAllEnvs())

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
  })
})

describe("markdownRequestTarget", () => {
  it("rewrites a .md path to the internal route on the apex host, query-free pathname", () => {
    expect(markdownRequestTarget("/fonctionnalites.md", "www.benevol.app", false)).toBe(`${MARKDOWN_ROUTE_PREFIX}/fonctionnalites.md`)
    expect(markdownRequestTarget("/index.html.md", "www.benevol.app", false)).toBe(`${MARKDOWN_ROUTE_PREFIX}/index.html.md`)
    expect(markdownRequestTarget("/doc/creer-un-evenement.md", "benevol.app", false)).toBe(`${MARKDOWN_ROUTE_PREFIX}/doc/creer-un-evenement.md`)
  })

  it("answers the site's 404 on an organisation's host, staging and an unknown host", () => {
    expect(markdownRequestTarget("/fonctionnalites.md", "club.benevol.app", true)).toBe(NOT_FOUND_ROUTE)
    expect(markdownRequestTarget("/fonctionnalites.md", "staging.benevol.app", false)).toBe(NOT_FOUND_ROUTE)
    expect(markdownRequestTarget("/fonctionnalites.md", "example.org", false)).toBe(NOT_FOUND_ROUTE)
  })

  it("answers the 404 for the internal route requested directly, encoded or not", () => {
    for (const path of ["/md", "/md/", "/md/fonctionnalites.md", "/md/fonctionnalites%2Emd", "/md/md/x.md"]) {
      expect(markdownRequestTarget(path, "www.benevol.app", false), path).toBe(NOT_FOUND_ROUTE)
    }
  })

  it("leaves every path that is not a .md variant alone", () => {
    for (const path of ["/", "/fonctionnalites", "/doc/admin", "/llms.txt", "/blog/feed.xml", "/x.md/", "/x.MD"]) {
      expect(markdownRequestTarget(path, "www.benevol.app", false), path).toBeNull()
    }
  })
})
