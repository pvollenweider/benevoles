import { describe, it, expect } from "vitest"
import { renderEventPageMarkdown } from "../event-page-markdown"

describe("renderEventPageMarkdown", () => {
  it("renders basic Markdown formatting", () => {
    const html = renderEventPageMarkdown("# Règlement\n\n- **Arrivée** 30 min avant\n- Pas de retard")
    expect(html).toContain("<strong>Arrivée</strong>")
    expect(html).toContain("<li>")
  })

  it("shifts headings down one level so admin content never produces a second <h1>", () => {
    const html = renderEventPageMarkdown("# Titre\n\n## Sous-titre")
    expect(html).toContain("<h2>Titre</h2>")
    expect(html).toContain("<h3>Sous-titre</h3>")
    expect(html).not.toContain("<h1>")
  })

  it("renders a safe link with href intact", () => {
    const html = renderEventPageMarkdown("[Plan d'accès](https://example.com/plan)")
    expect(html).toContain('href="https://example.com/plan"')
    expect(html).toContain("Plan d'accès")
  })

  it("strips a script tag written directly as inline HTML in the Markdown", () => {
    const html = renderEventPageMarkdown("Bonjour <script>alert('x')</script> tout le monde")
    expect(html).not.toContain("<script")
    expect(html).not.toContain("alert(")
  })

  it("strips a javascript: URL from a link", () => {
    const html = renderEventPageMarkdown("[Cliquez](javascript:alert(1))")
    expect(html).not.toContain("javascript:")
  })

  it("strips an onerror handler smuggled via inline HTML", () => {
    const html = renderEventPageMarkdown('<img src="x" onerror="alert(1)">')
    expect(html).not.toContain("onerror")
  })

  it("strips a style attribute (not in the allowlist) even on an allowed tag", () => {
    const html = renderEventPageMarkdown('<p style="display:none">masqué</p>')
    expect(html).not.toContain("style=")
  })

  it("preserves a table (GFM)", () => {
    const html = renderEventPageMarkdown("| A | B |\n|---|---|\n| 1 | 2 |")
    expect(html).toContain("<table>")
    expect(html).toContain("<td>1</td>")
  })
})
