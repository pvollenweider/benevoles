/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import LegalLayout from "../layout"
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

  // The old footer's « Contact » mailto: the address stays in every legal document.
  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])("gives the contact address in the document (%s)", (path) => {
    renderLegal(path)
    expect(screen.getByRole("main")).toHaveTextContent("contact@benevol.app")
  })
})
