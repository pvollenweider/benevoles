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
    const bar = screen.getByRole("button", { name: /^Sélectionner — Bar 18h–20h/ })
    expect(bar).toBeEnabled()
    expect(bar).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(bar)
    expect(onToggle).toHaveBeenCalledWith("a", "open")
  })

  // The public page moves focus to a withdrawn shift's bar when its list row is gone (#584).
  it("marks each bar with its shift id", () => {
    render(<DayTimeline shifts={[shift("a"), shift("b", { startTime: "20:00", endTime: "22:00" })]} shows={[]} selected={new Set()} onToggle={() => {}} />)
    expect(screen.getByRole("button", { name: /^Sélectionner — Bar 18h–20h/ })).toHaveAttribute("data-shift-id", "a")
    expect(screen.getByRole("button", { name: /^Sélectionner — Bar 20h–22h/ })).toHaveAttribute("data-shift-id", "b")
  })

  it("disables bars without an action verb when locked, and points the schedule at the reason", () => {
    render(
      <>
        <p id="why">Les inscriptions sont fermées pour le moment.</p>
        <DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set()} onToggle={() => {}} locked describedBy="why" />
      </>,
    )
    const bar = screen.getByRole("button", { name: /^Bar 18h–20h/ })
    expect(bar).toBeDisabled()
    expect(bar).not.toHaveAttribute("aria-pressed")
    expect(screen.getByRole("region")).toHaveAccessibleDescription("Les inscriptions sont fermées pour le moment.")
  })

  it("still lets a stale selection be removed once locked", () => {
    const onToggle = vi.fn()
    render(<DayTimeline shifts={[shift("a")]} shows={[]} selected={new Set(["a"])} onToggle={onToggle} locked />)
    const bar = screen.getByRole("button", { name: /^Désélectionner — Bar/ })
    expect(bar).toBeEnabled()
    fireEvent.click(bar)
    expect(onToggle).toHaveBeenCalledWith("a", "open")
  })

  it("says on a bar that the role's limit per person is reached (#466), without disabling it", () => {
    render(<DayTimeline shifts={[shift("a"), shift("b", { roleName: "Loge", label: "Loge" })]} shows={[]} selected={new Set()} onToggle={() => {}} limitReachedRoles={new Map([["Loge", 2]])} />)
    const loge = screen.getByRole("button", { name: /Loge 18h–20h.*\(limite de 2 par personne atteinte\)$/ })
    expect(loge).toBeEnabled()
    expect(screen.getByRole("button", { name: /^Sélectionner — Bar/ }).getAttribute("aria-label")).not.toMatch(/limite/)
  })

  it("shows a reserved role's bars in words and doesn't offer them (#470)", () => {
    render(<DayTimeline shifts={[shift("a", { roleName: "Sécurité", label: "Sécurité" })]} shows={[]} selected={new Set()} onToggle={() => {}} reservedShiftIds={new Set(["a"])} />)
    const bar = screen.getByRole("button", { name: "Sécurité 18h–20h, réservé à certains membres" })
    expect(bar).toBeDisabled()
    expect(bar).not.toHaveAttribute("aria-pressed")
    expect(screen.getByText("Réservé")).toBeInTheDocument()
  })
})
