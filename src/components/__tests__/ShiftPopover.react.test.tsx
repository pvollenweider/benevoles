/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import ShiftPopover from "../admin/day-timeline/ShiftPopover"
import type { AdminShift } from "../admin/AdminDayTimeline"

// Quick edits from the schedule (#398).
const shift: AdminShift = {
  id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
  capacity: 3, status: "open", registrationCount: 2, displayOrder: 0,
}

describe("ShiftPopover", () => {
  afterEach(cleanup)

  const setup = (over: Partial<AdminShift> = {}) => {
    const props = {
      shift: { ...shift, ...over }, anchor: { x: 100, y: 100, w: 80 }, eventId: "evt-1",
      onClose: vi.fn(), onPatch: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn(),
      onDuplicate: vi.fn().mockResolvedValue(undefined), onApplyCapacity: vi.fn().mockResolvedValue(undefined),
    }
    render(<ShiftPopover {...props} />)
    return props
  }

  it("is a labelled dialog whose fields have names, focused on its heading", () => {
    setup()
    expect(screen.getByRole("dialog", { name: /Bar/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /Bar/ })).toHaveFocus()
    for (const name of ["Libellé", "Places", "Début", "Fin", "Inscriptions"]) expect(screen.getByLabelText(name)).toBeInTheDocument()
  })

  it("« Décaler » saves new times, refuses equal ones, and warns that registered people are told", async () => {
    const p = setup()
    const decaler = screen.getByRole("button", { name: "Décaler" })
    expect(decaler).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("Modifiez le début ou la fin, puis Décaler.")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Fin"), { target: { value: "10:00" } })
    expect(screen.getByText("L'heure de fin doit être différente de l'heure de début.")).toBeInTheDocument()
    fireEvent.click(decaler)
    expect(p.onPatch).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("Fin"), { target: { value: "13" } })
    fireEvent.blur(screen.getByLabelText("Fin"))
    expect(screen.getByLabelText("Fin")).toHaveValue("13:00")
    fireEvent.click(decaler)
    await waitFor(() => expect(p.onPatch).toHaveBeenCalledWith("s1", { startTime: "10:00", endTime: "13:00" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Horaires enregistrés, les inscrits sont prévenus."))
  })

  it("duplicates and applies the capacity to the role", async () => {
    const p = setup()
    fireEvent.click(screen.getByRole("button", { name: "Dupliquer" }))
    await waitFor(() => expect(p.onDuplicate).toHaveBeenCalledWith("s1"))

    fireEvent.change(screen.getByLabelText("Places"), { target: { value: "5" } })
    fireEvent.click(screen.getByRole("button", { name: "Appliquer à tout le poste" }))
    await waitFor(() => expect(p.onApplyCapacity).toHaveBeenCalledWith("Bar", 5))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Capacité de 5 appliquée au poste « Bar »."))
  })

  it("refuses a capacity under the confirmed people: flagged, not applied, not saved on close", () => {
    const p = setup()
    fireEvent.change(screen.getByLabelText("Places"), { target: { value: "1" } })
    expect(screen.getByLabelText("Places")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText(/Au moins 2 : 2 personnes sont déjà inscrites/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Appliquer à tout le poste" }))
    expect(p.onApplyCapacity).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Fermer et enregistrer" }))
    expect(p.onPatch).toHaveBeenLastCalledWith("s1", { label: "Bar" })
  })

  it("gives focus back to the bar that opened it", () => {
    const opener = document.createElement("button")
    document.body.appendChild(opener)
    opener.focus()
    const p = setup()
    expect(screen.getByRole("heading", { name: /Bar/ })).toHaveFocus()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(p.onClose).toHaveBeenCalled()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it("closing saves label and capacity; closing or reopening registrations patches the status", () => {
    const p = setup()
    fireEvent.change(screen.getByLabelText("Inscriptions"), { target: { value: "closed" } })
    expect(p.onPatch).toHaveBeenCalledWith("s1", { status: "closed" })

    fireEvent.change(screen.getByLabelText("Libellé"), { target: { value: "Bar soir" } })
    fireEvent.click(screen.getByRole("button", { name: "Fermer et enregistrer" }))
    expect(p.onPatch).toHaveBeenLastCalledWith("s1", { label: "Bar soir", capacity: 3 })
    expect(p.onClose).toHaveBeenCalled()
  })
})
