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
})
