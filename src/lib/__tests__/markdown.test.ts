import { describe, it, expect } from "vitest"
import { renderMarkdown, interpolate } from "../markdown"

describe("renderMarkdown — basic syntax (CommonMark)", () => {
  it("renders headings h1-h6", () => {
    for (let depth = 1; depth <= 6; depth++) {
      const html = renderMarkdown(`${"#".repeat(depth)} Titre ${depth}`)
      expect(html).toContain(`<h${depth}`)
      expect(html).toContain(`Titre ${depth}</h${depth}>`)
    }
  })

  it("renders bold with ** and __", () => {
    expect(renderMarkdown("**gras**")).toContain("<strong>gras</strong>")
    expect(renderMarkdown("__gras__")).toContain("<strong>gras</strong>")
  })

  it("renders italic with * and _", () => {
    expect(renderMarkdown("*italique*")).toContain("<em>italique</em>")
    expect(renderMarkdown("_italique_")).toContain("<em>italique</em>")
  })

  it("renders bold+italic combined", () => {
    const html = renderMarkdown("***les deux***")
    expect(html).toContain("<strong>")
    expect(html).toContain("<em>")
  })

  it("renders an unordered list", () => {
    const html = renderMarkdown("- un\n- deux\n- trois")
    expect(html).toContain("<ul")
    expect((html.match(/<li/g) ?? []).length).toBe(3)
  })

  it("renders an ordered list", () => {
    const html = renderMarkdown("1. un\n2. deux")
    expect(html).toContain("<ol")
  })

  it("renders a blockquote", () => {
    const html = renderMarkdown("> une citation")
    expect(html).toContain("<blockquote")
    expect(html).toContain("une citation")
  })

  it("renders inline code", () => {
    expect(renderMarkdown("du `code` inline")).toContain("<code")
  })

  it("renders a fenced code block", () => {
    const html = renderMarkdown("```\nconst x = 1;\n```")
    expect(html).toContain("<pre")
    expect(html).toContain("const x = 1;")
  })

  it("renders a horizontal rule", () => {
    expect(renderMarkdown("---")).toContain("<hr")
  })

  it("renders a link", () => {
    const html = renderMarkdown("[benevol.app](https://benevol.app)")
    expect(html).toContain('href="https://benevol.app"')
    expect(html).toContain("benevol.app</a>")
  })

  it("renders a paragraph", () => {
    expect(renderMarkdown("Un paragraphe simple.")).toContain("<p")
  })
})

describe("renderMarkdown — extended syntax (GFM)", () => {
  it("renders strikethrough", () => {
    expect(renderMarkdown("~~barré~~")).toContain("<del>barré</del>")
  })

  it("renders a task list with checked and unchecked items", () => {
    const html = renderMarkdown("- [ ] à faire\n- [x] fait")
    expect(html).toContain('type="checkbox"')
    expect(html).toContain("checked")
  })

  it("renders a table", () => {
    const html = renderMarkdown("| A | B |\n|---|---|\n| 1 | 2 |")
    expect(html).toContain("<table")
    expect(html).toContain("<th")
    expect(html).toContain("<td")
  })

  it("renders an image", () => {
    const html = renderMarkdown("![texte alternatif](https://example.com/img.png)")
    expect(html).toContain('src="https://example.com/img.png"')
    expect(html).toContain('alt="texte alternatif"')
  })

  it("autolinks a bare URL", () => {
    const html = renderMarkdown("Voir https://benevol.app pour plus d'infos.")
    expect(html).toContain('href="https://benevol.app"')
  })
})

describe("renderMarkdown — security", () => {
  it("neutralizes a script tag written directly as inline HTML (rendered as inert escaped text, not live markup)", () => {
    const html = renderMarkdown("Bonjour <script>alert('x')</script>")
    expect(html).not.toContain("<script")
    expect(html).not.toMatch(/<script[\s>]/)
    expect(html).toContain("&lt;script&gt;")
  })

  it("strips a javascript: URL from a Markdown link (DOMPurify's built-in href protocol check)", () => {
    expect(renderMarkdown("[cliquez](javascript:alert(1))")).not.toContain("javascript:")
  })

  it("neutralizes an admin-typed style attribute with dangerous CSS, but keeps the renderer's own hardcoded inline styles", () => {
    const html = renderMarkdown('<p style="background:url(javascript:alert(1))">texte</p>\n\n**gras**')
    // No *live* tag/attribute carrying the payload: DOMPurify's serializer can drop the escaping
    // on a quote inside text content (harmless — quotes aren't structurally significant outside
    // an attribute value), but < and > stay escaped, so this never re-parses as a real <p> tag.
    expect(html).not.toMatch(/<p[^>]*style="[^"]*javascript/)
    expect(html).toContain("&lt;p style=")
    // The renderer's own hardcoded styles (e.g. the wrapping <p> around **gras**) still come through.
    expect(html).toContain("<strong>gras</strong>")
    expect(html).toMatch(/<p style="margin:0\.5em 0">/)
  })

  it("neutralizes an onerror handler smuggled via inline HTML (no live event-handler attribute)", () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">')
    expect(html).not.toContain('onerror="')
    expect(html).toContain("onerror=&quot;")
  })
})

describe("interpolate", () => {
  it("replaces known {{variables}}", () => {
    expect(interpolate("Bonjour {{prenom}} !", { prenom: "Alex" })).toBe("Bonjour Alex !")
  })

  it("leaves unknown keys untouched", () => {
    expect(interpolate("{{inconnu}}", {})).toBe("{{inconnu}}")
  })
})
