/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import PublicFooter from "../PublicFooter"
import pkg from "../../../package.json"

const GITHUB = "https://github.com/pvollenweider/benevoles"

/** [accessible name, href] of every link in a container. */
function linksOf(container: HTMLElement): [string, string | null][] {
  return within(container).getAllByRole("link").map((a) => [a.textContent!.replace(/\s+/g, " ").trim(), a.getAttribute("href")])
}

/** The column lists, each named by its visible title. */
function columns(): Record<string, [string, string | null][]> {
  const nav = screen.getByRole("navigation", { name: "Liens utiles" })
  return Object.fromEntries(within(nav).getAllByRole("list").map((ul) => {
    const title = document.getElementById(ul.getAttribute("aria-labelledby")!)!.textContent!
    expect(ul).toHaveAccessibleName(title)
    return [title, linksOf(ul)]
  }))
}

describe("PublicFooter", () => {
  afterEach(cleanup)

  it.each(["site", "event"] as const)("is one contentinfo with one navigation, column titles kept out of the outline (%s)", (variant) => {
    render(<PublicFooter variant={variant} />)
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1)
    expect(screen.getAllByRole("navigation")).toHaveLength(1)
    expect(screen.queryAllByRole("heading")).toHaveLength(0)
    // No separate version text: the version is said once, in the GitHub link.
    expect(document.body.textContent!.split(`v${pkg.version}`)).toHaveLength(2)
  })

  describe("site variant (benevol.app's own pages)", () => {
    it("groups the links in three titled columns", () => {
      render(<PublicFooter variant="site" />)
      expect(columns()).toEqual({
        // #757 (changelog) and the public video library stay one click away from every page.
        "Aide": [["Documentation", "/doc"], ["Tutoriels vidéo", "/videos"], ["Nouveautés", "/nouveautes"]],
        "benevol.app": [
          ["Espace organisateur", "/admin/login"],
          [`Code source v${pkg.version} sur GitHub (ouvre dans un nouvel onglet)`, GITHUB],
          ["Soutenir le projet (ouvre dans un nouvel onglet)", "https://buymeacoffee.com/benevol.app"],
        ],
        "Informations légales": [["Confidentialité", "/legal/privacy"], ["CGU", "/legal/terms"], ["Accessibilité", "/accessibilite"]],
      })
    })

    it("opens the external links in a new tab and says so, the GitHub mark hidden", () => {
      render(<PublicFooter variant="site" />)
      const code = screen.getByRole("link", { name: `Code source v${pkg.version} sur GitHub (ouvre dans un nouvel onglet)` })
      expect(code).toHaveAttribute("target", "_blank")
      expect(code.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
      expect(screen.getByRole("link", { name: "Soutenir le projet (ouvre dans un nouvel onglet)" })).toHaveAttribute("target", "_blank")
    })
  })

  describe("event variant (an organisation's volunteers)", () => {
    it("is the default", () => {
      render(<PublicFooter />)
      expect(screen.queryByRole("link", { name: "Nouveautés" })).toBeNull()
    })

    it("has two columns, help and legal, no support appeal nor platform news", () => {
      render(<PublicFooter variant="event" />)
      expect(columns()).toEqual({
        "Aide": [["Guide bénévole", "/doc/benevole"], ["Espace organisateur", "/admin/login"]],
        "Informations légales": [["Confidentialité", "/legal/privacy"], ["CGU", "/legal/terms"], ["Accessibilité", "/accessibilite"]],
      })
      expect(screen.queryByRole("link", { name: /Soutenir/ })).toBeNull()
      expect(screen.queryByRole("link", { name: "Tutoriels vidéo" })).toBeNull()
    })

    // Footer (#494): the name, the version and the code on GitHub are one link, with the GitHub mark.
    it("ends with the name and version of the tool, one link to its code", () => {
      render(<PublicFooter variant="event" />)
      const link = screen.getByRole("link", { name: `benevol.app v${pkg.version}, code source sur GitHub (ouvre dans un nouvel onglet)` })
      expect(link).toHaveAttribute("href", GITHUB)
      expect(link).toHaveAttribute("target", "_blank")
      const mark = link.querySelector("svg")
      expect(mark).toHaveAttribute("aria-hidden", "true")
      expect(mark).toHaveAttribute("focusable", "false")
      expect(screen.getByRole("navigation").contains(link)).toBe(false)
    })
  })

  // A « · » between wrapped links dangles at a line's end on a phone: titled lists instead.
  it.each(["site", "event"] as const)("draws no separator character (%s)", (variant) => {
    render(<PublicFooter variant={variant} />)
    expect(document.body.textContent).not.toContain("·")
  })
})
