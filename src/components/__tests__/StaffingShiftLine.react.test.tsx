/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

import Link from "next/link"
import { ShiftLine } from "../admin/StaffingShiftLine"
import type { StaffingShiftLine } from "@/lib/staffing"

// #926: in « Où manque-t-il du monde ? », a shift's link and its « Chercher des bénévoles » link
// ran together (« 09:00–12:00Chercher des bénévoles »), on screen and in the links' names.

const line = (over: Partial<StaffingShiftLine> = {}): StaffingShiftLine => ({
  id: "s1", roleName: "Accueil", label: "Accueil", date: "2026-10-17", startTime: "09:00", endTime: "12:00",
  capacity: 6, closed: false, active: 2, waiting: 0, requested: 0, missing: 4, ...over,
})

describe("ShiftLine (coverage report)", () => {
  afterEach(cleanup)

  const setup = (action?: React.ReactNode, over?: Partial<StaffingShiftLine>) => render(
    <ul><ShiftLine eventId="evt-1" group="underfilled" s={line(over)} detail="2/6 · manque 4" action={action} /></ul>,
  )

  it("puts the action link on its own line, apart from the shift link (regression)", () => {
    setup(<Link href="/search">Chercher des bénévoles</Link>)
    const shiftLink = screen.getByRole("link", { name: /^Accueil sam\. 17 oct\./ })
    const action = screen.getByRole("link", { name: "Chercher des bénévoles" })
    expect(shiftLink).not.toContainElement(action)
    expect(action.parentElement).not.toBe(shiftLink.parentElement)
    expect(action.parentElement?.tagName).toBe("DIV")
  })

  it("separates the role from the date in the shift link's name", () => {
    setup(undefined, { label: "Soir" })
    const shiftLink = screen.getByRole("link", { name: /^Accueil · Soir sam\. 17 oct\./ })
    expect(shiftLink).toHaveAttribute("href", "/admin/events/evt-1/registrations?shift=s1")
    expect(shiftLink).toHaveAccessibleDescription("2/6 · manque 4")
  })

  it("adds no empty wrapper without an action", () => {
    setup()
    expect(screen.getAllByRole("link")).toHaveLength(1)
  })
})
