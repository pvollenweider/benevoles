/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import NotFoundPage from "../NotFoundPage"
import { notFoundLinks } from "@/lib/not-found-links"

// The 404 page « Cette page est tombée à l'eau. » (src/app/not-found.tsx).
describe("NotFoundPage", () => {
  afterEach(cleanup)

  it("on the apex: one h1, the way home and the main pages in « Liens utiles »", () => {
    render(<NotFoundPage links={notFoundLinks(null, "www.benevol.app")} />)
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cette page est tombée à l'eau.")
    expect(screen.getByRole("main")).toHaveAttribute("id", "main")
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/")
    const nav = screen.getByRole("navigation", { name: "Liens utiles" })
    const names = within(nav).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])
    expect(names).toEqual([
      ["Fonctionnalités", "/fonctionnalites"],
      ["Documentation", "/doc"],
      ["Guide bénévole", "/doc/benevole"],
      ["Guide des organisateurs", "/doc/admin"],
      ["Tutoriels vidéo", "/videos"],
      ["Espace organisateur", "/admin/login"],
    ])
    expect(screen.getByText(/Erreur 404/)).toBeInTheDocument()
    expect(document.title).toBe("Page introuvable | benevol.app")
  })

  it("on an organization's host: back to its events, and where to find a personal link", () => {
    render(<NotFoundPage links={notFoundLinks({ slug: "festival" }, "festival.benevol.app")} />)
    expect(screen.getByRole("link", { name: "Voir les événements" })).toHaveAttribute("href", "/")
    expect(screen.getByText(/le lien personnel se trouve dans l'e-mail de confirmation/)).toBeInTheDocument()
    const nav = screen.getByRole("navigation", { name: "Liens utiles" })
    expect(within(nav).getByRole("link", { name: "Guide bénévole" })).toBeInTheDocument()
    expect(within(nav).queryByRole("link", { name: "Fonctionnalités" })).toBeNull()
  })

  it("keeps the rain and the sinking card away from assistive technologies", () => {
    const { container } = render(<NotFoundPage links={notFoundLinks(null, "benevol.app")} />)
    const drops = container.querySelectorAll("[data-rain-drop]")
    expect(drops.length).toBeGreaterThan(10)
    drops.forEach((drop) => expect(drop.closest("[aria-hidden='true']")).not.toBeNull())
    // The joke card is part of the picture: its words are not read out twice.
    expect(screen.queryByText("Retrouver la page")?.closest("[aria-hidden='true']")).not.toBeNull()
    // Every movement is gated by the reduced-motion preference.
    container.querySelectorAll("[class*='animate-']").forEach((el) => {
      const animations = (el.getAttribute("class") ?? "").split(/\s+/).filter((c) => c.includes("animate-"))
      animations.forEach((c) => expect(c).toMatch(/^motion-safe:/))
    })
  })

  it("speaks to nobody in particular: no « tu », no « vous », no em dash nor middle dot", () => {
    for (const org of [null, { slug: "a" }]) {
      const { container, unmount } = render(<NotFoundPage links={notFoundLinks(org, "a.benevol.app")} />)
      const text = (container.textContent ?? "").replace(/\s+/g, " ")
      expect(text).not.toMatch(/\b(tu|te|toi|ton|ta|tes|vous|votre|vos)\b|\bt'/i)
      expect(text).not.toMatch(/[—·]/)
      unmount()
    }
  })
})
