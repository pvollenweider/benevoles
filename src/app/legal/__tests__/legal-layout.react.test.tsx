/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import LegalLayout from "../layout"
import { CONTENT_PROSE_CLASS } from "@/components/public/ContentShell"
import { SITE_READING_COLUMN_CLASS } from "@/components/public/site-container"
import PrivacyPage from "../privacy/page"
import TermsPage from "../terms/page"
import ProcessingAgreementPage from "../sous-traitance/page"
import SubProcessorsPage from "../sous-traitants/page"

const PAGES = {
  "/legal/privacy": PrivacyPage,
  "/legal/terms": TermsPage,
  "/legal/sous-traitance": ProcessingAgreementPage,
  "/legal/sous-traitants": SubProcessorsPage,
} as const

function renderLegal(path: keyof typeof PAGES) {
  const Page = PAGES[path]
  return render(<LegalLayout><Page /></LegalLayout>)
}

/** The hrefs the page's content (inside <main>) links to. */
function contentHrefs(): string[] {
  return within(screen.getByRole("main")).getAllByRole("link").map((a) => a.getAttribute("href")!)
}

describe("legal pages layout", () => {
  afterEach(cleanup)

  // The legal pages share the public footer of benevol.app's own pages, after </main>.
  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])("ends with the site footer, outside main (%s)", (path) => {
    renderLegal(path)
    const main = screen.getByRole("main")
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1)
    const footer = screen.getByRole("contentinfo")
    expect(main.contains(footer)).toBe(false)
    expect(main.querySelector("footer")).toBeNull()
    const nav = within(footer).getByRole("navigation", { name: "Liens utiles" })
    // The site variant: three titled columns, the legal one with privacy, terms, accessibility.
    expect(within(nav).getAllByRole("group")).toHaveLength(3)
    expect(document.getElementById("footer-site-legal")).toHaveTextContent("Informations légales")
    expect(within(nav).getByRole("link", { name: "Confidentialité" })).toHaveAttribute("href", "/legal/privacy")
    expect(within(nav).getByRole("link", { name: "CGU" })).toHaveAttribute("href", "/legal/terms")
    expect(within(nav).getByRole("link", { name: "Accessibilité" })).toHaveAttribute("href", "/accessibilite")
  })

  it("keeps its own light header with the link home and the skip link", () => {
    renderLegal("/legal/privacy")
    expect(screen.getByRole("link", { name: "Aller au contenu" })).toHaveAttribute("href", "#main")
    const banner = screen.getByRole("banner")
    expect(within(banner).getByRole("link", { name: "benevol.app" })).toHaveAttribute("href", "/")
    expect(banner).toHaveTextContent("Documents légaux")
    // Same 24 px target and focus outline as the content pages' header link.
    const home = within(banner).getByRole("link", { name: "benevol.app" })
    expect(home.className).toContain("py-3 -my-3")
    expect(home.className).toContain("focus-visible:outline-blue-600")
  })

  // The content pages' prose recipe: focus outline on the links, scroll margin on the headings.
  it("draws the document with the shared prose recipe", () => {
    renderLegal("/legal/privacy")
    const article = screen.getByRole("main").querySelector("article")!
    expect(article.className).toBe(`${CONTENT_PROSE_CLASS} ${SITE_READING_COLUMN_CLASS}`)
    expect(article.className).toContain("prose-a:focus-visible:outline")
    expect(article.className).toContain("prose-headings:scroll-mt-4")
  })

  // The old legal footer also linked the processing agreement and the sub-processors list; the
  // shared footer does not, so the documents themselves must keep them reachable (no orphan page).
  it("keeps the processing agreement and the sub-processors list linked from the privacy policy and the terms", () => {
    for (const path of ["/legal/privacy", "/legal/terms"] as const) {
      renderLegal(path)
      expect(contentHrefs()).toEqual(expect.arrayContaining(["/legal/sous-traitance", "/legal/sous-traitants"]))
      cleanup()
    }
  })

  it("links the processing agreement and the sub-processors list to each other", () => {
    renderLegal("/legal/sous-traitance")
    expect(contentHrefs()).toContain("/legal/sous-traitants")
    cleanup()
    renderLegal("/legal/sous-traitants")
    expect(contentHrefs()).toEqual(expect.arrayContaining(["/legal/sous-traitance", "/legal/privacy"]))
  })

  // Regression: the privacy table was wider than a 320 px screen and scrolled the whole page.
  it("puts every legal table in its own focusable scroll region", () => {
    let tables = 0
    for (const path of Object.keys(PAGES) as (keyof typeof PAGES)[]) {
      renderLegal(path)
      for (const table of screen.getByRole("main").querySelectorAll("table")) {
        tables++
        const region = table.parentElement!
        expect(region).toHaveAttribute("role", "region")
        expect(region).toHaveAttribute("tabindex", "0")
        // Named by its visible heading, with a hint on a narrow screen.
        const heading = document.getElementById(region.getAttribute("aria-labelledby")!)
        expect(heading?.tagName).toMatch(/^H[2-4]$/)
        expect(region).toHaveAccessibleName(heading!.textContent!)
        expect(region.previousElementSibling).toHaveTextContent("Faites défiler le tableau horizontalement.")
        expect(region.previousElementSibling!.className).toContain("sm:hidden")
        expect(region.className).toContain("overflow-x-auto")
      }
      cleanup()
    }
    expect(tables).toBeGreaterThan(0)
  })

  // The old footer's « Contact » mailto: the address stays in every legal document.
  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])("gives the contact address in the document (%s)", (path) => {
    renderLegal(path)
    expect(screen.getByRole("main")).toHaveTextContent("contact@benevol.app")
  })
})
