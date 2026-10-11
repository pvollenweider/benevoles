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

  it("gives the primary links the same 44 px minimum height", () => {
    const { container } = render(<EventActions eventId="evt-1" />)
    for (const a of PRIMARY_ACTIONS) expect(container.querySelector(`a[href$="/${a.path}"]`)).toHaveClass("min-h-11")
  })
})
