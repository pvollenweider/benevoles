/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { visibleTextInName } from "@/__tests__/helpers/label-in-name"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import AdminDayTimeline, { type AdminShift } from "../admin/AdminDayTimeline"
import { PX_PER_MIN } from "@/lib/day-timeline"

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

  // The overnight demo show (« Bal populaire » 21:00–01:00) was a 2 px sliver: its width was
  // toMin(end) - toMin(start), negative past midnight.
  it("draws an overnight show over its whole span, band and label", () => {
    render(
      <AdminDayTimeline eventId="evt-1" date="2026-07-04" shifts={[shift({ startTime: "20:00", endTime: "23:00" })]}
        shows={[{ name: "Bal populaire", date: "2026-07-04", startTime: "21:00", endTime: "01:00" }]}
        onCreated={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} />,
    )
    const label = screen.getByText(/Bal populaire/).closest("div") as HTMLElement
    expect(parseFloat(label.style.width)).toBe(4 * 60 * PX_PER_MIN)
    const band = Array.from(document.querySelectorAll<HTMLElement>(".bg-indigo-50.border-x"))
    expect(band).toHaveLength(1)
    expect(parseFloat(band[0].style.width)).toBeGreaterThan(60 * PX_PER_MIN)
    expect(parseFloat(band[0].style.width)).toBe(4 * 60 * PX_PER_MIN)
    // Read in words, saying it ends the next day; the « 21h–01h » stays visual only.
    expect(label).toHaveTextContent("de 21h à 1h, jusqu'au lendemain")
  })

  // axe-core 4.14 (label-content-name-mismatch): the name holds the bar's visible text in its
  // order (WCAG 2.5.3); the hours and places in words (#587) are its description.
  it("names each bar with the role, then its visible text, and describes it in words", () => {
    setup([shift(), shift({ id: "s2", label: "Bar", startTime: "14:00", endTime: "16:00", registrationCount: 2, capacity: 2 })])
    const region = screen.getByRole("region", { name: "Planning du Samedi 4 juillet" })
    expect(region).toBeInTheDocument()
    const soir = screen.getByRole("button", { name: "Bar, 10h30–12h15, Soir, 3/5 inscrits, 2 libres, modifier" })
    expect(soir).toHaveAccessibleDescription("de 10h30 à 12h15, 3 inscrits sur 5, 2 libres")
    const full = screen.getByRole("button", { name: "Bar, 14h–16h, 2/2 inscrits, Complet, modifier" })
    expect(full).toHaveAccessibleDescription("de 14h à 16h, 2 inscrits sur 2, complet")
    for (const b of [soir, full]) {
      // The words of the visible lines stay apart: a space between each line.
      expect(visibleTextInName(b.querySelector("[title]")?.textContent ?? "", b.getAttribute("aria-label") ?? "")).toBe(true)
    }
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
    expect(screen.getByRole("button", { name: /^Bar, 10h30–12h15, Soir/ })).toHaveClass("focus:z-20")
    expect(region.style.scrollPaddingLeft).not.toBe("")
  })

  // #925: the bar said « 3/5 · 2 libre » without saying what it counted.
  it("shows what the figures on a bar count, and the minimum age", () => {
    setup([shift({ minAge: 18 })])
    const bar = screen.getByRole("button", { name: "Bar, 10h30–12h15, Soir, 18 ans min., 3/5 inscrits, 2 libres, modifier" })
    expect(bar).toHaveAccessibleDescription("de 10h30 à 12h15, 3 inscrits sur 5, 2 libres, 18 ans minimum")
    expect(bar).toHaveTextContent("18 ans min. · 3/5 inscrits · 2 libres")
  })

  it("the deletion recap opened from a bar says the minutes and the shift in words (regression)", () => {
    setup([shift()])
    fireEvent.click(screen.getByRole("button", { name: /^Bar, 10h30–12h15, Soir/ }))
    fireEvent.click(screen.getByRole("button", { name: "Supprimer le créneau" }))
    const dialog = screen.getByRole("alertdialog", { name: "Supprimer le créneau « Bar, Soir » ?" })
    expect(dialog).toHaveTextContent("Samedi 4 juillet, de 10h30 à 12h15.")
    expect(dialog.textContent).not.toMatch(/[–·]/)
  })
})
