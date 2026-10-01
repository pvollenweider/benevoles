/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import BulkActionsBar from "../admin/registrations/BulkActionsBar"

// The toolbar of the actions on the selected registrations, on its own.
const base = {
  selectedCount: 2, toCheckInCount: 2, toUndoCount: 0, activeCount: 2, noneWithEmail: false, noActiveWithEmail: false, busy: false,
  onPresence: () => {}, onMakeResponsible: () => {}, onResendLink: () => {}, onCancelRegistrations: () => {}, onClearSelection: () => {},
}

describe("BulkActionsBar", () => {
  afterEach(cleanup)

  it("counts the selection and runs each action", () => {
    const onPresence = vi.fn(), onMakeResponsible = vi.fn(), onResendLink = vi.fn(), onCancelRegistrations = vi.fn(), onClearSelection = vi.fn()
    render(<BulkActionsBar {...base} toUndoCount={1} onPresence={onPresence} onMakeResponsible={onMakeResponsible} onResendLink={onResendLink} onCancelRegistrations={onCancelRegistrations} onClearSelection={onClearSelection} />)
    expect(screen.getByText("2 sélectionnées")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Marquer présents (2)" }))
    expect(onPresence).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole("button", { name: "Annuler la présence (1)" }))
    expect(onPresence).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole("button", { name: "Rendre responsable" }))
    fireEvent.click(screen.getByRole("button", { name: "Renvoyer le lien" }))
    fireEvent.click(screen.getByRole("button", { name: "Retirer de leur créneau (2)" }))
    fireEvent.click(screen.getByRole("button", { name: "Désélectionner" }))
    expect(onMakeResponsible).toHaveBeenCalledTimes(1)
    expect(onResendLink).toHaveBeenCalledTimes(1)
    expect(onCancelRegistrations).toHaveBeenCalledTimes(1)
    expect(onClearSelection).toHaveBeenCalledTimes(1)
  })

  it("keeps « Marquer présent » focusable but inert when nobody is left to mark", () => {
    const onPresence = vi.fn()
    render(<BulkActionsBar {...base} selectedCount={1} toCheckInCount={0} onPresence={onPresence} />)
    const mark = screen.getByRole("button", { name: "Marquer présent (0)" })
    expect(mark).toHaveAttribute("aria-disabled", "true")
    expect(mark).toBeEnabled()
    fireEvent.click(mark)
    expect(onPresence).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: /Annuler la présence/ })).toBeNull()
  })

  it("is a group named for the selection", () => {
    render(<BulkActionsBar {...base} />)
    expect(screen.getByRole("group", { name: "Actions sur la sélection" })).toContainElement(screen.getByRole("button", { name: "Désélectionner" }))
  })

  // #555: a disabled button under the focus dropped it to the page; they stay focusable and inert.
  it("keeps the actions focusable but inert while a request runs", () => {
    const onPresence = vi.fn(), onMakeResponsible = vi.fn(), onResendLink = vi.fn(), onCancelRegistrations = vi.fn()
    const handlers = { onPresence, onMakeResponsible, onResendLink, onCancelRegistrations }
    const { rerender } = render(<BulkActionsBar {...base} {...handlers} toUndoCount={1} />)
    const undo = screen.getByRole("button", { name: "Annuler la présence (1)" })
    undo.focus()
    rerender(<BulkActionsBar {...base} {...handlers} toUndoCount={1} busy />)
    expect(undo).toHaveFocus()
    const inert = [undo, screen.getByRole("button", { name: "Rendre responsable" }), screen.getByRole("button", { name: "Renvoyer le lien" }), screen.getByRole("button", { name: /^Retirer de leur créneau/ })]
    expect(inert).toHaveLength(4)
    for (const b of inert) {
      expect(b).toBeEnabled()
      expect(b).toHaveAttribute("aria-disabled", "true")
      fireEvent.click(b)
    }
    expect(onPresence).not.toHaveBeenCalled()
    expect(onMakeResponsible).not.toHaveBeenCalled()
    expect(onResendLink).not.toHaveBeenCalled()
    expect(onCancelRegistrations).not.toHaveBeenCalled()
  })

  it("keeps the actions inert when nobody qualifies", () => {
    const onMakeResponsible = vi.fn(), onResendLink = vi.fn(), onCancelRegistrations = vi.fn()
    render(<BulkActionsBar {...base} activeCount={0} noneWithEmail noActiveWithEmail onMakeResponsible={onMakeResponsible} onResendLink={onResendLink} onCancelRegistrations={onCancelRegistrations} />)
    for (const name of ["Rendre responsable", "Renvoyer le lien", "Retirer de leur créneau (0)"]) {
      const b = screen.getByRole("button", { name })
      expect(b).toHaveAttribute("aria-disabled", "true")
      fireEvent.click(b)
    }
    expect(onMakeResponsible).not.toHaveBeenCalled()
    expect(onResendLink).not.toHaveBeenCalled()
    expect(onCancelRegistrations).not.toHaveBeenCalled()
  })
})
