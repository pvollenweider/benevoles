import { describe, it, expect } from "vitest"
import { isExampleQuote, renderEventPageMarkdown } from "../event-page-markdown"

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

  it("renders headings at their literal depth when shiftHeadings is false (#200's /doc pages, whose own page.tsx supplies the <h1>)", () => {
    const html = renderEventPageMarkdown("## Section\n\n### Sous-section", { shiftHeadings: false })
    expect(html).toContain("<h2>Section</h2>")
    expect(html).toContain("<h3>Sous-section</h3>")
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

  it("preserves an image with its alt text (needed for embedding screenshots in the /doc guides)", () => {
    const html = renderEventPageMarkdown("![Le planning des créneaux](/doc-img/admin-shifts.png)")
    expect(html).toContain('src="/doc-img/admin-shifts.png"')
    expect(html).toContain('alt="Le planning des créneaux"')
  })

  it("preserves a table (GFM)", () => {
    const html = renderEventPageMarkdown("| A | B |\n|---|---|\n| 1 | 2 |")
    expect(html).toContain("<table>")
    expect(html).toContain("<td>1</td>")
  })

  // #568: the public guides' headings carry their anchor; admin-authored event pages don't.
  it("gives headings no id by default (admin-authored event pages)", () => {
    const html = renderEventPageMarkdown("## Plan d'accès")
    expect(html).not.toContain("id=")
  })

  it("gives each heading the slug of its text as id with headingIds, unique within the page", () => {
    const html = renderEventPageMarkdown("## Configurer les créneaux\n\n### Activer la liste d'attente\n\n## Archiver\n\n## Archiver", { shiftHeadings: false, headingIds: true })
    expect(html).toContain('<h2 id="configurer-les-creneaux">Configurer les créneaux</h2>')
    expect(html).toContain('<h3 id="activer-la-liste-d-attente">')
    expect(html).toContain('<h2 id="archiver">Archiver</h2>')
    expect(html).toContain('<h2 id="archiver-2">Archiver</h2>')
  })

  it("builds the id from the heading's text, not its markup", () => {
    const html = renderEventPageMarkdown("## Le champ `slug` et **Vue publique**", { shiftHeadings: false, headingIds: true })
    expect(html).toContain('<h2 id="le-champ-slug-et-vue-publique">Le champ <code>slug</code> et <strong>Vue publique</strong></h2>')
  })

  it("still strips an id written by hand in inline HTML when headingIds is off", () => {
    const html = renderEventPageMarkdown('<p id="main">x</p>')
    expect(html).not.toContain('id="main"')
  })
})

describe("example quotes (exampleQuotes)", () => {
  const source = "> « Je peux donner deux heures samedi. »\n>\n> Léa, bénévole occasionnelle"

  it("renders a quote and its caption as a figure, the caption naming the quote", () => {
    const html = renderEventPageMarkdown(source, { exampleQuotes: true })
    expect(html).toBe(
      "<figure>\n<blockquote>\n<p>« Je peux donner deux heures samedi. »</p>\n</blockquote>\n<figcaption>Léa, bénévole occasionnelle</figcaption>\n</figure>\n",
    )
  })

  it("leaves any other blockquote unchanged", () => {
    for (const other of [
      "> Pour {événement}, vous pouvez maintenant voir qui est inscrit.\n>\n> C'est facultatif.",
      "> « Une citation seule. »",
      "> « x »\n>\n> Léa, bénévole\n>\n> Une troisième ligne.",
      "> « x »\n>\n> « y »",
    ]) {
      const html = renderEventPageMarkdown(other, { exampleQuotes: true })
      expect(html).not.toContain("<figure>")
      expect(html).toBe(renderEventPageMarkdown(other))
    }
  })

  it("keeps the plain blockquote when the option is off, and strips a figure written by hand", () => {
    expect(renderEventPageMarkdown(source)).not.toContain("<figure>")
    expect(renderEventPageMarkdown(source)).toContain("<blockquote>")
    expect(renderEventPageMarkdown('<figure><figcaption><span aria-hidden="true">x</span></figcaption></figure>')).not.toMatch(/<fig|<span|aria-hidden/)
  })

  it("sanitizes the quote and the caption like the rest of the page", () => {
    const html = renderEventPageMarkdown("> « x <script>alert(1)</script> »\n>\n> Léa <img src=x onerror=alert(1)>", { exampleQuotes: true })
    expect(html).toContain("<figure>")
    expect(html).not.toContain("<script")
    expect(html).not.toContain("onerror")
  })

  it("wants a quote between « » and a short one-line caption", () => {
    expect(isExampleQuote("« x »", "Léa, bénévole")).toBe(true)
    expect(isExampleQuote("x", "Léa, bénévole")).toBe(false)
    expect(isExampleQuote("« x", "Léa, bénévole")).toBe(false)
    expect(isExampleQuote("« x »", "")).toBe(false)
    expect(isExampleQuote("« x »", "« y »")).toBe(false)
    expect(isExampleQuote("« x »", "a\nb")).toBe(false)
    expect(isExampleQuote("« x »", "a".repeat(81))).toBe(false)
  })
})
