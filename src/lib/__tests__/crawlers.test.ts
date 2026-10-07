import { describe, it, expect } from "vitest"
import { PUBLIC_CRAWLERS, apexRobotsRules } from "../crawlers"

describe("apexRobotsRules", () => {
  const disallow = ["/admin", "/api/"]

  it("allows every crawler, and names the search and AI crawlers, each group keeping the private areas closed", () => {
    expect(apexRobotsRules(disallow)).toEqual([
      { userAgent: "*", allow: "/", disallow },
      { userAgent: [...PUBLIC_CRAWLERS], allow: "/", disallow },
    ])
  })

  it("names the main search engines and AI assistants, each once", () => {
    for (const bot of ["Googlebot", "Bingbot", "Applebot", "DuckDuckBot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "CCBot"]) {
      expect(PUBLIC_CRAWLERS).toContain(bot)
    }
    expect(new Set(PUBLIC_CRAWLERS).size).toBe(PUBLIC_CRAWLERS.length)
  })
})
