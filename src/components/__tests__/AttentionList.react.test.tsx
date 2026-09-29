/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import AttentionList from "../admin/AttentionList"

// « Ce qui demande votre attention » (#372): severity as text, a link naming its event, an empty state.

describe("AttentionList", () => {
  afterEach(cleanup)

  it("says so when nothing needs attention", () => {
    render(<AttentionList items={[]} />)
    expect(screen.getByRole("region", { name: "Ce qui demande votre attention" })).toHaveTextContent("Rien ne demande votre attention")
  })

  it("lists items with their severity as text and a link naming the event", () => {
    render(<AttentionList items={[
      { id: "milestones:e1", severity: "high", eventTitle: "Fête", message: "2 jalons sont en retard.", action: "Voir les jalons", href: "/admin/events/e1" },
      { id: "starting:e2", severity: "low", eventTitle: "Marché", message: "L'événement commence dans 3 jours.", action: "Ouvrir l'événement", href: "/admin/events/e2" },
    ]} />)
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText("Urgent")).toBeInTheDocument()
    expect(within(items[1]).getByText("Info")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /^Voir les jalons\s*:\s*Fête$/ })).toHaveAttribute("href", "/admin/events/e1")
  })
})
