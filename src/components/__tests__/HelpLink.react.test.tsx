/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"
import HelpLink from "../admin/HelpLink"

// #568, #649: « Aide : <section> » opens the page of the documentation that explains the screen
// (a unit of guide/, at a heading when the route names one), in a new tab, said so.
describe("HelpLink", () => {
  afterEach(cleanup)

  it("is named after the unit and the new tab, and opens the unit", () => {
    render(<HelpLink route="/admin/events/[id]/shifts" />)
    const link = screen.getByRole("link", { name: "Aide\u00a0: Configurer les créneaux (ouvre dans un nouvel onglet)" })
    expect(link).toHaveAttribute("href", "/doc/configurer-les-creneaux")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener")
  })

  it("is named after the heading when the route names one, and opens the unit at that heading", () => {
    render(<HelpLink route="/admin/events/[id]/edit" />)
    const link = screen.getByRole("link", { name: "Aide\u00a0: Modifier un événement (ouvre dans un nouvel onglet)" })
    expect(link).toHaveAttribute("href", "/doc/creer-un-evenement#modifier-un-evenement")
  })

  it("shows the new tab visibly with an arrow hidden from assistive technologies", () => {
    render(<HelpLink route="/admin/events/[id]/staffing" />)
    const link = screen.getByRole("link", { name: /^Aide\u00a0: Où manque-t-il du monde \?/ })
    const arrow = link.querySelector('[aria-hidden="true"]')
    expect(arrow).toHaveTextContent("↗")
  })
})
