/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, within, act, waitFor } from "@testing-library/react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

import EventPageClient, { type EventData } from "@/app/[eventSlug]/EventPageClient"
import { SHIFT_VIEW_HINT_KEY, SHIFT_VIEW_KEY } from "@/lib/shift-view"

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
  afterEach(() => { cleanup(); localStorage.clear(); Reflect.deleteProperty(window, "matchMedia"); vi.unstubAllGlobals(); vi.restoreAllMocks() })

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
    // 10–11 and 13–14: span 240 min, shortest 60 min -> 150 + 256 = 406 px.
    const narrow = { ...event, shifts: [shift("a", { startTime: "10:00", endTime: "11:00" }), shift("b", { startTime: "13:00", endTime: "14:00" })] }
    const narrowHtml = renderToString(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={narrow} />)
    expect(narrowHtml).toContain("@media (min-width:406px)")
    // 08:00–08:30 and 20:00–20:30 are 30 min shifts: no width makes them readable (60 px at most),
    // so the day is never the default and the 640 px cap applies.
    const wide = { ...event, shifts: [shift("a", { startTime: "08:00", endTime: "08:30" }), shift("b", { startTime: "20:00", endTime: "20:30" })] }
    const wideHtml = renderToString(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={wide} />)
    expect(wideHtml).toContain("@media (min-width:640px)")
  })
  // ── The measured column (#1407): a sentence that follows the real card width ──────────────
  it("measures the remounted column again after a round trip to the sign-up form", () => {
    let columnWidth = 200
    const observers: { cb: () => void; els: Set<Element>; disconnected: boolean }[] = []
    class FakeResizeObserver {
      els = new Set<Element>()
      disconnected = false
      constructor(public cb: () => void) { observers.push(this) }
      observe(el: Element) { this.els.add(el) }
      unobserve(el: Element) { this.els.delete(el) }
      disconnect() { this.disconnected = true; this.els.clear() }
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver)
    const proto = window.HTMLElement.prototype
    const original = Object.getOwnPropertyDescriptor(proto, "clientWidth")
    Object.defineProperty(proto, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) { return this.classList?.contains("space-y-6") ? columnWidth : 0 },
    })
    try {
      // A saved « Frise » shows the timeline; its card is 200 px wide, under its 260 px min-width.
      localStorage.setItem(SHIFT_VIEW_KEY, "frise")
      const { container } = render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
      expect(screen.getByText(/Fais défiler pour voir toutes les plages/)).toBeInTheDocument()

      // Pick a shift, open the form: the measured column unmounts.
      const region = screen.getByRole("region", { name: /Planning du/ })
      fireEvent.click(within(region).getAllByRole("button")[0])
      fireEvent.click(screen.getAllByRole("button", { name: /^Continuer/ })[0])
      expect(container.querySelector(".space-y-6")).toBeNull()
      // The detached column reports a zero width (a browser may do so on removal). The observer
      // created once for the old node keeps it and never measures the column mounted again.
      columnWidth = 0
      for (const o of observers) if (!o.disconnected) o.cb()
      columnWidth = 200

      fireEvent.click(screen.getByRole("button", { name: /Retour/ }))
      expect(screen.getByText(/Fais défiler pour voir toutes les plages/)).toBeInTheDocument()
    } finally {
      if (original) Object.defineProperty(proto, "clientWidth", original)
      else Reflect.deleteProperty(proto, "clientWidth")
      vi.unstubAllGlobals()
    }
  })

  // ── The one-time hint (#1407, part C) ─────────────────────────────────────────────────────
  const listeEvent = { ...event, publicShiftView: "liste" as const }
  const flushFrame = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })

  it("reserves the rotate sentence's line in the server HTML, hidden from the accessibility tree", () => {
    const html = renderToString(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={event} />)
    expect(html).toContain("event-shift-rotate-narrow")
    expect(html).toContain("Tourne le téléphone pour voir la journée en frise.")
    expect(html).toContain("invisible")
  })

  it("renders no rotate sentence when the threshold is not a positive number", () => {
    const long = { ...event, startDate: "2030-06-01T00:00:00.000Z", endDate: "2030-10-31T00:00:00.000Z" }
    for (const e of [{ ...event, publicShiftView: "frise" as const }, { ...event, publicShiftView: "liste" as const }, long]) {
      const html = renderToString(<EventPageClient orgSlug="org" eventSlug="x" initialEvent={e} />)
      expect(html).not.toContain("Tourne le téléphone pour voir la journée en frise.")
      expect(html).not.toContain("event-shift-rotate-narrow")
    }
  })

  it("never plays the hint in the admin preview", async () => {
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={listeEvent} preview={{ eventId: "evt-1", adminEventUrl: "/admin/events/evt-1" }} />)
    await flushFrame()
    expect(screen.getByRole("button", { name: "Frise" })).not.toHaveClass("shift-view-hint")
    expect(localStorage.getItem(SHIFT_VIEW_HINT_KEY)).toBeNull()
  })

  it("never plays the hint in the embed", async () => {
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={listeEvent} embed />)
    await flushFrame()
    expect(screen.getByRole("button", { name: "Frise" })).not.toHaveClass("shift-view-hint")
    expect(localStorage.getItem(SHIFT_VIEW_HINT_KEY)).toBeNull()
  })


  it("writes the flag when the hint starts, not before the animation frame", async () => {
    let frame: FrameRequestCallback | null = null
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { frame = cb; return 1 })
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={listeEvent} />)
    const frise = screen.getByRole("button", { name: "Frise" })
    await waitFor(() => expect(frame).not.toBeNull())
    // Scheduled, not started: nothing played, nothing written.
    expect(frise).not.toHaveClass("shift-view-hint")
    expect(localStorage.getItem(SHIFT_VIEW_HINT_KEY)).toBeNull()
    act(() => frame?.(0))
    expect(frise).toHaveClass("shift-view-hint")
    expect(localStorage.getItem(SHIFT_VIEW_HINT_KEY)).toBe("1")
  })

  it("plays the hint once, writes the flag only when it starts, and never again", async () => {
    const first = render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={listeEvent} />)
    const frise = screen.getByRole("button", { name: "Frise" })
    await waitFor(() => expect(frise).toHaveClass("shift-view-hint"))
    expect(localStorage.getItem(SHIFT_VIEW_HINT_KEY)).toBe("1")
    first.unmount()

    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={listeEvent} />)
    await flushFrame()
    expect(screen.getByRole("button", { name: "Frise" })).not.toHaveClass("shift-view-hint")
  })

  it("writes no flag under reduced motion", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      addEventListener: () => {},
      removeEventListener: () => {},
    }) })
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={listeEvent} />)
    await flushFrame()
    expect(screen.getByRole("button", { name: "Frise" })).not.toHaveClass("shift-view-hint")
    expect(localStorage.getItem(SHIFT_VIEW_HINT_KEY)).toBeNull()
  })

  it("removes the hint on a pointerdown inside the group", async () => {
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={listeEvent} />)
    const frise = screen.getByRole("button", { name: "Frise" })
    await waitFor(() => expect(frise).toHaveClass("shift-view-hint"))
    fireEvent.pointerDown(frise)
    expect(frise).not.toHaveClass("shift-view-hint")
  })

  it("removes the hint on a focus inside the group", async () => {
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={listeEvent} />)
    const frise = screen.getByRole("button", { name: "Frise" })
    await waitFor(() => expect(frise).toHaveClass("shift-view-hint"))
    act(() => frise.focus())
    expect(frise).not.toHaveClass("shift-view-hint")
  })

  it("removes the hint when a view is chosen", async () => {
    render(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={listeEvent} />)
    const frise = screen.getByRole("button", { name: "Frise" })
    await waitFor(() => expect(frise).toHaveClass("shift-view-hint"))
    fireEvent.click(screen.getByRole("button", { name: "Liste" }))
    expect(frise).not.toHaveClass("shift-view-hint")
  })

  // ── Hydration (#1407): the server HTML and the first client render agree ──────────────────
  it.each([
    ["a positive threshold", event],
    ["the setting « Frise »", { ...event, publicShiftView: "frise" as const }],
    ["the setting « Liste »", { ...event, publicShiftView: "liste" as const }],
  ])("hydrates the server HTML for %s without a hydration warning", async (_label, initialEvent) => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    container.innerHTML = renderToString(<EventPageClient orgSlug="org" eventSlug="fete" initialEvent={initialEvent} />)
    const errors: string[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { errors.push(args.map(String).join(" ")) })
    let root: Root | undefined
    act(() => { root = hydrateRoot(container, <EventPageClient orgSlug="org" eventSlug="fete" initialEvent={initialEvent} />) })
    await act(async () => {})
    spy.mockRestore()
    act(() => root?.unmount())
    container.remove()
    expect(errors.filter((e) => /hydrat|did not match/i.test(e))).toEqual([])
  })

})
