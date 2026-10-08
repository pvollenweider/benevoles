/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

vi.mock("next/navigation", () => ({ usePathname: () => "/doc/admin" }))
// The theme toggle reads matchMedia, absent from jsdom; it plays no part in the frame's width.
vi.mock("@/app/doc/DocThemeToggle", () => ({ default: () => null }))

import { SITE_CONTAINER_CLASS, SITE_READING_COLUMN_CLASS } from "../site-container"
import ContentShell, { CONTENT_PROSE_CLASS } from "../ContentShell"
import DocFrame, { DOC_PROSE_CLASS } from "../DocFrame"
import FeaturesPage from "../FeaturesPage"
import NotFoundPage from "../NotFoundPage"
import PublicFooter from "@/components/PublicFooter"
import LegalLayout from "@/app/legal/layout"
import VideosLayout from "@/app/videos/layout"
import { notFoundLinks } from "@/lib/not-found-links"

const CONTAINER = SITE_CONTAINER_CLASS.split(" ")

/** The element's classes include every class of the site container. */
function expectSiteContainer(el: Element | null) {
  expect(el).not.toBeNull()
  const classes = el!.className.split(/\s+/)
  for (const c of CONTAINER) expect(classes).toContain(c)
}

/** The header's inner row, the <main> (or its frame) and the footer's wrapper. */
function frameParts() {
  const header = screen.getByRole("banner").firstElementChild
  const footerWrapper = screen.getByRole("contentinfo").parentElement
  return { header, footerWrapper }
}

describe("site container (one width for every public page)", () => {
  afterEach(cleanup)

  // The /fonctionnalites frame, chosen by the owner for its air: 72rem, centred, 24 px gutters.
  it("is the features page's frame: max-w-6xl, centred, px-6", () => {
    expect(SITE_CONTAINER_CLASS).toBe("mx-auto w-full max-w-6xl px-6")
  })

  it("frames the header, main and footer of an article page (changelog, accessibility)", () => {
    render(<ContentShell><h1>Nouveautés</h1><p>Texte</p></ContentShell>)
    const { header, footerWrapper } = frameParts()
    expectSiteContainer(header)
    expectSiteContainer(screen.getByRole("main"))
    expectSiteContainer(footerWrapper)
  })

  // The text keeps its measure, centred in the container: never stretched to 72rem.
  it("keeps the article prose at a reading measure, centred", () => {
    render(<ContentShell><p>Texte</p></ContentShell>)
    const article = screen.getByRole("main").querySelector("article")!
    expect(article.className).toBe(`${CONTENT_PROSE_CLASS} ${SITE_READING_COLUMN_CLASS}`)
    expect(SITE_READING_COLUMN_CLASS).toBe("mx-auto")
    // About 80 characters a line at 14 px; the article as wide as that measure, so the centred
    // column is the text itself.
    expect(CONTENT_PROSE_CLASS).toMatch(/^prose prose-gray dark:prose-invert max-w-\[36rem\]/)
    expect(CONTENT_PROSE_CLASS).not.toContain("max-w-none")
    expect(CONTENT_PROSE_CLASS).toContain("prose-p:max-w-[65ch]")
    expect(CONTENT_PROSE_CLASS).toContain("prose-li:max-w-[65ch]")
  })

  it("frames a guide without a side menu (/doc, /doc/admin) like the features page, text capped at 65ch and centred", () => {
    render(<ContentShell layout="doc"><DocFrame><h1>Guide administrateur</h1></DocFrame></ContentShell>)
    const { header, footerWrapper } = frameParts()
    expectSiteContainer(header)
    expectSiteContainer(screen.getByRole("main").parentElement)
    expectSiteContainer(footerWrapper)
    expect(screen.getByRole("main").querySelector("article")!.className).toBe(`${DOC_PROSE_CLASS} ${SITE_READING_COLUMN_CLASS}`)
    expect(DOC_PROSE_CLASS).toContain("max-w-[65ch]")
    expect(DOC_PROSE_CLASS).toContain("prose-p:max-w-[65ch]")
    expect(DOC_PROSE_CLASS).not.toContain("70ch")
  })

  it("frames a documentation unit's side menu and text in the same container", () => {
    render(<DocFrame menu={<nav aria-label="Documentation" />}><h1>Créer un événement</h1></DocFrame>)
    const frame = screen.getByRole("main").parentElement!
    expectSiteContainer(frame)
    expect(frame.className).toContain("lg:grid-cols-[15rem_minmax(0,1fr)]")
    expect(frame).toContainElement(screen.getByRole("navigation", { name: "Documentation" }))
    // Beside the menu, the text starts in its own column, not centred in it.
    expect(screen.getByRole("main").querySelector("article")!.className).toBe(DOC_PROSE_CLASS)
  })

  it("frames the features page's sections in the same container", () => {
    const { container } = render(<FeaturesPage page={{ title: "Fonctionnalités", intro: { parts: [], stills: [], actions: [] }, sections: [] } as never} />)
    const main = screen.getByRole("main")
    expectSiteContainer(main.querySelector("section"))
    expectSiteContainer(container.querySelector("nav > div"))
  })

  it("frames the legal pages' header, main and footer", () => {
    render(<LegalLayout><h1>Politique de confidentialité</h1></LegalLayout>)
    const { header, footerWrapper } = frameParts()
    expectSiteContainer(header)
    expectSiteContainer(screen.getByRole("main"))
    expectSiteContainer(footerWrapper)
  })

  it("frames the video library's header and main", () => {
    render(<VideosLayout><h1>Bibliothèque vidéo</h1></VideosLayout>)
    expectSiteContainer(screen.getByRole("banner").firstElementChild)
    expectSiteContainer(screen.getByRole("main"))
  })

  it("frames the 404 page's main", () => {
    render(<NotFoundPage links={notFoundLinks(null, "benevol.app", "https://benevol.app")} />)
    expectSiteContainer(screen.getByRole("main"))
  })

  // The site footer takes its container's width (its edges are the header's); the event footer
  // of an organisation's pages keeps its narrow column.
  it("lets the site footer fill the container and keeps the event footer narrow", () => {
    render(<PublicFooter variant="site" />)
    const site = screen.getByRole("contentinfo")
    expect(site.className).toContain("w-full")
    expect(site.className).not.toMatch(/max-w-/)
    cleanup()
    render(<PublicFooter />)
    expect(screen.getByRole("contentinfo").className).toContain("max-w-xl")
  })

  // A heading scale over the 14 px body (P3 of the design critique): fixed rem sizes, never fluid,
  // and table headers in sentence case (DESIGN.md, No-Caps).
  it("gives the content pages a clear heading scale, no uppercase table headers", () => {
    for (const c of ["prose-h1:text-3xl", "prose-h2:text-xl", "prose-h3:text-base", "prose-h4:text-sm", "prose-p:text-sm", "dark:prose-headings:text-gray-100"]) {
      expect(CONTENT_PROSE_CLASS).toContain(c)
    }
    expect(CONTENT_PROSE_CLASS).not.toMatch(/clamp|uppercase|tracking-wider/)
  })
})
