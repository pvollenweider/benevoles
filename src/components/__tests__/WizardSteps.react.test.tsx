/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"

import WizardSteps from "../admin/WizardSteps"

// Three-step creation indicator (#401).
describe("WizardSteps", () => {
  afterEach(cleanup)

  it("names the current step and links the done ones", () => {
    render(<WizardSteps current={3} eventId="evt-1" />)
    const nav = screen.getByRole("navigation", { name: "Étapes de création de l'événement" })
    const items = within(nav).getAllByRole("listitem")
    expect(items).toHaveLength(3)
    expect(items[2]).toHaveAttribute("aria-current", "step")
    expect(items[2]).toHaveTextContent(/Étape 3, en cours :\s*Vérification et publication/)
    expect(within(items[0]).getByRole("link", { name: "Étape 1, faite : Informations" })).toHaveAttribute("href", "/admin/events/evt-1/edit?wizard=1")
    expect(within(items[1]).getByRole("link", { name: "Étape 2, faite : Postes et créneaux" })).toHaveAttribute("href", "/admin/events/evt-1/shifts?wizard=1")
    expect(within(nav).getByRole("link", { name: "Quitter l'assistant" })).toHaveAttribute("href", "/admin/events/evt-1")
  })

  it("before the event exists, nothing is a link but the exit", () => {
    render(<WizardSteps current={1} eventId={null} />)
    const nav = screen.getByRole("navigation")
    expect(within(nav).getAllByRole("link")).toHaveLength(1)
    expect(within(nav).getByRole("link", { name: "Quitter l'assistant" })).toHaveAttribute("href", "/admin/events")
    expect(within(nav).getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step")
  })
})
