/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { createRef } from "react"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import UndoRemovalBar from "../admin/registrations/UndoRemovalBar"

// The undo window of a bulk removal (#379), on its own.
describe("UndoRemovalBar", () => {
  afterEach(cleanup)

  it("says what will happen and when, and undoes or removes at once", () => {
    const onUndo = vi.fn(), onRemoveNow = vi.fn()
    const ref = createRef<HTMLButtonElement>()
    render(<UndoRemovalBar count={2} secondsLeft={7} undoButtonRef={ref} onUndo={onUndo} onRemoveNow={onRemoveNow} onHold={() => {}} onRelease={() => {}} />)
    expect(screen.getByRole("timer")).toHaveTextContent("dans 7 s")
    const undo = screen.getByRole("button", { name: "Annuler le retrait" })
    expect(ref.current).toBe(undo)
    expect(undo).toHaveAccessibleDescription(/2 bénévoles seront retirés de leur créneau dans 7 s/)
    fireEvent.click(undo)
    expect(onUndo).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Retirer maintenant" }))
    expect(onRemoveNow).toHaveBeenCalledTimes(1)
  })

  it("holds the countdown while the focus or the pointer is on the bar", () => {
    const onHold = vi.fn(), onRelease = vi.fn()
    render(<><UndoRemovalBar count={1} secondsLeft={3} undoButtonRef={createRef()} onUndo={() => {}} onRemoveNow={() => {}} onHold={onHold} onRelease={onRelease} /><button>ailleurs</button></>)
    expect(screen.getByText(/1 bénévole sera retiré de son créneau/)).toBeInTheDocument()
    const undo = screen.getByRole("button", { name: "Annuler le retrait" })
    const now = screen.getByRole("button", { name: "Retirer maintenant" })
    fireEvent.focus(undo)
    expect(onHold).toHaveBeenLastCalledWith("focus")
    // Moving inside the bar keeps the hold.
    fireEvent.blur(undo, { relatedTarget: now })
    expect(onRelease).not.toHaveBeenCalled()
    fireEvent.blur(now, { relatedTarget: screen.getByRole("button", { name: "ailleurs" }) })
    expect(onRelease).toHaveBeenLastCalledWith("focus")
    const bar = undo.parentElement!
    fireEvent.pointerEnter(bar)
    expect(onHold).toHaveBeenLastCalledWith("pointer")
    fireEvent.pointerLeave(bar)
    expect(onRelease).toHaveBeenLastCalledWith("pointer")
  })
})
