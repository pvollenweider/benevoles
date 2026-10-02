/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react"

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

// Shift editor (#554): focus moves into it on open, comes back to its opener on close, and the
// result of a save is announced once, by the outcome status.

const fetchMock = vi.fn()
const spoken = (role: "status" | "alert") => screen.queryAllByRole(role).filter((e) => e.textContent?.trim())

describe("ShiftsManager shift editor focus and announcements", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    // jsdom does not lay out: no scrolling.
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const addButton = () => screen.getByRole("button", { name: "+ Ajouter un créneau" })

  it("« + Ajouter un créneau » opens the editor on « Poste * »; « Annuler » returns to the button", async () => {
    renderManager()
    addButton().focus()
    fireEvent.click(addButton())
    expect(screen.getByRole("group", { name: "Nouveau créneau" })).toBeInTheDocument()
    expect(screen.getByLabelText("Poste *")).toHaveFocus()

    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("group", { name: "Nouveau créneau" })).toBeNull()
    await waitFor(() => expect(addButton()).toHaveFocus())
  })

  it("after adding a shift, focus is on the add button and the status says what was added, once", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...shift, id: "s2", startTime: "10:00", endTime: "11:00", date: "2026-07-04T00:00:00.000Z" }) })
    renderManager()
    fireEvent.click(addButton())
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Bar" } })
    fireEvent.change(screen.getByLabelText("Début *"), { target: { value: "10:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))

    await waitFor(() => expect(addButton()).toHaveFocus())
    await waitFor(() => expect(spoken("status")).toHaveLength(1))
    expect(spoken("status")[0]).toHaveTextContent("Créneau ajouté : Bar, samedi 4 juillet, de 10h à 11h.")
    expect(spoken("alert")).toHaveLength(0)
  })

  it("after editing from the list, focus is back on that row's « Modifier » and the edit is announced", async () => {
    const other: RawShift = { ...shift, id: "s3", roleName: "Accueil", label: "Accueil", startTime: "14:00", endTime: "16:00" }
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...shift, endTime: "13:00", date: "2026-07-04T00:00:00.000Z" }) })
    render(<ShiftsManager eventId="evt-1" eventStartDate="2026-07-04" eventEndDate="2026-07-04" initialShifts={[shift, other]} />)
    fireEvent.click(screen.getByRole("button", { name: "Liste" }))
    const barRow = screen.getByRole("row", { name: /Bar/ })
    const edit = within(barRow).getByRole("button", { name: "Modifier" })
    edit.focus()
    fireEvent.click(edit)
    expect(screen.getByRole("group", { name: "Modifier le créneau" })).toBeInTheDocument()
    expect(screen.getByLabelText("Poste *")).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))

    await waitFor(() => expect(within(screen.getByRole("row", { name: /Bar/ })).getByRole("button", { name: "Modifier" })).toHaveFocus())
    await waitFor(() => expect(spoken("status")).toHaveLength(1))
    expect(spoken("status")[0]).toHaveTextContent("Créneau modifié : Bar, samedi 4 juillet, de 10h à 13h.")
  })

  it("when the opener is gone (list switched to timeline), focus falls back to the add button", async () => {
    renderManager()
    fireEvent.click(screen.getByRole("button", { name: "Liste" }))
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }))
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }))
    expect(screen.queryByRole("table")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))

    await waitFor(() => expect(addButton()).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
  })
})
