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

  it("offers each open shift as a toggle while registrations are open", () => {
    const onToggle = vi.fn()
    render(<DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set()} onToggle={onToggle} />)
    const bar = screen.getByRole("button", { name: /^18h–20h \d+\/\d+, Bar : sélectionner/ })
    expect(bar).toBeEnabled()
    expect(bar).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(bar)
    expect(onToggle).toHaveBeenCalledWith("a", "open")
  })

  // The public page moves focus to a withdrawn shift's bar when its list row is gone (#584).
  it("marks each bar with its shift id", () => {
    render(<DayTimeline shifts={[shift("a"), shift("b", { startTime: "20:00", endTime: "22:00" })]} shows={[]} selected={new Set()} onToggle={() => {}} />)
    expect(screen.getByRole("button", { name: /^18h–20h \d+\/\d+, Bar : sélectionner/ })).toHaveAttribute("data-shift-id", "a")
    expect(screen.getByRole("button", { name: /^20h–22h \d+\/\d+, Bar : sélectionner/ })).toHaveAttribute("data-shift-id", "b")
  })

  it("disables bars without an action verb when locked, and points the schedule at the reason", () => {
    render(
      <>
        <p id="why">Les inscriptions sont fermées pour le moment.</p>
        <DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set()} onToggle={() => {}} locked describedBy="why" />
      </>,
    )
    const bar = screen.getByRole("button", { name: "18h–20h 2/5, Bar (3 places libres sur 5)" })
    expect(bar).toBeDisabled()
    expect(bar).not.toHaveAttribute("aria-pressed")
    expect(screen.getByRole("region")).toHaveAccessibleDescription("Les inscriptions sont fermées pour le moment.")
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
    const loge = screen.getByRole("button", { name: /^18h–20h \d+\/\d+, Loge : sélectionner.*\(limite de 2 par personne atteinte\)$/ })
    expect(loge).toBeEnabled()
    expect(screen.getByRole("button", { name: /, Bar : sélectionner/ }).getAttribute("aria-label")).not.toMatch(/limite/)
  })

  it("shows a reserved role's bars in words and doesn't offer them (#470)", () => {
    render(<DayTimeline shifts={[shift("a", { roleName: "Sécurité", label: "Sécurité" })]} shows={[]} selected={new Set()} onToggle={() => {}} reservedShiftIds={new Set(["a"])} />)
    const bar = screen.getByRole("button", { name: "Réservé, Sécurité 18h–20h : réservé à certains membres" })
    expect(bar).toBeDisabled()
    expect(bar).not.toHaveAttribute("aria-pressed")
    expect(screen.getByText("Réservé")).toBeInTheDocument()
  })

  // A shift the visitor already holds (#534): its own name and tag, not a selected toggle.
  it("draws a held shift as theirs: disabled, no toggle state, named and tagged, no selection ring", () => {
    render(<DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set(["a"])} held={new Map([["a", "active"]])} onToggle={() => {}} />)
    const bar = screen.getByRole("button", { name: "18h–20h, Bar : inscription confirmée" })
    expect(bar).toBeDisabled()
    expect(bar).not.toHaveAttribute("aria-pressed")
    expect(bar).toHaveAttribute("data-shift-id", "a")
    expect(bar.className).not.toMatch(/\bring-/)
    expect(bar.style.outline).toBe("")
    expect(bar.style.backgroundImage).toBe("")
    expect(screen.getByText("Ton créneau")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /lectionner/ })).toBeNull()
  })

  it("says a held full shift is confirmed, not « Complet », without the full hatch", () => {
    render(<DayTimeline shifts={[shift("a", { status: "full", registered: 5, spotsLeft: 0 })]} shows={[]} selected={new Set(["a"])} held={new Map([["a", "active"]])} onToggle={() => {}} />)
    const bar = screen.getByRole("button", { name: "18h–20h, Bar : inscription confirmée" })
    expect(bar.style.backgroundImage).toBe("")
    expect(bar.style.outline).toBe("")
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
    expect(screen.getByRole("button", { name: "18h–20h, Bar : demande envoyée, en attente de validation" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "20h–22h, Bar : en liste d'attente" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "22h–23h, Bar : place proposée, à accepter sur ta page personnelle" })).toBeDisabled()
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

  // Held and unavailable bars are both disabled (GrayText in forced colours): the held one keeps a
  // system-text frame so it stays distinct there.
  it("frames a held bar in forced colours, not an unavailable one", () => {
    render(<DayTimeline shifts={[shift("a"), shift("b", { startTime: "20:00", endTime: "22:00", status: "full" })]} shows={[]} selected={new Set()} held={new Map([["a", "active"]])} onToggle={() => {}} />)
    expect(screen.getByRole("button", { name: "18h–20h, Bar : inscription confirmée" })).toHaveClass("forced-colors:border-2", "forced-colors:border-[CanvasText]")
    const full = document.querySelector('[data-shift-id="b"]')
    expect(full).toBeDisabled()
    expect(full).not.toHaveClass("forced-colors:border-[CanvasText]")
  })

  it("names each day's schedule after its day", () => {
    render(<DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set()} onToggle={() => {}} dayLabel="samedi 4 juillet" />)
    expect(screen.getByRole("region", { name: "Planning du samedi 4 juillet" })).toBeInTheDocument()
  })
})
