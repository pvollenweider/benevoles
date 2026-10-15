/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import ShiftEditor from "../admin/shifts/ShiftEditor"
import ShiftPopover from "../admin/day-timeline/ShiftPopover"
import ShiftSeriesForm from "../admin/ShiftSeriesForm"
import { StaffingStateLabel } from "../admin/StaffingShiftLine"
import type { AdminShift } from "../admin/AdminDayTimeline"

// Minimum per shift (#949) in the forms: an optional field, labelled, with its hint, refused with
// a message tied to the field when it is 0 or above the places.

const fetchMock = vi.fn()

describe("Minimum per shift in the forms", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const editor = (initial: Record<string, unknown> = {}) => {
    const onSaved = vi.fn()
    render(
      <ShiftEditor
        eventId="evt-1" dates={["2026-07-04"]} editingId={null}
        initial={{ roleName: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 4, ...initial }}
        existingShifts={[]} onSaved={onSaved} onCancel={vi.fn()}
      />,
    )
    return { onSaved }
  }

  it("shift editor: optional, described by its hint, sent with the shift", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 4, minVolunteers: 2 }), { status: 201 }))
    editor()
    const field = screen.getByLabelText("Minimum (optionnel)")
    expect(field).toHaveAccessibleDescription(/Sous ce nombre de personnes, le créneau ne peut pas tourner/)
    fireEvent.change(field, { target: { value: "2" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ capacity: 4, minVolunteers: 2 })
  })

  it("shift editor: an empty minimum is sent as none", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 4 }), { status: 201 }))
    editor()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).minVolunteers).toBeNull()
  })

  it("shift editor: a minimum above the places is refused, the field says why and gets focus", async () => {
    editor({ minVolunteers: 5 })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    const field = screen.getByLabelText("Minimum (optionnel)")
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field).toHaveAccessibleDescription(/Le minimum \(5\) dépasse les places \(4\)/)
    await waitFor(() => expect(field).toHaveFocus())
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: "0" } })
    expect(field).toHaveAccessibleDescription(/au moins 1 personne/)
    fireEvent.change(field, { target: { value: "3" } })
    expect(field).not.toHaveAttribute("aria-invalid")
  })

  it("series: the minimum goes with every shift, and a wrong one is refused", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 201 }))
    render(<ShiftSeriesForm eventId="evt-1" dates={["2026-07-04"]} existingShifts={[]} onCreated={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Bar" } })
    fireEvent.change(screen.getByLabelText("Début *"), { target: { value: "10:00" } })
    fireEvent.change(screen.getByLabelText("Fin *"), { target: { value: "14:00" } })
    const field = screen.getByLabelText("Minimum par créneau (optionnel)")
    fireEvent.change(field, { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: /^Créer/ }))
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: /^Créer/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ capacity: 2, minVolunteers: 1 })
  })
})

describe("Minimum per shift in the timeline popover", () => {
  afterEach(cleanup)
  const shift: AdminShift = {
    id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
    capacity: 4, status: "open", registrationCount: 1, displayOrder: 0,
  }
  const setup = (over: Partial<AdminShift> = {}) => {
    const props = {
      shift: { ...shift, ...over }, anchor: { x: 100, y: 100, w: 80 }, eventId: "evt-1",
      onClose: vi.fn(), onPatch: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn(),
      onDuplicate: vi.fn().mockResolvedValue(undefined), onApplyCapacity: vi.fn().mockResolvedValue(true), onNotSaved: vi.fn(),
    }
    render(<ShiftPopover {...props} />)
    return props
  }

  it("saves the minimum with the places on close", () => {
    const p = setup()
    fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "2" } })
    fireEvent.click(screen.getByRole("button", { name: "Fermer et enregistrer" }))
    expect(p.onPatch).toHaveBeenCalledWith("s1", { label: "Bar", capacity: 4, minVolunteers: 2 })
  })

  it("saves neither places nor minimum when the minimum is above the places", () => {
    const p = setup({ minVolunteers: 2 })
    fireEvent.change(screen.getByLabelText("Places"), { target: { value: "3" } })
    fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "5" } })
    expect(screen.getByLabelText("Minimum")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Minimum")).toHaveAccessibleDescription(/Le minimum \(5\) dépasse les places \(3\).*Non enregistré/)
    const apply = screen.getByRole("button", { name: "Appliquer à tout le poste" })
    // The unavailable button says why (3.3.1).
    expect(apply).toHaveAccessibleDescription(/Le minimum \(5\) dépasse les places \(3\)/)
    expect(screen.getByLabelText("Places")).toHaveAccessibleDescription(/Le minimum \(5\) dépasse les places \(3\)/)
    fireEvent.click(apply)
    expect(p.onApplyCapacity).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Fermer et enregistrer" }))
    expect(p.onPatch).toHaveBeenCalledWith("s1", { label: "Bar" })
    // Closing announces what was not saved, through the parent (the field's message is gone).
    expect(p.onNotSaved).toHaveBeenCalledWith("Places et minimum non enregistrés : Le minimum (5) dépasse les places (3) : baissez le minimum ou augmentez les places.")
  })

  it("applies places and minimum to the whole role, and removes a minimum emptied", async () => {
    const p = setup({ minVolunteers: 2 })
    fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: "Appliquer à tout le poste" }))
    await waitFor(() => expect(p.onApplyCapacity).toHaveBeenCalledWith("Bar", 4, 3))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("4 places et un minimum de 3 appliqués au poste « Bar »."))
    fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Appliquer à tout le poste" }))
    await waitFor(() => expect(p.onApplyCapacity).toHaveBeenLastCalledWith("Bar", 4, null))
  })
})

describe("StaffingStateLabel", () => {
  afterEach(cleanup)

  it("is words, never colour alone: a badge with ⚠ below the minimum, read « de 2 »", () => {
    const { container } = render(<p><StaffingStateLabel s={{ capacity: 4, minVolunteers: 2 }} state="below_minimum" /></p>)
    expect(container.textContent).toContain("sous le minimum (2)")
    expect(container.textContent).toContain("sous le minimum de 2")
    cleanup()
    const reached = render(<p><StaffingStateLabel s={{ capacity: 4, minVolunteers: 2 }} state="minimum_reached" /></p>)
    expect(reached.container.textContent).toContain("minimum atteint")
  })

  it("renders nothing without a minimum", () => {
    const { container } = render(<p><StaffingStateLabel s={{ capacity: 4 }} state="open" /></p>)
    expect(container.textContent).toBe("")
  })
})
