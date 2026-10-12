/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

import AdminDayTimeline, { type AdminShift } from "../admin/AdminDayTimeline"

// The admin day timeline (#587): bars named in words, and the deletion recap from a bar keeps the
// minutes (it passed « 10h30 », which the recap read as 10:00) and says « Bar, Soir ».

const shift = (over: Partial<AdminShift> = {}): AdminShift => ({
  id: "s1", roleName: "Bar", label: "Soir", date: "2026-07-04", startTime: "10:30", endTime: "12:15",
  capacity: 5, status: "open", registrationCount: 3, displayOrder: 0, ...over,
})

describe("AdminDayTimeline", () => {
  afterEach(cleanup)

  const setup = (shifts: AdminShift[]) => render(
    <AdminDayTimeline eventId="evt-1" date="2026-07-04" shifts={shifts} onCreated={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} />,
  )

  it("names each bar with the role first, then the time and places in words", () => {
    setup([shift(), shift({ id: "s2", label: "Bar", startTime: "14:00", endTime: "16:00", registrationCount: 2, capacity: 2 })])
    const region = screen.getByRole("region", { name: "Planning du Samedi 4 juillet" })
    expect(region).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bar, Soir, de 10h30 à 12h15, 3 inscrits sur 5, 2 libres, modifier" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bar, de 14h à 16h, 2 inscrits sur 2, complet, modifier" })).toBeInTheDocument()
    for (const b of screen.getAllByRole("button", { name: /^Bar/ })) expect(b.getAttribute("aria-label")).not.toMatch(/[–·]/)
  })

  // #924: the role names scrolled away with the hours; the column is now sticky inside the region.
  it("keeps the role-name column sticky inside the scroll region, under a focused bar", () => {
    setup([shift(), shift({ id: "s2", roleName: "Accueil", label: "Accueil" })])
    const region = screen.getByRole("region", { name: "Planning du Samedi 4 juillet" })
    const column = region.querySelector("[data-role-labels]") as HTMLElement
    expect(column).toHaveClass("sticky", "left-0", "bg-white")
    expect(column).toHaveTextContent("Bar")
    expect(column).toHaveTextContent("Accueil")
    // The layer holding it stacks above the rows; a focused bar above both.
    expect(column.parentElement).toHaveClass("absolute", "z-10", "pointer-events-none")
    expect(screen.getByRole("button", { name: /^Bar, Soir/ })).toHaveClass("focus:z-20")
    expect(region.style.scrollPaddingLeft).not.toBe("")
  })

  // #925: the bar said « 3/5 · 2 libre » without saying what it counted.
  it("shows what the figures on a bar count, and the minimum age", () => {
    setup([shift({ minAge: 18 })])
    const bar = screen.getByRole("button", { name: "Bar, Soir, de 10h30 à 12h15, 3 inscrits sur 5, 2 libres, 18 ans minimum, modifier" })
    expect(bar).toHaveTextContent("18 ans min. · 3/5 inscrits · 2 libres")
  })

  it("the deletion recap opened from a bar says the minutes and the shift in words (regression)", () => {
    setup([shift()])
    fireEvent.click(screen.getByRole("button", { name: /^Bar, Soir, de 10h30/ }))
    fireEvent.click(screen.getByRole("button", { name: "Supprimer le créneau" }))
    const dialog = screen.getByRole("alertdialog", { name: "Supprimer le créneau « Bar, Soir » ?" })
    expect(dialog).toHaveTextContent("Samedi 4 juillet, de 10h30 à 12h15.")
    expect(dialog.textContent).not.toMatch(/[–·]/)
  })
})
