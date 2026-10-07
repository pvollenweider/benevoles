/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import LandingStartGuides from "@/components/public/LandingStartGuides"

afterEach(cleanup)

const links = [
  { href: "/doc/creer-son-premier-evenement", title: "Créer son premier événement", summary: "De la demande d'espace au lien partagé." },
  { href: "/doc/partager-le-lien", title: "Partager le lien de l'événement", summary: "Copier ou partager le lien public." },
]

describe("LandingStartGuides", () => {
  it("is a region named by its heading, with one list item per guide, linked by its title", () => {
    render(<LandingStartGuides links={links} />)
    const region = screen.getByRole("region", { name: "Bien démarrer" })
    expect(within(region).getByRole("heading", { level: 2, name: "Bien démarrer" })).toBeInTheDocument()
    const items = within(region).getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByRole("link", { name: "Créer son premier événement" })).toHaveAttribute("href", "/doc/creer-son-premier-evenement")
    expect(items[0]).toHaveTextContent("De la demande d'espace au lien partagé.")
    expect(within(region).getByRole("link", { name: "Toute la documentation" })).toHaveAttribute("href", "/doc")
  })

  it("renders nothing without a guide", () => {
    const { container } = render(<LandingStartGuides links={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
