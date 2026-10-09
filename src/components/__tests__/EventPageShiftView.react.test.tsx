/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react"
import { renderToString } from "react-dom/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

import EventPageClient, { type EventData } from "@/app/[eventSlug]/EventPageClient"
import { SHIFT_VIEW_KEY } from "@/lib/shift-view"

// #808: « Frise » by default, « Liste » chosen with the toggle and kept on the device.
const shift = (id: string, over: object = {}) => ({ id, roleName: "Bar", label: "Bar", description: null, date: "2030-06-01T00:00:00.000Z", startTime: "10:00", endTime: "12:00",
  capacity: 2, registered: 0, spotsLeft: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null, ...over })
const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: "Genève",
  startDate: "2030-06-01T00:00:00.000Z", endDate: "2030-06-01T00:00:00.000Z", publicInstructions: null,
  confirmationMessage: null, requirePhone: false, registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  timeZone: "Europe/Zurich", accentColorKey: null, showSchedule: [], volunteerCharter: null, pages: [], questions: [],
  shifts: [shift("s1"), shift("s2", { roleName: "Cuisine", label: "Cuisine", startTime: "08:00", endTime: "10:00", status: "full", spotsLeft: 0, registered: 2 })],
} satisfies EventData

describe("EventPageClient — Frise / Liste (#808)", () => {
  afterEach(() => { cleanup(); localStorage.clear() })

  it("shows the timeline first, in the server HTML too", () => {
    expect(renderToString(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)).toContain('aria-pressed="true"')
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    const group = screen.getByRole("group", { name: "Affichage des créneaux" })
    expect(within(group).getByRole("button", { name: "Frise" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("region", { name: /Planning du/ })).toBeInTheDocument()
  })

  it("switches to the list, keeps the focus, remembers it, and selects from the list", () => {
    const { unmount } = render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    const liste = screen.getByRole("button", { name: "Liste" })
    liste.focus()
    fireEvent.click(liste)
    expect(liste).toHaveAttribute("aria-pressed", "true")
    expect(liste).toHaveFocus()
    expect(localStorage.getItem(SHIFT_VIEW_KEY)).toBe("liste")

    const list = screen.getByRole("list", { name: /Créneaux du/ })
    const items = within(list).getAllByRole("button")
    // Reading order: the 8h shift first; its visible text is its name.
    expect(items[0]).toHaveAccessibleName("08h–10h · Cuisine Complet")
    expect(items[0]).toHaveAttribute("aria-disabled", "true")
    const bar = within(list).getByRole("button", { name: "10h–12h · Bar 2 places libres sur 2" })
    fireEvent.click(bar)
    expect(within(list).getByRole("button", { name: "10h–12h · Bar Sélectionné" })).toHaveAttribute("aria-pressed", "true")

    unmount()
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    expect(screen.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true")
  })
})
