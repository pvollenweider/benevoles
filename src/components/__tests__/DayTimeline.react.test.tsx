/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

import DayTimeline, { type TimelineShift } from "../DayTimeline"

const shift = (id: string, over: Partial<TimelineShift> = {}): TimelineShift => ({
  id, roleName: "Bar", label: "Bar", startTime: "18:00", endTime: "20:00", status: "open", capacity: 5, registered: 2, spotsLeft: 3, ...over,
})

// Registrations closed (#463): the schedule stays readable, but bars are no longer offered as choices.
describe("DayTimeline", () => {
  afterEach(cleanup)

  // A show past midnight (21:00–01:00) collapsed to its minimum width on the public frise.
  it("draws an overnight show over its four hours", () => {
    const { container } = render(<DayTimeline shifts={[shift("a", { startTime: "20:00", endTime: "23:00" })]} shows={[{ name: "Bal populaire", date: "2026-07-04", startTime: "21:00", endTime: "01:00" }]} selected={new Set()} onToggle={() => {}} />)
    // The axis runs 20:00–01:00 (300 min): the show is 240 of them, from 60.
    const band = container.querySelector<HTMLElement>(".bg-indigo-50.border-x")!
    expect(parseFloat(band.style.left)).toBeCloseTo(20)
    expect(parseFloat(band.style.width)).toBeCloseTo(80)
    const label = screen.getByText(/Bal populaire/).closest("div") as HTMLElement
    expect(parseFloat(label.style.width)).toBeCloseTo(80)
  })

  it("offers each open shift as a toggle while registrations are open", () => {
    const onToggle = vi.fn()
    render(<DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set()} onToggle={onToggle} />)
    const bar = screen.getByRole("button", { name: /^18h–20h \d+\/\d+, Bar : sélectionner/ })
    expect(bar).toBeEnabled()
    expect(bar).not.toHaveAttribute("aria-disabled")
    expect(bar).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(bar)
    expect(onToggle).toHaveBeenCalledWith("a", "open")
  })

  // axe-core 4.14 (label-content-name-mismatch) read « 18h–20h2/5 »: a space keeps the time and the
  // count two words, as the bar's name says them (WCAG 2.5.3).
  it("separates the time and the count of a bar by a space", () => {
    render(<DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set()} onToggle={() => {}} />)
    const bar = screen.getByRole("button", { name: /^18h–20h 2\/5, Bar : sélectionner/ })
    expect(bar.textContent).toMatch(/18h–20h 2\/5$/)
  })

  // The public page moves focus to a withdrawn shift's bar when its list row is gone (#584).
  it("marks each bar with its shift id", () => {
    render(<DayTimeline shifts={[shift("a"), shift("b", { startTime: "20:00", endTime: "22:00" })]} shows={[]} selected={new Set()} onToggle={() => {}} />)
    expect(screen.getByRole("button", { name: /^18h–20h \d+\/\d+, Bar : sélectionner/ })).toHaveAttribute("data-shift-id", "a")
    expect(screen.getByRole("button", { name: /^20h–22h \d+\/\d+, Bar : sélectionner/ })).toHaveAttribute("data-shift-id", "b")
  })

  it("disables bars without an action verb when locked, says why, and points the schedule at the reason", () => {
    render(
      <>
        <p id="why">Les inscriptions sont fermées pour le moment.</p>
        <DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set()} onToggle={() => {}} locked describedBy="why" />
      </>,
    )
    const bar = screen.getByRole("button", { name: "18h–20h 2/5, Bar (3 places libres sur 5) : inscriptions fermées" })
    expect(bar).toHaveAttribute("aria-disabled", "true")
    expect(bar).not.toHaveAttribute("aria-pressed")
    expect(screen.getByRole("region")).toHaveAccessibleDescription(/Flèches gauche et droite.*Les inscriptions sont fermées pour le moment\.$/)
  })

  it("still lets a stale selection be removed once locked", () => {
    const onToggle = vi.fn()
    render(<DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set(["a"])} onToggle={onToggle} locked />)
    const bar = screen.getByRole("button", { name: /^18h–20h \d+\/\d+, Bar : désélectionner/ })
    expect(bar).toBeEnabled()
    fireEvent.click(bar)
    expect(onToggle).toHaveBeenCalledWith("a", "open")
  })

  it("says on a bar that the role's limit per person is reached (#466), without disabling it", () => {
    render(<DayTimeline shifts={[shift("a"), shift("b", { roleName: "Loge", label: "Loge" })]} shows={[]} selected={new Set()} onToggle={() => {}} limitReachedRoles={new Map([["Loge", 2]])} />)
    const loge = screen.getByRole("button", { name: "18h–20h 2/5, Loge : sélectionner (3 places libres sur 5) (limite de 2 créneaux par personne atteinte)" })
    expect(loge).toBeEnabled()
    expect(screen.getByRole("button", { name: /, Bar : sélectionner/ }).getAttribute("aria-label")).not.toMatch(/limite/)
  })

  // #1023: the reason was only in the name; it is shown under the bar too, short on a narrow bar.
  it("shows the limit under the bar, in the name's words, without announcing it twice", () => {
    render(<DayTimeline shifts={[shift("a"), shift("b", { roleName: "Loge", label: "Loge", minAge: 18 })]} shows={[]} selected={new Set()} onToggle={() => {}} limitReachedRoles={new Map([["Loge", 2]])} />)
    const loge = screen.getByRole("button", { name: /Loge/ })
    const line = loge.parentElement!.querySelector<HTMLElement>("[aria-hidden='true']")!
    expect(line).toHaveTextContent("Limite atteinte")
    expect(line).toHaveTextContent("Limite de 2 créneaux par personne atteinte")
    expect(line).toHaveTextContent("18+")
    expect(screen.getByText("Limite atteinte").className).toMatch(/@min-\[260px\]:hidden/)
    expect(screen.getByText("Limite de 2 créneaux par personne atteinte").className).toMatch(/\bhidden @min-\[260px\]:inline/)
    expect(loge.getAttribute("aria-label")!.toLowerCase()).toContain("limite de 2 créneaux par personne atteinte")
    // The bar of another role, and the selected bar of this one, say nothing of it.
    expect(screen.queryAllByText(/Limite/)).toHaveLength(2)
  })

  it("drops the limit from a selected bar of the role", () => {
    render(<DayTimeline shifts={[shift("b", { roleName: "Loge", label: "Loge" })]} shows={[]} selected={new Set(["b"])} onToggle={() => {}} limitReachedRoles={new Map([["Loge", 1]])} />)
    expect(screen.queryByText(/Limite/)).toBeNull()
    expect(screen.getByRole("button", { name: /Loge : désélectionner/ }).getAttribute("aria-label")).not.toMatch(/limite/)
  })

  it("shows a reserved role's bars in words and doesn't offer them (#470)", () => {
    render(<DayTimeline shifts={[shift("a", { roleName: "Sécurité", label: "Sécurité" })]} shows={[]} selected={new Set()} onToggle={() => {}} reservedShiftIds={new Set(["a"])} />)
    const bar = screen.getByRole("button", { name: "Réservé, Sécurité 18h–20h : réservé à certains membres" })
    expect(bar).toHaveAttribute("aria-disabled", "true")
    expect(bar).not.toHaveAttribute("aria-pressed")
    expect(screen.getByText("Réservé")).toBeInTheDocument()
  })

  // A shift the visitor already holds (#534): its own name and tag, not a selected toggle.
  it("draws a held shift as theirs: aria-disabled, no toggle state, named and tagged, no selection ring", () => {
    render(<DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set(["a"])} held={new Map([["a", "active"]])} onToggle={() => {}} />)
    const bar = screen.getByRole("button", { name: "18h–20h, Bar : inscription confirmée" })
    expect(bar).toHaveAttribute("aria-disabled", "true")
    expect(bar).not.toHaveAttribute("aria-pressed")
    expect(bar).toHaveAttribute("data-shift-id", "a")
    expect(bar.className).not.toMatch(/\bring-/)
    expect(bar.style.outline).toBe("")
    expect(bar.className).not.toContain("outline-[rgba")
    expect(bar.style.backgroundImage).toBe("")
    expect(screen.getByText("Ton créneau")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /lectionner/ })).toBeNull()
  })

  it("says a held full shift is confirmed, not « Complet », without the full hatch", () => {
    render(<DayTimeline shifts={[shift("a", { status: "full", registered: 5, spotsLeft: 0 })]} shows={[]} selected={new Set(["a"])} held={new Map([["a", "active"]])} onToggle={() => {}} />)
    const bar = screen.getByRole("button", { name: "18h–20h, Bar : inscription confirmée" })
    expect(bar.style.backgroundImage).toBe("")
    expect(bar.style.outline).toBe("")
    expect(bar.className).not.toContain("outline-[rgba")
    expect(screen.queryByText("Complet")).toBeNull()
  })

  it("tags each held status", () => {
    render(
      <DayTimeline
        shifts={[shift("a"), shift("b", { startTime: "20:00", endTime: "22:00" }), shift("c", { startTime: "22:00", endTime: "23:00" }), shift("d", { startTime: "14:00", endTime: "16:00" })]}
        shows={[]} selected={new Set()} onToggle={() => {}}
        held={new Map([["a", "requested"], ["b", "waiting"], ["c", "offered"], ["d", "active"]])}
        conflicts={new Set(["a"])} reservedShiftIds={new Set(["b"])}
      />,
    )
    expect(screen.getByRole("button", { name: "18h–20h, Bar : demande envoyée, en attente de validation" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "20h–22h, Bar : en liste d'attente" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "22h–23h, Bar : place proposée, à accepter sur ta page personnelle" })).toHaveAttribute("aria-disabled", "true")
    for (const tag of ["Demande envoyée", "En liste d'attente", "Place proposée", "Ton créneau"]) expect(screen.getByText(tag)).toBeInTheDocument()
    expect(screen.queryByText("Réservé")).toBeNull()
  })

  // #583: a focused bar's outline is not covered by the role labels (z-10) nor by the next bar.
  it("raises the focused bar above the role labels and its neighbours", () => {
    render(<DayTimeline shifts={[shift("a"), shift("b", { startTime: "20:00", endTime: "22:00" })]} shows={[]} selected={new Set()} onToggle={() => {}} />)
    for (const bar of screen.getAllByRole("button")) expect(bar.parentElement).toHaveClass("focus-within:z-20")
  })

  // #583: in forced colours the background is dropped; a border on all four sides keeps the bar visible.
  it("gives every bar a border on all sides and a forced-colours pressed state", () => {
    render(<DayTimeline shifts={[shift("a"), shift("b", { startTime: "20:00", endTime: "22:00", status: "full" })]} shows={[]} selected={new Set(["a"])} onToggle={() => {}} />)
    for (const bar of screen.getAllByRole("button")) {
      expect(bar).toHaveClass("border", "border-transparent", "forced-colors:aria-pressed:bg-[Highlight]")
      expect(bar.className).not.toMatch(/HighlightText/)
    }
  })

  // Held and unavailable bars are both aria-disabled (GrayText in forced colours, as the system
  // painted them when they were disabled): the held one keeps a system-text frame so it stays distinct.
  it("frames a held bar in forced colours, not an unavailable one", () => {
    render(<DayTimeline shifts={[shift("a"), shift("b", { startTime: "20:00", endTime: "22:00", status: "full" })]} shows={[]} selected={new Set()} held={new Map([["a", "active"]])} onToggle={() => {}} />)
    expect(screen.getByRole("button", { name: "18h–20h, Bar : inscription confirmée" })).toHaveClass("forced-colors:border-2", "forced-colors:border-[CanvasText]")
    const full = document.querySelector('[data-shift-id="b"]')
    expect(full).toHaveAttribute("aria-disabled", "true")
    expect(full).not.toHaveClass("forced-colors:border-[CanvasText]")
    expect(full).toHaveClass("forced-colors:aria-disabled:text-[GrayText]", "forced-colors:aria-disabled:border-[GrayText]")
  })

  it("names each day's schedule after its day", () => {
    render(<DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set()} onToggle={() => {}} dayLabel="samedi 4 juillet" />)
    expect(screen.getByRole("region", { name: "Planning du samedi 4 juillet" })).toBeInTheDocument()
  })
})

// « Voir qui est inscrit » (#1068): bars unchanged; one line under the day says who is on the bar
// hovered, tapped or focused last; a bar's description says the same.
describe("DayTimeline with the roster", () => {
  afterEach(cleanup)
  const entry = (shiftId: string, names: string[], othersCount: number) =>
    ({ shiftId, label: "Bar", date: "2031-06-06T00:00:00.000Z", startTime: "18:00", endTime: "20:00", names, othersCount, own: false })

  it("a prompt first, then the last bar's roster, kept until another; the bar's description", () => {
    const roster = new Map([["a", entry("a", ["Aline M."], 1)]])
    render(<DayTimeline shifts={[shift("a"), shift("b", { startTime: "20:00", endTime: "22:00" })]} shows={[]} selected={new Set()} onToggle={() => {}} roster={roster} />)
    expect(screen.getByText(/Touche, survole ou sélectionne/)).toBeInTheDocument()
    const a = screen.getByRole("button", { name: /^18h–20h/ })
    expect(a).toHaveAccessibleDescription("Sur ce créneau : Aline, initiale M et 1 autre bénévole.")
    fireEvent.focus(a)
    expect(screen.getByText("Bar · 18h–20h")).toBeInTheDocument()
    fireEvent.pointerLeave(a)
    expect(screen.getByText("Bar · 18h–20h")).toBeInTheDocument()
    const b = screen.getByRole("button", { name: /^20h–22h/ })
    expect(b).toHaveAccessibleDescription("Sur ce créneau : personne d'autre pour l'instant.")
    fireEvent.click(b)
    expect(screen.getByText("Bar · 20h–22h")).toBeInTheDocument()
  })

  it("a full (aria-disabled) bar lets the tap through to update the line", () => {
    const roster = new Map([["f", entry("f", ["Zoé R."], 0)]])
    render(<DayTimeline shifts={[shift("f", { status: "full", registered: 5, spotsLeft: 0 })]} shows={[]} selected={new Set()} onToggle={() => {}} roster={roster} />)
    const bar = screen.getByRole("button")
    expect(bar).toHaveAttribute("aria-disabled", "true")
    expect(bar.className).toContain("pointer-events-none")
    fireEvent.click(bar.parentElement!)
    expect(screen.getByText("Bar · 18h–20h")).toBeInTheDocument()
  })

  it("nothing of the roster without the switch", () => {
    render(<DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set()} onToggle={() => {}} />)
    expect(screen.queryByText(/Touche, survole ou sélectionne/)).toBeNull()
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-describedby")
  })
})

// #1075: every bar reachable with the keyboard, one tab stop per day, arrows between the bars.
describe("DayTimeline with the keyboard", () => {
  afterEach(cleanup)
  const day = [
    shift("full", { startTime: "08:00", endTime: "10:00", status: "full", registered: 5, spotsLeft: 0 }),
    shift("open", { startTime: "10:00", endTime: "12:00" }),
    shift("acc", { roleName: "Accueil", label: "Accueil", startTime: "09:00", endTime: "11:00", displayOrder: 1 }),
  ]
  const bar = (id: string) => document.querySelector<HTMLButtonElement>(`[data-shift-id="${id}"]`)!
  const stops = () => [...document.querySelectorAll("[data-shift-id]")].filter((b) => b.getAttribute("tabindex") === "0")

  it("one tab stop, on the first bar that can be chosen; the others out of the Tab order, none disabled", () => {
    render(<DayTimeline shifts={day} shows={[]} selected={new Set()} onToggle={() => {}} />)
    expect(stops()).toEqual([bar("open")])
    for (const id of ["full", "acc"]) expect(bar(id)).toHaveAttribute("tabindex", "-1")
    for (const b of screen.getAllByRole("button")) expect(b).not.toBeDisabled()
    expect(bar("full")).toHaveAttribute("aria-disabled", "true")
    expect(bar("full")).toHaveAccessibleName("Complet, Bar 08h–10h")
  })

  it("arrows move the focus and the tab stop, a full bar included; Ctrl+End to the day's last bar", () => {
    render(<DayTimeline shifts={day} shows={[]} selected={new Set()} onToggle={() => {}} />)
    bar("open").focus()
    fireEvent.keyDown(bar("open"), { key: "ArrowLeft" })
    expect(document.activeElement).toBe(bar("full"))
    expect(stops()).toEqual([bar("full")])
    fireEvent.keyDown(bar("full"), { key: "ArrowDown" })
    expect(document.activeElement).toBe(bar("acc"))
    fireEvent.keyDown(bar("acc"), { key: "ArrowUp" })
    // Accueil 09h–11h shares an hour with both Bar shifts: the earlier one wins.
    expect(document.activeElement).toBe(bar("full"))
    fireEvent.keyDown(bar("full"), { key: "End", ctrlKey: true })
    expect(document.activeElement).toBe(bar("acc"))
    expect(stops()).toEqual([bar("acc")])
  })

  it("keeps the arrows from scrolling at an end, and leaves Tab and modified keys alone", () => {
    render(<DayTimeline shifts={day} shows={[]} selected={new Set()} onToggle={() => {}} />)
    bar("full").focus()
    expect(fireEvent.keyDown(bar("full"), { key: "ArrowLeft" })).toBe(false) // default prevented
    expect(document.activeElement).toBe(bar("full"))
    expect(fireEvent.keyDown(bar("full"), { key: "Tab" })).toBe(true)
    expect(fireEvent.keyDown(bar("full"), { key: "ArrowRight", shiftKey: true })).toBe(true)
    expect(document.activeElement).toBe(bar("full"))
  })

  // An inline outline beat the focus outline of a full bar once it could take the focus.
  it("draws a full bar's faint frame with classes, so its focus outline shows", () => {
    render(<DayTimeline shifts={day} shows={[]} selected={new Set()} onToggle={() => {}} />)
    expect(bar("full").style.outline).toBe("")
    expect(bar("full")).toHaveClass("not-focus-visible:outline", "not-focus-visible:outline-[rgba(0,0,0,0.07)]")
    expect(bar("open").className).not.toContain("outline-[rgba")
  })

  it("a bar that can't be chosen does nothing when pressed, a free one still toggles", () => {
    const onToggle = vi.fn()
    render(<DayTimeline shifts={day} shows={[]} selected={new Set()} onToggle={onToggle} />)
    fireEvent.click(bar("full"))
    expect(onToggle).not.toHaveBeenCalled()
    fireEvent.click(bar("open"))
    expect(onToggle).toHaveBeenCalledWith("open", "open")
  })

  it("a touch on a bar moves the tab stop (Safari does not focus it)", () => {
    render(<DayTimeline shifts={day} shows={[]} selected={new Set()} onToggle={() => {}} />)
    fireEvent.click(bar("acc").parentElement!)
    expect(stops()).toEqual([bar("acc")])
  })

  it("the first bar holds the tab stop when none can be chosen", () => {
    render(<DayTimeline shifts={day} shows={[]} selected={new Set()} onToggle={() => {}} locked />)
    expect(stops()).toEqual([bar("full")])
  })

  it("says the keys in the region, and shows them only under a keyboard focus", () => {
    render(<DayTimeline shifts={day} shows={[]} selected={new Set()} onToggle={() => {}} dayLabel="samedi 4 juillet" />)
    const region = screen.getByRole("region", { name: "Planning du samedi 4 juillet" })
    expect(region).toHaveAccessibleDescription(/^Flèches gauche et droite : créneaux du même poste\./)
    expect(region.firstElementChild).toHaveClass("sr-only")
    const shown = document.querySelector("[data-frise-keys]")!
    expect(shown).toHaveAttribute("aria-hidden", "true")
    expect(shown).toHaveClass("hidden", "peer-has-[:focus-visible]:block")
    expect(region).toHaveClass("peer")
  })

  it("with the roster, an arrow to a full bar brings up its line", () => {
    const roster = new Map([["full", { shiftId: "full", label: "Bar", date: "2031-06-06T00:00:00.000Z", startTime: "08:00", endTime: "10:00", names: ["Zoé R."], othersCount: 0, own: false }]])
    render(<DayTimeline shifts={day} shows={[]} selected={new Set()} onToggle={() => {}} roster={roster} />)
    bar("open").focus()
    fireEvent.keyDown(bar("open"), { key: "ArrowLeft" })
    expect(bar("full")).toHaveAccessibleDescription("Sur ce créneau : Zoé, initiale R.")
    expect(screen.getByText("Bar · 08h–10h")).toBeInTheDocument()
  })
})
