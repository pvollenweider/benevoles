/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import PublicFooter from "../PublicFooter"
import pkg from "../../../package.json"

const sourceLinkName = `benevol.app v${pkg.version}, code source sur GitHub (ouvre dans un nouvel onglet)`

function linksOf(container: HTMLElement): [string, string | null][] {
  return within(container).getAllByRole("link").map((a) => [a.textContent!.replace(/\s+/g, " ").trim(), a.getAttribute("href")])
}

describe("PublicFooter", () => {
  afterEach(cleanup)

  // Footer (#494): the name, the version and the code on GitHub are one link, with the GitHub mark.
  it.each(["site", "event"] as const)("joins name and version in the GitHub link, the mark hidden (%s)", (variant) => {
    render(<PublicFooter variant={variant} />)
    const link = screen.getByRole("link", { name: sourceLinkName })
    expect(link).toHaveAttribute("href", "https://github.com/pvollenweider/benevoles")
    expect(link).toHaveAttribute("target", "_blank")
    const mark = link.querySelector("svg")
    expect(mark).toHaveAttribute("aria-hidden", "true")
    expect(mark).toHaveAttribute("focusable", "false")
    // No separate version text left beside it.
    expect(document.body.textContent!.split(`v${pkg.version}`)).toHaveLength(2)
  })

  describe("site variant (benevol.app's own pages)", () => {
    it("puts help and the organisers' sign-in in the primary navigation, in this order", () => {
      render(<PublicFooter variant="site" />)
      const nav = screen.getByRole("navigation", { name: "Liens utiles" })
      expect(within(nav).getAllByRole("listitem")).toHaveLength(4)
      // #757 (changelog) and the public video library stay one click away from every page.
      expect(linksOf(nav)).toEqual([
        ["Documentation", "/doc"],
        ["Tutoriels vidéo", "/videos"],
        ["Nouveautés", "/nouveautes"],
        ["Espace organisateur", "/admin/login"],
      ])
    })

    it("keeps the legal pages in their own, distinctly named navigation", () => {
      render(<PublicFooter variant="site" />)
      const legal = screen.getByRole("navigation", { name: "Informations légales" })
      expect(linksOf(legal)).toEqual([
        ["Confidentialité", "/legal/privacy"],
        ["CGU", "/legal/terms"],
        ["Accessibilité", "/accessibilite"],
      ])
    })

    it("offers the support link, announced as opening a new tab", () => {
      render(<PublicFooter variant="site" />)
      const support = screen.getByRole("link", { name: /Soutenir le projet/ })
      expect(support).toHaveAttribute("href", "https://buymeacoffee.com/benevol.app")
      expect(support).toHaveAccessibleName("Soutenir le projet (ouvre dans un nouvel onglet)")
    })
  })

  describe("event variant (an organisation's volunteers)", () => {
    it("is the default", () => {
      render(<PublicFooter />)
      expect(screen.queryByRole("link", { name: "Nouveautés" })).toBeNull()
    })

    it("shows the volunteers' guide and the legal pages only, no support appeal nor platform news", () => {
      render(<PublicFooter variant="event" />)
      const nav = screen.getByRole("navigation", { name: "Liens utiles" })
      expect(linksOf(nav)).toEqual([
        [`benevol.app v${pkg.version}, code source sur GitHub (ouvre dans un nouvel onglet)`, "https://github.com/pvollenweider/benevoles"],
        ["Guide bénévole", "/doc/benevole"],
        ["Confidentialité", "/legal/privacy"],
        ["CGU", "/legal/terms"],
        ["Accessibilité", "/accessibilite"],
      ])
      expect(screen.getAllByRole("navigation")).toHaveLength(1)
      expect(screen.queryByRole("link", { name: /Soutenir/ })).toBeNull()
    })
  })

  // A « · » between wrapped links dangles at a line's end on a phone: lists and gaps instead.
  it.each(["site", "event"] as const)("draws no separator character (%s)", (variant) => {
    render(<PublicFooter variant={variant} />)
    expect(document.body.textContent).not.toContain("·")
  })
})
