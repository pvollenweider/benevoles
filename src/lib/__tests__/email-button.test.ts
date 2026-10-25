import { describe, it, expect } from "vitest"
import { btn } from "../notifications/templates/shared"

describe("btn", () => {
  it("escapes the link so a quote cannot leave the href attribute", () => {
    const html = btn('https://example.org/a?x=1&y="><script>', "Ouvrir")
    expect(html).toContain('href="https://example.org/a?x=1&amp;y=&quot;&gt;&lt;script&gt;"')
    expect(html).not.toContain("<script>")
  })

  it("keeps an ordinary link working", () => {
    expect(btn("https://www.benevol.app/my/abc", "Gérer mes inscriptions")).toContain('href="https://www.benevol.app/my/abc"')
  })
})
