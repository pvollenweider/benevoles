/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"

import ShiftsManager from "../admin/ShiftsManager"
import type { RawShift } from "../admin/shifts/types"

// The timeline is a heavy drag-and-drop component that the view toggle does not depend on.
vi.mock("../admin/AdminDayTimeline", () => ({ default: () => null }))

// « Timeline / Liste » view toggle (#554): two toggle buttons in a named group.

const shift: RawShift = {
  id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
  capacity: 2, status: "open", registrationCount: 0, displayOrder: 0,
}

function renderManager() {
  return render(
    <ShiftsManager eventId="evt-1" eventStartDate="2026-07-04" eventEndDate="2026-07-04" initialShifts={[shift]} />,
  )
}

describe("ShiftsManager view toggle", () => {
  afterEach(cleanup)

  it("groups Timeline and Liste as toggle buttons, Timeline pressed by default", () => {
    renderManager()
    const group = screen.getByRole("group", { name: "Affichage des créneaux" })
    const timeline = within(group).getByRole("button", { name: "Timeline" })
    const list = within(group).getByRole("button", { name: "Liste" })
    expect(timeline).toHaveAttribute("aria-pressed", "true")
    expect(list).toHaveAttribute("aria-pressed", "false")
    expect(timeline).toHaveAttribute("type", "button")
    expect(list).toHaveAttribute("type", "button")
  })

  it("switches to the list: pressed states flip, Liste keeps focus, the table is shown", () => {
    renderManager()
    const timeline = screen.getByRole("button", { name: "Timeline" })
    const list = screen.getByRole("button", { name: "Liste" })
    expect(screen.queryByRole("table")).not.toBeInTheDocument()

    list.focus()
    fireEvent.click(list)

    expect(list).toHaveAttribute("aria-pressed", "true")
    expect(timeline).toHaveAttribute("aria-pressed", "false")
    expect(list).toHaveFocus()
    expect(screen.getByRole("table")).toBeInTheDocument()
  })

  it("does not clip the focus outline with overflow-hidden on the group (regression)", () => {
    renderManager()
    const group = screen.getByRole("group", { name: "Affichage des créneaux" })
    expect(group).not.toHaveClass("overflow-hidden")
  })
})
