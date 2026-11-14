import { describe, it, expect } from "vitest"
import { NBSP, frenchSpacing } from "../french-spacing"
import { renderEventPageMarkdown } from "../event-page-markdown"
import { loadDocUnits } from "../doc-units"
import { renderDocUnitParts } from "../public-content"

describe("frenchSpacing (#1341)", () => {
  it("binds French quotation marks to their words", () => {
    expect(frenchSpacing("le bouton « Publier » en haut")).toBe(`le bouton «${NBSP}Publier${NBSP}» en haut`)
  })

  it("binds : ; ! ? to the word before", () => {
    expect(frenchSpacing("Attention : lisez ceci ; vraiment ! Compris ?")).toBe(
      `Attention${NBSP}: lisez ceci${NBSP}; vraiment${NBSP}! Compris${NBSP}?`,
    )
  })

  it("leaves a mark with no space before it, and a time, as written", () => {
    expect(frenchSpacing("https://exemple.org et 10:30")).toBe("https://exemple.org et 10:30")
    expect(frenchSpacing("de 10 : 30")).toBe(`de 10${NBSP}: 30`)
  })

  it("is idempotent", () => {
    const once = frenchSpacing("« Oui » : non ?")
    expect(frenchSpacing(once)).toBe(once)
  })
})

describe("rendered repo content", () => {
  const render = (md: string) => renderEventPageMarkdown(md, { shiftHeadings: false, allowImages: true, headingIds: true })

  it("applies the spacing to text, headings and link text", () => {
    const html = render("## Pourquoi « publier » ?\n\nCliquez sur [« Publier »](/doc/publier) : c'est tout.")
    expect(html).toContain("Pourquoi «&nbsp;publier&nbsp;»&nbsp;?")
    expect(html).toContain('<a href="/doc/publier">«&nbsp;Publier&nbsp;»</a>&nbsp;: c\'est tout.')
  })

  it("keeps heading ids unchanged", () => {
    expect(render("## Pourquoi « publier » ?")).toContain('id="pourquoi-publier"')
  })

  it("leaves code spans and code blocks as written", () => {
    const html = render("Tapez `a : b` puis\n\n```\nclé : valeur ?\n```")
    expect(html).toContain("<code>a : b</code>")
    expect(html).toContain("clé : valeur ?")
  })

  it("leaves an image's alt text as written", () => {
    expect(render("![Le bouton « Publier » : en haut](/doc-img/a.png)")).toContain('alt="Le bouton « Publier » : en haut"')
  })

  it("does not touch admin-authored event pages unless asked", () => {
    expect(renderEventPageMarkdown("Bienvenue : « ici »")).toContain("Bienvenue : « ici »")
  })

  it("leaves no breaking space after « in any real guide", () => {
    for (const unit of loadDocUnits()) {
      const html = renderDocUnitParts(unit).map((p) => (p.kind === "html" ? p.html : "")).join("")
      const text = html.replace(/<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>|<[^>]+>/g, "")
      expect(text, unit.slug).not.toMatch(/« /)
      expect(text, unit.slug).not.toMatch(/ »/)
    }
  })
})
