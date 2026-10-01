/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import RegistrationsManager from "../admin/RegistrationsManager"

// The registrations page's table and shift filter, as assistive technologies see them (#555).
const bar = { id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 3, registrationCount: 1 }
const accueil = { id: "s2", roleName: "Accueil", label: "Accueil", date: "2026-07-04", startTime: "14:00", endTime: "16:00", capacity: 3, registrationCount: 1 }
const reg = (id: string, first: string, shift: typeof bar) => ({
  id, status: "active", source: "public_form", comment: null, phone: null, createdAt: "2026-06-01T00:00:00.000Z", waitingPosition: null,
  volunteer: { id: `v-${id}`, firstName: first, lastName: "Martin", email: `${id}@x.ch`, phone: null },
  shift, isLeader: false, checkedInAt: null,
})
const renderManager = () => render(
  <RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[bar, accueil]} initialRegistrations={[reg("r1", "Alice", bar), reg("r2", "Bob", accueil)]} />,
)

describe("RegistrationsManager — table and shift filter semantics", () => {
  afterEach(cleanup)

  it("captions the table, with column headers only", () => {
    renderManager()
    const table = screen.getByRole("table", { name: "Inscriptions" })
    expect(within(table).getAllByRole("columnheader").length).toBeGreaterThan(0)
    expect(within(table).queryAllByRole("rowheader")).toEqual([])
  })

  it("names the shift filter and filters with the keyboard", () => {
    renderManager()
    const filter = screen.getByRole("combobox", { name: "Filtrer par créneau" })
    expect(filter).toHaveTextContent("Tous les créneaux")
    fireEvent.keyDown(filter, { key: "a" })
    expect(screen.getByRole("listbox", { name: "Filtrer par créneau" })).toBeInTheDocument()
    fireEvent.keyDown(filter, { key: "Enter" })
    expect(screen.getByText("1 inscription affichée")).toBeInTheDocument()
    expect(screen.queryByText("Alice Martin")).toBeNull()
    expect(screen.getByText("Bob Martin")).toBeInTheDocument()
  })
})
