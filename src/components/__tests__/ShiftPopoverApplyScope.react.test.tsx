/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("next/link", () => ({ default: ({ children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...rest}>{children}</a> }))

import ShiftPopover from "../admin/day-timeline/ShiftPopover"
import type { AdminShift } from "../admin/AdminDayTimeline"

// « Appliquer au poste », for this day or the whole event (#1017).
const shift: AdminShift = {
  id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
  capacity: 3, status: "open", registrationCount: 1, displayOrder: 0,
}

describe("ShiftPopover: apply to the poste, this day or the whole event", () => {
  afterEach(cleanup)

  const setup = (over: { shift?: Partial<AdminShift>; eventCount?: { shifts: number; days: number } | null; result?: unknown } = {}) => {
    const props = {
      shift: { ...shift, ...over.shift }, anchor: { x: 100, y: 100, w: 80 }, eventId: "evt-1",
      eventCount: over.eventCount === undefined ? { shifts: 12, days: 3 } : over.eventCount,
      onClose: vi.fn(), onPatch: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn(), onDuplicate: vi.fn(),
      onApplyToPoste: vi.fn().mockResolvedValue(over.result ?? { shifts: 12, days: 3, keptHigher: 2 }),
    }
    render(<ShiftPopover {...props} />)
    return props
  }

  it("offers « Ce jour » and « Tout l'événement » in a group named by the poste, described by what they apply", () => {
    setup()
    const group = screen.getByRole("group", { name: "Appliquer au poste « Bar » :" })
    const day = within(group).getByRole("button", { name: "Ce jour" })
    const event = within(group).getByRole("button", { name: "Tout l'événement" })
    for (const b of [day, event]) expect(b).toHaveAccessibleDescription("Applique 3 places. Chaque créneau garde son minimum et son libellé. Jamais moins de places que d'inscrits sur un créneau.")
  })

  it("shows one « Appliquer à tout le poste » button, and no group, when the poste is on this day only", async () => {
    const p = setup({ eventCount: null, result: { shifts: 2, days: 1, keptHigher: 0 } })
    expect(screen.queryByRole("group", { name: /Appliquer au poste/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Appliquer à tout le poste" }))
    await waitFor(() => expect(p.onApplyToPoste).toHaveBeenCalledWith("s1", "Bar", "day", { capacity: 3 }))
  })

  it("copies a label typed here, never an empty or unchanged one", async () => {
    const p = setup({ shift: { label: "Bar soir" } })
    expect(screen.getByRole("button", { name: "Ce jour" })).toHaveAccessibleDescription(/Chaque créneau garde son minimum et son libellé/)
    fireEvent.click(screen.getByRole("button", { name: "Ce jour" }))
    await waitFor(() => expect(p.onApplyToPoste).toHaveBeenLastCalledWith("s1", "Bar", "day", { capacity: 3 }))

    fireEvent.change(screen.getByLabelText("Libellé"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Ce jour" }))
    await waitFor(() => expect(p.onApplyToPoste).toHaveBeenCalledTimes(2))
    expect(p.onApplyToPoste).toHaveBeenLastCalledWith("s1", "Bar", "day", { capacity: 3 })

    fireEvent.change(screen.getByLabelText("Libellé"), { target: { value: "Bar nuit" } })
    fireEvent.change(screen.getByLabelText("Places"), { target: { value: "5" } })
    expect(screen.getByRole("button", { name: "Ce jour" })).toHaveAccessibleDescription(/Applique 5 places et le libellé « Bar nuit »\. Chaque créneau garde son minimum\./)
    fireEvent.click(screen.getByRole("button", { name: "Ce jour" }))
    await waitFor(() => expect(p.onApplyToPoste).toHaveBeenLastCalledWith("s1", "Bar", "day", { capacity: 5, label: "Bar nuit" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Appliqué à 12 créneaux du poste « Bar » ce jour. 2 créneaux gardent plus de places : déjà plus d'inscrits."))
  })

  it("asks before the whole event, with the counts, focus on « Confirmer » described by what it applies", () => {
    const p = setup()
    fireEvent.click(screen.getByRole("button", { name: "Tout l'événement" }))
    expect(p.onApplyToPoste).not.toHaveBeenCalled()
    const question = screen.getByRole("group", { name: "Appliquer à 12 créneaux sur 3 jours ?" })
    const confirm = within(question).getByRole("button", { name: "Confirmer" })
    expect(confirm).toHaveFocus()
    expect(confirm).toHaveAccessibleDescription(/^Applique 3 places\./)
  })

  it("« Annuler » and Escape leave the question, not the popover, focus back on « Tout l'événement »", () => {
    const p = setup()
    fireEvent.click(screen.getByRole("button", { name: "Tout l'événement" }))
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.getByRole("button", { name: "Tout l'événement" })).toHaveFocus()

    fireEvent.click(screen.getByRole("button", { name: "Tout l'événement" }))
    fireEvent.keyDown(screen.getByRole("button", { name: "Confirmer" }), { key: "Escape" })
    expect(p.onClose).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Tout l'événement" })).toHaveFocus()
    expect(p.onApplyToPoste).not.toHaveBeenCalled()
  })

  it("« Confirmer » applies to the whole event, announces the counts and gives focus back to « Tout l'événement »", async () => {
    const p = setup({ shift: { minVolunteers: 2 } })
    fireEvent.change(screen.getByLabelText("Libellé"), { target: { value: "Relève" } })
    fireEvent.click(screen.getByRole("button", { name: "Tout l'événement" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))
    await waitFor(() => expect(p.onApplyToPoste).toHaveBeenCalledWith("s1", "Bar", "event", { capacity: 3, minVolunteers: 2, label: "Relève" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Tout l'événement" })).toHaveFocus())
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Appliqué à 12 créneaux du poste « Bar » sur 3 jours. 2 créneaux gardent plus de places : déjà plus d'inscrits."))
  })

  it("keeps the question and focus on « Confirmer » when nothing was applied", async () => {
    const p = setup({ result: false })
    p.onApplyToPoste.mockResolvedValue(false)
    fireEvent.click(screen.getByRole("button", { name: "Tout l'événement" }))
    const confirm = screen.getByRole("button", { name: "Confirmer" })
    fireEvent.click(confirm)
    await waitFor(() => expect(p.onApplyToPoste).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmer" })).toHaveAttribute("aria-disabled", "false"))
    expect(screen.getByRole("button", { name: "Confirmer" })).toHaveFocus()
  })

  it("a held Enter does not confirm at once", () => {
    setup()
    fireEvent.click(screen.getByRole("button", { name: "Tout l'événement" }))
    const confirm = screen.getByRole("button", { name: "Confirmer" })
    const repeat = new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true, cancelable: true })
    confirm.dispatchEvent(repeat)
    expect(repeat.defaultPrevented).toBe(true)
  })

  it("refuses invalid values: both buttons unavailable and described by the error", () => {
    const p = setup()
    fireEvent.change(screen.getByLabelText("Places"), { target: { value: "0" } })
    const day = screen.getByRole("button", { name: "Ce jour" })
    expect(day).toHaveAttribute("aria-disabled", "true")
    expect(day).toHaveAccessibleDescription(/Au moins 1 : 1 personne est déjà inscrite/)
    fireEvent.click(day)
    fireEvent.click(screen.getByRole("button", { name: "Tout l'événement" }))
    expect(screen.queryByRole("button", { name: "Confirmer" })).not.toBeInTheDocument()
    expect(p.onApplyToPoste).not.toHaveBeenCalled()
  })
})
