/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"
import { useState } from "react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import AdminDayTimeline, { type AdminShift } from "../admin/AdminDayTimeline"

// The admin timeline grouped by sector (#1147): named groups, collapse buttons with aria-expanded,
// « Sans secteur » last, a collapsed sector's bars out of the tab order; without sectors, no group.
const shift = (over: Partial<AdminShift>): AdminShift => ({
  id: "s", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
  capacity: 2, status: "open", registrationCount: 0, displayOrder: 0, ...over,
})
const shifts = [
  shift({ id: "a", roleName: "Bar", displayOrder: 0 }),
  shift({ id: "b", roleName: "Parking Nord", displayOrder: 100 }),
  shift({ id: "c", roleName: "Parking Mairie", displayOrder: 200 }),
]
const sectors = [{ id: "p", name: "Parking", displayOrder: 0 }]
const sectorOf = { "Bar": null, "Parking Nord": "p", "Parking Mairie": "p" }

function Grouped() {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const onToggle = (key: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  return (
    <AdminDayTimeline eventId="evt" date="2026-07-04" shifts={shifts} roleOrder={["Bar", "Parking Nord", "Parking Mairie"]}
      sectorGrouping={{ sectors, sectorOf, collapsed, onToggle }} onCreated={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} />
  )
}

describe("AdminDayTimeline by sector (#1147)", () => {
  afterEach(cleanup)

  it("groups the postes by sector, each group named, « Sans secteur » last", () => {
    render(<Grouped />)
    const groups = screen.getAllByRole("group")
    expect(groups.map((g) => g.getAttribute("aria-labelledby") && document.getElementById(g.getAttribute("aria-labelledby")!)?.textContent)).toEqual(["Parking", "Sans secteur"])
    expect(within(groups[0]).getAllByRole("button", { name: /^Parking (Nord|Mairie),/ })).toHaveLength(2)
    expect(within(groups[1]).getByRole("button", { name: /^Bar,/ })).toBeInTheDocument()
    // Tab order: the sector's button comes before its bars.
    const toggle = within(groups[0]).getByRole("button", { name: "Parking · 2 postes" })
    expect(toggle.compareDocumentPosition(within(groups[0]).getAllByRole("button", { name: /^Parking Nord,/ })[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("collapses and expands a sector, its bars leaving the page while collapsed", () => {
    render(<Grouped />)
    const toggle = screen.getByRole("button", { name: "Parking · 2 postes" })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(toggle).toHaveAttribute("aria-controls")
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).not.toHaveAttribute("aria-controls")
    expect(screen.queryByRole("button", { name: /^Parking Nord,/ })).toBeNull()
    expect(screen.getByRole("button", { name: /^Bar,/ })).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getAllByRole("button", { name: /^Parking (Nord|Mairie),/ })).toHaveLength(2)
  })

  it("A01: without sectors, no group and no collapse button", () => {
    render(<AdminDayTimeline eventId="evt" date="2026-07-04" shifts={shifts} onCreated={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} />)
    expect(screen.queryAllByRole("group")).toHaveLength(0)
    expect(document.querySelector("[aria-expanded][data-sector-toggle]")).toBeNull()
    expect(document.querySelector('[data-role-labels="1"]')).not.toBeNull()
  })
})
