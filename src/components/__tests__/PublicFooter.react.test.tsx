/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import PublicFooter, { footerSiteColumns } from "../PublicFooter"
import pkg from "../../../package.json"

const GITHUB = "https://github.com/pvollenweider/benevoles"

/** [accessible name, href] of every link in a container. */
function linksOf(container: HTMLElement): [string, string | null][] {
  return within(container).getAllByRole("link").map((a) => [a.textContent!.replace(/\s+/g, " ").trim(), a.getAttribute("href")])
}

/** The columns: groups named by their visible title, each with one unnamed list of links. */
function columns(): Record<string, [string, string | null][]> {
  const nav = screen.getByRole("navigation", { name: "Liens utiles" })
  return Object.fromEntries(within(nav).getAllByRole("group").map((group) => {
    const title = document.getElementById(group.getAttribute("aria-labelledby")!)!
    expect(group).toContainElement(title)
    expect(group).toHaveAccessibleName(title.textContent!)
    const list = within(group).getByRole("list")
    expect(list).not.toHaveAttribute("aria-labelledby")
    return [title.textContent!, linksOf(list)]
  }))
}

describe("PublicFooter", () => {
  afterEach(cleanup)

  it.each(["site", "event"] as const)("is one contentinfo with one navigation, column titles kept out of the outline (%s)", (variant) => {
    render(<PublicFooter variant={variant} />)
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1)
    expect(screen.getAllByRole("navigation")).toHaveLength(1)
    expect(screen.queryAllByRole("heading")).toHaveLength(0)
    // Title ids prefixed with the variant, unique on the page.
    const ids = [...document.querySelectorAll("[role=group]")].map((g) => g.getAttribute("aria-labelledby"))
    expect(ids.every((id) => id!.startsWith(`footer-${variant}-`))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    // No separate version text: the version is said once, in the GitHub link.
    expect(document.body.textContent!.split(`v${pkg.version}`)).toHaveLength(2)
  })

  describe("site variant (benevol.app's own pages)", () => {
    it("groups the links in four titled columns", () => {
      render(<PublicFooter variant="site" />)
      expect(columns()).toEqual({
        // #872, #950: what the service is, for whom and at what price, from every page.
        "Découvrir": [["Pour qui ?", "/pour-qui"], ["Tarifs", "/tarifs"]],
        // #757 (changelog) and the public video library stay one click away from every page.
        "Aide": [["Documentation", "/doc"], ["Tutoriels vidéo", "/videos"], ["Nouveautés", "/nouveautes"], ["Blog", "/blog"]],
        "benevol.app": [
          ["Espace organisateur", "/admin/login"],
          [`Code source v${pkg.version} sur GitHub (ouvre dans un nouvel onglet)`, GITHUB],
          ["Soutenir le projet (ouvre dans un nouvel onglet)", "https://buymeacoffee.com/benevol.app"],
        ],
        "Informations légales": [["Confidentialité", "/legal/privacy"], ["CGU", "/legal/terms"], ["Accessibilité", "/accessibilite"]],
      })
    })

    // #760: another instance has no audience pages nor pricing page.
    it("leaves the « Découvrir » column out on an instance that is not the hosted service", () => {
      const ids = footerSiteColumns("asso.example.org", null, false).map((c) => c.id)
      expect(ids).toEqual(["help", "project", "legal"])
      expect(footerSiteColumns("benevol.app", null, true).map((c) => c.id)).toEqual(["discover", "help", "project", "legal"])
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

    // Search Console: on an organisation's host, /doc, /legal, /accessibilite and /admin answer a 308
    // to the site's address; the footer links there directly.
    it("links the site's pages on the site's address when given one", () => {
      render(<PublicFooter variant="event" site={{ apexBase: "https://www.benevol.app", name: "benevol.app" }} />)
      expect(columns()).toEqual({
        "Aide": [["Guide bénévole", "https://www.benevol.app/doc/benevole"], ["Espace organisateur", "https://www.benevol.app/admin/login"]],
        "Informations légales": [
          ["Confidentialité", "https://www.benevol.app/legal/privacy"],
          ["CGU", "https://www.benevol.app/legal/terms"],
          ["Accessibilité", "https://www.benevol.app/accessibilite"],
        ],
      })
      // Same tab, as before.
      for (const link of within(screen.getByRole("navigation")).getAllByRole("link")) expect(link).not.toHaveAttribute("target")
    })

    it("links the site's home, « Propulsé par » the instance, same tab, outside the nav", () => {
      render(<PublicFooter variant="event" site={{ apexBase: "https://www.benevol.app", name: "benevol.app" }} />)
      const home = screen.getByRole("link", { name: "Propulsé par benevol.app" })
      expect(home).toHaveAttribute("href", "https://www.benevol.app/")
      expect(home).not.toHaveAttribute("target")
      expect(home).not.toHaveAttribute("rel")
      expect(screen.getByRole("navigation").contains(home)).toBe(false)
      expect(screen.getByRole("contentinfo").contains(home)).toBe(true)
    })

    // #760: another instance names itself and links its own pages, its operator page for legal.
    it("follows the instance: its name, its address, its operator page", () => {
      vi.stubEnv("HOSTED_SERVICE", "false")
      try {
        render(<PublicFooter variant="event" site={{ apexBase: "https://benevoles.asso.example", name: "Bénévoles Asso" }} />)
        expect(screen.getByRole("link", { name: "Propulsé par Bénévoles Asso" })).toHaveAttribute("href", "https://benevoles.asso.example/")
        expect(screen.getByRole("link", { name: "Exploitant de cette instance" })).toHaveAttribute("href", "https://benevoles.asso.example/legal/exploitant")
      } finally {
        vi.unstubAllEnvs()
      }
    })

    it("keeps relative links and the home at / without an address (localhost, ?org=)", () => {
      render(<PublicFooter variant="event" />)
      expect(screen.getByRole("link", { name: "Guide bénévole" })).toHaveAttribute("href", "/doc/benevole")
      expect(screen.getByRole("link", { name: /^Propulsé par / })).toHaveAttribute("href", "/")
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

  describe("embed variant (#948)", () => {
    it("links the legal pages on the site's address, in a new tab", () => {
      render(<PublicFooter variant="embed" site={{ apexBase: "https://www.benevol.app", name: "benevol.app" }} />)
      const privacy = screen.getByRole("link", { name: "Confidentialité (ouvre dans un nouvel onglet)" })
      expect(privacy).toHaveAttribute("href", "https://www.benevol.app/legal/privacy")
      expect(privacy).toHaveAttribute("target", "_blank")
      expect(screen.getByRole("link", { name: "CGU (ouvre dans un nouvel onglet)" })).toHaveAttribute("href", "https://www.benevol.app/legal/terms")
    })

    // #1117: the tool's name links the instance's home, the code has its own link.
    it("links « Propulsé par <instance> » to the site's home, in a new tab, without the GitHub mark", () => {
      render(<PublicFooter variant="embed" site={{ apexBase: "https://www.benevol.app", name: "benevol.app" }} />)
      const home = screen.getByRole("link", { name: "Propulsé par benevol.app (ouvre dans un nouvel onglet)" })
      expect(home).toHaveAttribute("href", "https://www.benevol.app/")
      expect(home).toHaveAttribute("target", "_blank")
      expect(home).toHaveAttribute("rel", "noopener")
      expect(home.querySelector("svg")).toBeNull()
      expect(screen.getByRole("navigation", { name: "Liens utiles" }).contains(home)).toBe(true)
    })

    // AGPL-3.0 §13: the source offer stays on the embedded page, separately named.
    it("ends with a link to the code on GitHub, in a new tab", () => {
      render(<PublicFooter variant="embed" site={{ apexBase: "https://www.benevol.app", name: "benevol.app" }} />)
      const code = screen.getByRole("link", { name: "Code source sur GitHub (ouvre dans un nouvel onglet)" })
      expect(code).toHaveAttribute("href", GITHUB)
      expect(code).toHaveAttribute("target", "_blank")
      expect(code.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
      const nav = screen.getByRole("navigation", { name: "Liens utiles" })
      expect(within(nav).getAllByRole("link").at(-1)).toBe(code)
    })

    it("names a self-hosted instance and links its own address", () => {
      vi.stubEnv("HOSTED_SERVICE", "false")
      try {
        render(<PublicFooter variant="embed" site={{ apexBase: "https://benevoles.asso.example", name: "Bénévoles Asso" }} />)
        expect(screen.getByRole("link", { name: "Propulsé par Bénévoles Asso (ouvre dans un nouvel onglet)" })).toHaveAttribute("href", "https://benevoles.asso.example/")
        expect(screen.getByRole("link", { name: "Exploitant de cette instance (ouvre dans un nouvel onglet)" })).toHaveAttribute("href", "https://benevoles.asso.example/legal/exploitant")
      } finally {
        vi.unstubAllEnvs()
      }
    })

    it("links the home at / without an address (localhost, ?org=)", () => {
      render(<PublicFooter variant="embed" />)
      expect(screen.getByRole("link", { name: /^Propulsé par .+ \(ouvre dans un nouvel onglet\)$/ })).toHaveAttribute("href", "/")
    })
  })

  // A « · » between wrapped links dangles at a line's end on a phone: titled lists instead.
  it.each(["site", "event"] as const)("draws no separator character (%s)", (variant) => {
    render(<PublicFooter variant={variant} />)
    expect(document.body.textContent).not.toContain("·")
  })
})
