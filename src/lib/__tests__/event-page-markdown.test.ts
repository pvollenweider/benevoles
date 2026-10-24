import { describe, it, expect } from "vitest"
import { isExampleCaption, renderEventPageMarkdown } from "../event-page-markdown"

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
  const nbsp = "\u00a0"
  const source = `> «${nbsp}Je peux donner deux heures samedi.${nbsp}»\n>\n> Exemple de situation${nbsp}: Léa, bénévole occasionnelle`

  it("renders a blockquote ending with « Exemple de situation : » as a figure with its caption", () => {
    const html = renderEventPageMarkdown(source, { exampleQuotes: true })
    // DOMPurify writes the non-breaking spaces back as &nbsp;.
    expect(html).toBe(
      "<figure>\n<blockquote>\n<p>«&nbsp;Je peux donner deux heures samedi.&nbsp;»</p>\n</blockquote>\n<figcaption>Exemple de situation&nbsp;: Léa, bénévole occasionnelle</figcaption>\n</figure>\n",
    )
  })

  it("leaves any other blockquote unchanged", () => {
    const plain = "> Pour {événement}, vous pouvez maintenant voir qui est inscrit.\n>\n> C'est facultatif."
    const html = renderEventPageMarkdown(plain, { exampleQuotes: true })
    expect(html).not.toContain("<figure>")
    expect(html).toContain("<p>C'est facultatif.</p>")
    expect(html).toBe(renderEventPageMarkdown(plain))
  })

  it("needs a quote before the caption: a caption alone stays a plain blockquote", () => {
    const html = renderEventPageMarkdown(`> Exemple de situation${nbsp}: comité d'un festival`, { exampleQuotes: true })
    expect(html).not.toContain("<figure>")
    expect(html).toContain("<blockquote>")
  })

  it("keeps the plain blockquote when the option is off, and strips a figure written by hand", () => {
    expect(renderEventPageMarkdown(source)).not.toContain("<figure>")
    expect(renderEventPageMarkdown(source)).toContain("<blockquote>")
    expect(renderEventPageMarkdown("<figure><figcaption>x</figcaption></figure>")).not.toMatch(/<fig/)
  })

  it("sanitizes the caption and the quote like the rest of the page", () => {
    const html = renderEventPageMarkdown(`> «${nbsp}x${nbsp}» <script>alert(1)</script>\n>\n> Exemple de situation : <img src=x onerror=alert(1)>`, { exampleQuotes: true })
    expect(html).not.toContain("<script")
    expect(html).not.toContain("onerror")
  })

  it("accepts a plain, non-breaking or narrow non-breaking space before the colon", () => {
    expect(isExampleCaption("Exemple de situation : x")).toBe(true)
    expect(isExampleCaption(`Exemple de situation${nbsp}: x`)).toBe(true)
    expect(isExampleCaption("Exemple de situation\u202f: x")).toBe(true)
    expect(isExampleCaption("Exemple de situation: x")).toBe(true)
    expect(isExampleCaption("Un exemple de situation : x")).toBe(false)
    expect(isExampleCaption("Situation type : x")).toBe(false)
  })
})
