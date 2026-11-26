/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react"
import { renderToString } from "react-dom/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

import EventPageClient, { type EventData } from "@/app/[eventSlug]/EventPageClient"
import { SHIFT_VIEW_KEY } from "@/lib/shift-view"

// #808: « Frise » / « Liste », the choice kept on the device. #1407: with no choice, the list on a
// phone and the timeline from `sm` up; jsdom has no matchMedia, which counts as a wide screen.
const shift = (id: string, over: object = {}) => ({ id, roleName: "Bar", label: "Bar", description: null, date: "2030-06-01T00:00:00.000Z", startTime: "10:00", endTime: "12:00",
  capacity: 2, registered: 0, spotsLeft: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null, ...over })
const event = {
  id: "evt-1", slug: "fete", title: "Fête d'été", organizationName: "Org", description: null, location: "Genève",
  startDate: "2030-06-01T00:00:00.000Z", endDate: "2030-06-01T00:00:00.000Z", publicInstructions: null,
  confirmationMessage: null, requirePhone: false, registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
  timeZone: "Europe/Zurich", accentColorKey: null, showSchedule: [], volunteerCharter: null, hasOrgInsurance: true, pages: [], questions: [],
  shifts: [shift("s1"), shift("s2", { roleName: "Cuisine", label: "Cuisine", startTime: "08:00", endTime: "10:00", status: "full", spotsLeft: 0, registered: 2 })],
} satisfies EventData

describe("EventPageClient — Frise / Liste (#808)", () => {
  afterEach(() => { cleanup(); localStorage.clear(); Reflect.deleteProperty(window, "matchMedia"); vi.unstubAllGlobals() })

  it("renders both views in the server HTML, CSS showing the one for the screen", () => {
    const html = renderToString(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    // The two wrappers and the toggle look share one media query, computed from this event.
    expect(html).toContain("event-shift-view-narrow")
    expect(html).toContain("event-shift-view-wide")
    expect(html).toContain("@media (min-width:320px)")
    expect(html).not.toContain('aria-pressed="true"')
  })

  it("shows the timeline on a wide screen, the toggle named by its visible label", () => {
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

  it("shows the list on a phone, follows the phone turned sideways, and stops once a shift is picked", () => {
    const listeners = new Set<() => void>()
    let wide = false
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
      get matches() { return wide },
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    }) })
    const turn = (w: boolean) => act(() => { wide = w; listeners.forEach((l) => l()) })

    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    expect(screen.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true")
    turn(true)
    expect(screen.getByRole("button", { name: "Frise" })).toHaveAttribute("aria-pressed", "true")
    turn(false)
    const list = screen.getByRole("list", { name: /Créneaux du/ })
    fireEvent.click(within(list).getByRole("button", { name: "10h–12h · Bar 2 places libres sur 2" }))
    turn(true)
    expect(screen.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true")
    // Not a choice: nothing kept on the device.
    expect(localStorage.getItem(SHIFT_VIEW_KEY)).toBeNull()
  })

  it("stops following the width once the keyboard focus enters the shifts", () => {
    const listeners = new Set<() => void>()
    let wide = false
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
      get matches() { return wide },
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    }) })
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    const item = within(screen.getByRole("list", { name: /Créneaux du/ })).getAllByRole("button")[0]
    act(() => item.focus())
    act(() => { wide = true; listeners.forEach((l) => l()) })
    expect(item).toHaveFocus()
    expect(screen.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true")
  })

  it("follows the event's setting « Frise » on every width, without the « auto » double render", () => {
    const friseEvent = { ...event, publicShiftView: "frise" as const }
    const html = renderToString(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={friseEvent} />)
    // One view only, and its button is pressed without waiting for the width.
    expect(html).toContain("Planning du")
    expect(html).not.toContain("Créneaux du")
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain("event-shift-view-wide")
  })

  it("follows the event's setting « Liste » on a wide screen", () => {
    const listeEvent = { ...event, publicShiftView: "liste" as const }
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={listeEvent} />)
    expect(screen.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("region", { name: /Planning du/ })).not.toBeInTheDocument()
    expect(screen.getByRole("list", { name: /Créneaux du/ })).toBeInTheDocument()
  })

  it("shows the list on a wide screen for a long event, even in automatic", () => {
    const long = {
      ...event,
      startDate: "2030-06-01T00:00:00.000Z",
      endDate: "2030-10-31T00:00:00.000Z",
      shifts: [shift("s1", { date: "2030-06-02T00:00:00.000Z" })],
    }
    render(<EventPageClient orgSlug="org" eventSlug="saison" initialEvent={long} />)
    expect(screen.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("region", { name: /Planning du/ })).not.toBeInTheDocument()
  })

  it("lets a choice kept on the device win over the event's setting", () => {
    localStorage.setItem(SHIFT_VIEW_KEY, "liste")
    const friseEvent = { ...event, publicShiftView: "frise" as const }
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={friseEvent} />)
    expect(screen.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("list", { name: /Créneaux du/ })).toBeInTheDocument()
  })

  it("proposes turning the phone, then keeps the sentence's box while hiding it", async () => {
    const listeners = new Set<() => void>()
    let portrait = true
    Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({
      get matches() { return query === "(pointer: coarse)" ? true : query === "(orientation: portrait)" ? portrait : false },
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    }) })
    vi.stubGlobal("screen", { width: 390, height: 844 })

    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    const sentence = await screen.findByText("Tourne le téléphone pour voir la journée en frise.")
    expect(sentence).not.toHaveClass("invisible")

    // Turned sideways: the sentence stops holding, but keeps its place for the list.
    act(() => { portrait = false; listeners.forEach((l) => l()) })
    expect(screen.getByText("Tourne le téléphone pour voir la journée en frise.")).toHaveClass("invisible")
  })

  it("computes the automatic breakpoint from the event's shifts, capped at 640 px", () => {
    // 10–11 and 13–14: span 240 min, shortest 60 min -> 148 + 256 = 404 px.
    const narrow = { ...event, shifts: [shift("a", { startTime: "10:00", endTime: "11:00" }), shift("b", { startTime: "13:00", endTime: "14:00" })] }
    const narrowHtml = renderToString(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={narrow} />)
    expect(narrowHtml).toContain("@media (min-width:404px)")
    // 08:00–08:30 and 20:00–20:30: span 720 min, shortest 30 min -> far above 640: capped there.
    const wide = { ...event, shifts: [shift("a", { startTime: "08:00", endTime: "08:30" }), shift("b", { startTime: "20:00", endTime: "20:30" })] }
    const wideHtml = renderToString(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={wide} />)
    expect(wideHtml).toContain("@media (min-width:640px)")
  })
})
