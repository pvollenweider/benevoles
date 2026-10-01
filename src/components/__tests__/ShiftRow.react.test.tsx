/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { useRef, useState } from "react"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

import ShiftRow, { type ShiftRowShift } from "../public/ShiftRow"

const shift = (over: Partial<ShiftRowShift> = {}): ShiftRowShift => ({
  id: "s1",
  roleName: "Bar",
  label: "Bar",
  startTime: "18:00",
  endTime: "20:30",
  status: "open",
  waitlistEnabled: false,
  requiresApproval: false,
  minAge: null,
  ...over,
})

function renderRow(props: Partial<Parameters<typeof ShiftRow>[0]> = {}) {
  const onCancel = vi.fn()
  const onRemove = vi.fn()
  const view = render(
    <ShiftRow shift={shift()} registered={false} selected onCancel={onCancel} onRemove={onRemove} {...props} />,
  )
  return { ...view, onCancel, onRemove, row: view.container.firstElementChild as HTMLElement }
}

describe("ShiftRow", () => {
  afterEach(cleanup)

  it("renders a selected shift in the normal variant", () => {
    const { row } = renderRow()
    expect(row).toHaveClass("py-2.5", "bg-blue-50/60")
    expect(row).not.toHaveClass("py-2")
    expect(screen.getByText("Bar")).toBeInTheDocument()
    expect(screen.getByText("18h–20h30")).toBeInTheDocument()
    expect(row.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    const button = screen.getByRole("button", { name: "Retirer Bar de la sélection" })
    expect(button).not.toBeDisabled()
    expect(button.querySelector("span")).toHaveAttribute("aria-hidden", "true")
  })

  it("renders the compact variant with tighter padding", () => {
    const { row } = renderRow({ compact: true })
    expect(row).toHaveClass("py-2")
    expect(row).not.toHaveClass("py-2.5")
  })

  it("names the row by its label when it differs from the role", () => {
    renderRow({ shift: shift({ label: "Bar du soir" }) })
    expect(screen.getByText("Bar du soir")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retirer Bar du soir de la sélection" })).toBeInTheDocument()
  })

  it("takes a selected shift out of the selection", () => {
    const { onRemove, onCancel } = renderRow()
    fireEvent.click(screen.getByRole("button", { name: "Retirer Bar de la sélection" }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("asks to cancel a held shift and hands over the button for the focus return", () => {
    const { onCancel, onRemove, row } = renderRow({ registered: true })
    expect(row).toHaveClass("bg-green-50")
    expect(screen.queryByRole("button", { name: /de la sélection/ })).toBeNull()
    const button = screen.getByRole("button", { name: "Annuler l'inscription à Bar" })
    fireEvent.click(button)
    expect(onCancel).toHaveBeenCalledWith(button)
    expect(onRemove).not.toHaveBeenCalled()
  })

  it("says a full shift goes to the waiting list", () => {
    renderRow({ shift: shift({ status: "full", waitlistEnabled: true, requiresApproval: true }) })
    expect(screen.getByText("Complet · liste d'attente si place libérée")).toBeInTheDocument()
    // The waiting list note replaces the approval one.
    expect(screen.queryByText(/Sur validation/)).toBeNull()
  })

  it("says nothing about the waiting list on a full shift already held", () => {
    renderRow({ registered: true, shift: shift({ status: "full", waitlistEnabled: true }) })
    expect(screen.queryByText(/liste d'attente/)).toBeNull()
  })

  it("shows the minimum age and the approval note", () => {
    renderRow({ shift: shift({ minAge: 16, requiresApproval: true }) })
    expect(screen.getByText("16 ans minimum")).toBeInTheDocument()
    expect(screen.getByText("Sur validation · demande à accepter par l'organisation")).toBeInTheDocument()
  })

  it("has no background when neither held nor selected", () => {
    const { row } = renderRow({ selected: false })
    expect(row).not.toHaveClass("bg-blue-50/60")
    expect(row).not.toHaveClass("bg-green-50")
  })
})

// Regression: ShiftRow was declared inside EventPageClient, so each parent render made a new
// component type and remounted every row. Opening the unregister confirmation re-renders the
// parent: the button kept for focus return was detached, and closing the dialog lost focus.
describe("ShiftRow focus return", () => {
  function Harness() {
    const trigger = useRef<HTMLButtonElement | null>(null)
    const [open, setOpen] = useState(false)
    return (
      <>
        <ShiftRow shift={shift()} registered selected={false} onCancel={(b) => { trigger.current = b; setOpen(true) }} onRemove={() => {}} />
        {open && <button onClick={() => { setOpen(false); trigger.current?.focus() }}>Annuler</button>}
      </>
    )
  }

  it("keeps the same button across the parent re-render, so focus can come back to it", () => {
    render(<Harness />)
    const cancel = screen.getByRole("button", { name: /Annuler l'inscription à Bar/ })
    fireEvent.click(cancel)
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(cancel.isConnected).toBe(true)
    expect(document.activeElement).toBe(cancel)
  })
})
