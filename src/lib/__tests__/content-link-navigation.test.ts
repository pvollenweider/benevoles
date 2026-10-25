import { describe, it, expect } from "vitest"
import { clientNavigationTarget, isContentPath, navigationFocusTarget, type LinkAttributes, type LinkClick } from "../content-link-navigation"

const PAGES = ["/doc", "/doc/admin", "/fonctionnalites", "/legal/privacy", "/blog", "/nouveautes"]
const HERE = "https://www.benevol.app/doc/admin"
const click = (over: Partial<LinkClick> = {}): LinkClick => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...over })
const link = (href: string | null, over: Partial<LinkAttributes> = {}): LinkAttributes => ({ href, target: null, download: false, rel: null, ...over })

describe("isContentPath", () => {
  it("accepts the public pages and the pages of the content sections", () => {
    expect(isContentPath("/fonctionnalites", PAGES)).toBe(true)
    expect(isContentPath("/legal/privacy", PAGES)).toBe(true)
    expect(isContentPath("/doc/creer-son-premier-evenement", PAGES)).toBe(true)
    expect(isContentPath("/blog/un-article", PAGES)).toBe(true)
    expect(isContentPath("/videos", PAGES)).toBe(true)
    expect(isContentPath("/videos/inscription-benevole", PAGES)).toBe(true)
  })

  it("refuses files under a section and pages that are not content pages", () => {
    expect(isContentPath("/blog/feed.xml", PAGES)).toBe(false)
    expect(isContentPath("/videos/og-image.png", PAGES)).toBe(false)
    expect(isContentPath("/doc-img/admin.png", PAGES)).toBe(false)
    expect(isContentPath("/docs", PAGES)).toBe(false)
    expect(isContentPath("/admin", PAGES)).toBe(false)
    expect(isContentPath("/api/calendar", PAGES)).toBe(false)
    expect(isContentPath("/", PAGES)).toBe(false)
  })
})

describe("clientNavigationTarget", () => {
  it("navigates client-side to another guide page, keeping its fragment and query", () => {
    expect(clientNavigationTarget(click(), link("/doc/creer-son-premier-evenement"), HERE, PAGES)).toBe("/doc/creer-son-premier-evenement")
    expect(clientNavigationTarget(click(), link("/doc/creer-son-premier-evenement#etape-2"), HERE, PAGES)).toBe("/doc/creer-son-premier-evenement#etape-2")
    expect(clientNavigationTarget(click(), link("/fonctionnalites?x=1#faq"), HERE, PAGES)).toBe("/fonctionnalites?x=1#faq")
  })

  it("resolves relative and absolute same-origin links", () => {
    expect(clientNavigationTarget(click(), link("benevole"), "https://www.benevol.app/doc/admin", PAGES)).toBe("/doc/benevole")
    expect(clientNavigationTarget(click(), link("https://www.benevol.app/legal/privacy"), HERE, PAGES)).toBe("/legal/privacy")
  })

  it("leaves a link to the page itself to the browser (anchor jump, focus, hashchange)", () => {
    expect(clientNavigationTarget(click(), link("#mettre-en-place"), HERE, PAGES)).toBeNull()
    expect(clientNavigationTarget(click(), link("/doc/admin#ancienne-ancre"), HERE, PAGES)).toBeNull()
    expect(clientNavigationTarget(click(), link("/doc/admin"), HERE, PAGES)).toBeNull()
  })

  it("leaves new-tab, new-window and download gestures alone", () => {
    for (const over of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) {
      expect(clientNavigationTarget(click(over), link("/doc/benevole"), HERE, PAGES)).toBeNull()
    }
    expect(clientNavigationTarget(click(), link("/doc/benevole", { target: "_blank" }), HERE, PAGES)).toBeNull()
    expect(clientNavigationTarget(click(), link("/doc/benevole", { download: true }), HERE, PAGES)).toBeNull()
    expect(clientNavigationTarget(click(), link("/doc/benevole", { rel: "noopener external" }), HERE, PAGES)).toBeNull()
    expect(clientNavigationTarget(click(), link("/doc/benevole", { target: "_self", rel: "noopener" }), HERE, PAGES)).toBe("/doc/benevole")
  })

  it("never handles a click a next/link already handled", () => {
    expect(clientNavigationTarget(click({ defaultPrevented: true }), link("/doc/benevole"), HERE, PAGES)).toBeNull()
  })

  it("leaves other origins, other schemes, files and non-content pages to the browser", () => {
    expect(clientNavigationTarget(click(), link("https://github.com/pvollenweider/benevoles"), HERE, PAGES)).toBeNull()
    expect(clientNavigationTarget(click(), link("https://acme.benevol.app/doc/admin"), HERE, PAGES)).toBeNull()
    expect(clientNavigationTarget(click(), link("mailto:contact@benevol.app"), HERE, PAGES)).toBeNull()
    expect(clientNavigationTarget(click(), link("/blog/feed.xml"), HERE, PAGES)).toBeNull()
    expect(clientNavigationTarget(click(), link("/admin/events"), HERE, PAGES)).toBeNull()
    expect(clientNavigationTarget(click(), link(null), HERE, PAGES)).toBeNull()
  })
})

describe("navigationFocusTarget", () => {
  const ids = new Set(["etape-2", "été", "main"])
  const exists = (id: string) => ids.has(id)

  it("focuses the element the fragment names", () => {
    expect(navigationFocusTarget("#etape-2", exists, "main")).toBe("etape-2")
    expect(navigationFocusTarget("#%C3%A9t%C3%A9", exists, "main")).toBe("été")
  })

  it("falls back to <main> without a fragment, or when the page doesn't have it", () => {
    expect(navigationFocusTarget("", exists, "main")).toBe("main")
    expect(navigationFocusTarget("#", exists, "main")).toBe("main")
    expect(navigationFocusTarget("#ancienne-ancre", exists, "main")).toBe("main")
    expect(navigationFocusTarget("#%E0%A4%A", exists, "main")).toBe("main")
  })
})
