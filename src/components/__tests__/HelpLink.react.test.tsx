/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"
import HelpLink from "../admin/HelpLink"

// #568: « Aide : <section> » opens the admin guide at the page's section, in a new tab, said so.
describe("HelpLink", () => {
  afterEach(cleanup)

  it("names the section and the new tab, and opens the guide at the section's anchor", () => {
    render(<HelpLink route="/admin/events/[id]/shifts" />)
    const link = screen.getByRole("link", { name: "Aide : Configurer les créneaux (ouvre dans un nouvel onglet)" })
    expect(link).toHaveAttribute("href", "/doc/admin#configurer-les-creneaux")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener")
  })

  it("shows the new tab visibly with an arrow hidden from assistive technologies", () => {
    render(<HelpLink route="/admin/events/[id]/staffing" />)
    const link = screen.getByRole("link", { name: /^Aide : Où manque-t-il du monde \?/ })
    const arrow = link.querySelector('[aria-hidden="true"]')
    expect(arrow).toHaveTextContent("↗")
  })
})
