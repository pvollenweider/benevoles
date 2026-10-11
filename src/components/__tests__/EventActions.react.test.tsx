/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"

import EventActions, { PRIMARY_ACTIONS, EVENT_TOOLS } from "../admin/EventActions"

// Mobile action bar of the admin event page: short labels on a phone, tools as 44 px targets.
describe("EventActions", () => {
  afterEach(cleanup)

  it("renders each primary action with its short label for phones and its long label from sm up", () => {
    const { container } = render(<EventActions eventId="evt-1" />)
    for (const a of PRIMARY_ACTIONS) {
      const link = container.querySelector(`a[href="/admin/events/evt-1/${a.path}"]`)
      expect(link).not.toBeNull()
      const short = within(link as HTMLElement).getByText(a.short)
      const long = within(link as HTMLElement).getByText(a.long)
      expect(short).toHaveClass("sm:hidden")
      expect(long).toHaveClass("hidden", "sm:inline")
    }
  })

  it("keeps the phone label a word of the desktop label, so both name the same destination", () => {
    for (const a of PRIMARY_ACTIONS) expect(a.long.toLowerCase()).toContain(a.short.toLowerCase())
  })

  it("lists the event tools in a labelled navigation, each a 44 px target", () => {
    render(<EventActions eventId="evt-1" />)
    const nav = screen.getByRole("navigation", { name: "Outils de l'événement" })
    const links = within(nav).getAllByRole("link")
    expect(links.map((l) => l.textContent)).toEqual(EVENT_TOOLS.map((t) => t.label))
    for (const [i, link] of links.entries()) {
      expect(link).toHaveAttribute("href", `/admin/events/evt-1/${EVENT_TOOLS[i].path}`)
      expect(link).toHaveClass("min-h-11")
    }
  })

  it("groups the primary links, each a 44 px box with a 1 px border (transparent on blue, kept in forced colors)", () => {
    render(<EventActions eventId="evt-1" />)
    const group = screen.getByRole("group", { name: "Actions principales" })
    const links = within(group).getAllByRole("link")
    expect(links).toHaveLength(PRIMARY_ACTIONS.length)
    for (const [i, link] of links.entries()) {
      expect(link).toHaveClass("min-h-11", "border")
      if (PRIMARY_ACTIONS[i].primary) expect(link).toHaveClass("border-transparent")
    }
  })

  it("separates the two labels by a space, so they never run together without CSS", () => {
    const { container } = render(<EventActions eventId="evt-1" />)
    const link = container.querySelector('a[href$="/shifts"]') as HTMLElement
    expect(link.textContent).toBe("Créneaux Gérer les créneaux")
  })

  it("outlines each phone tool cell in forced colors, where the hairline gaps disappear", () => {
    render(<EventActions eventId="evt-1" />)
    for (const li of within(screen.getByRole("navigation", { name: "Outils de l'événement" })).getAllByRole("listitem"))
      expect(li).toHaveClass("forced-colors:outline", "forced-colors:outline-1", "sm:forced-colors:outline-0")
  })
})
