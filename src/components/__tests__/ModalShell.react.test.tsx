/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useLayoutEffect, useRef, useState } from "react"
import ModalShell from "@/components/admin/ModalShell"
import ImportModal from "@/components/admin/members/ImportModal"
import { resetPointerOpenerForTests } from "@/lib/modal-opener"

// ModalShell focus (#585): the trap skips hidden elements, the opener survives a WebKit tap, and
// focus goes back to it only if nobody else moved it.

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetPointerOpenerForTests()
  document.body.innerHTML = ""
})

const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab", shiftKey })

/** A trigger inside the admin's `<main tabIndex={-1}>`, opening a dialog with one action. */
function Page({ onClosed }: { onClosed?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <main id="main" tabIndex={-1}>
      <button type="button" onClick={() => setOpen(true)}>+ Nouveau membre</button>
      {open && (
        <ModalShell title="Nouveau membre" onClose={() => { setOpen(false); onClosed?.() }}>
          <button type="button" onClick={() => setOpen(false)}>Annuler</button>
        </ModalShell>
      )}
    </main>
  )
}

/** As WebKit does it: the tapped button does not take focus, its <main> does. */
function tapAsWebKit(button: HTMLElement) {
  fireEvent.pointerDown(button)
  act(() => document.querySelector<HTMLElement>("main")!.focus())
  fireEvent.click(button)
}

describe("ModalShell trap", () => {
  it("regression #585: Tab from « Importer 1 membre » at the preview step stays in the dialog, past the hidden file form", async () => {
    const analysis = {
      plan: {
        lines: [{ line: 2, firstName: "Chloé", lastName: "Roy", email: "chloe@example.com", phone: null, tags: [], action: "create", existingId: null }],
        errors: [], counts: { create: 1, update: 0, skip: 0, error: 0 }, newTags: [], reusedTags: [],
      },
      fileHash: "f", planHash: "p", detectedColumns: { email: "email" }, totalParsed: 1,
    }
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => analysis })))
    render(<ImportModal onClose={() => {}} onImported={() => {}} />)
    const input = screen.getByLabelText("Fichier CSV ou Excel")
    fireEvent.change(input, { target: { files: [new File(["email\nchloe@example.com"], "membres.csv", { type: "text/csv" })] } })
    fireEvent.submit(input.closest("form")!)
    const importer = await screen.findByRole("button", { name: "Importer 1 membre" })

    act(() => importer.focus())
    tab()
    expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus()
    tab(true)
    expect(importer).toHaveFocus()
  })

  it("Tab with focus outside the dialog (left on <main>) brings it back in, at the first or the last control", () => {
    render(<Page />)
    tapAsWebKit(screen.getByRole("button", { name: "+ Nouveau membre" }))
    act(() => document.querySelector<HTMLElement>("main")!.focus())
    tab()
    expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus()
    act(() => document.querySelector<HTMLElement>("main")!.focus())
    tab(true)
    expect(screen.getByRole("button", { name: "Annuler" })).toHaveFocus()
  })

  it("does not focus a hidden initial focus target: the first reachable control gets it", () => {
    function Hidden() {
      const ref = useRef<HTMLButtonElement>(null)
      return (
        <ModalShell title="Fenêtre" onClose={() => {}} initialFocusRef={ref}>
          <div hidden><button ref={ref} type="button">Caché</button></div>
        </ModalShell>
      )
    }
    render(<Hidden />)
    expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus()
  })
})

describe("ModalShell opener and restore", () => {
  it("a WebKit tap (focus left on <main>) still returns focus to the tapped trigger on close", () => {
    render(<Page />)
    const trigger = screen.getByRole("button", { name: "+ Nouveau membre" })
    tapAsWebKit(trigger)
    expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it("the same after a tap on « Annuler » inside the dialog, which also leaves focus on <main>", () => {
    render(<Page />)
    const trigger = screen.getByRole("button", { name: "+ Nouveau membre" })
    tapAsWebKit(trigger)
    tapAsWebKit(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it("a keyboard opening keeps the focused trigger as the opener", () => {
    render(<Page />)
    const trigger = screen.getByRole("button", { name: "+ Nouveau membre" })
    act(() => trigger.focus())
    fireEvent.keyDown(trigger, { key: "Enter" })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }))
    expect(trigger).toHaveFocus()
  })

  it("a parent that moves focus when the dialog closes wins over the opener", () => {
    function Parent() {
      const [open, setOpen] = useState(false)
      const [closed, setClosed] = useState(false)
      const xRef = useRef<HTMLButtonElement>(null)
      useLayoutEffect(() => { if (closed) xRef.current?.focus() }, [closed])
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Ouvrir</button>
          <button ref={xRef} type="button">X</button>
          {open && <ModalShell title="Fenêtre" onClose={() => { setOpen(false); setClosed(true) }}><p>Texte</p></ModalShell>}
        </>
      )
    }
    render(<Parent />)
    const opener = screen.getByRole("button", { name: "Ouvrir" })
    act(() => opener.focus())
    fireEvent.click(opener)
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.getByRole("button", { name: "X" })).toHaveFocus()
  })

  it("an opener removed while the dialog is open is skipped, without error", () => {
    function Parent() {
      const [open, setOpen] = useState(false)
      return (
        <>
          {!open && <button type="button" onClick={() => setOpen(true)}>Ouvrir</button>}
          {open && <ModalShell title="Fenêtre" onClose={() => setOpen(false)}><p>Texte</p></ModalShell>}
        </>
      )
    }
    render(<Parent />)
    const opener = screen.getByRole("button", { name: "Ouvrir" })
    act(() => opener.focus())
    fireEvent.click(opener)
    expect(opener.isConnected).toBe(false)
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(document.body)
  })

  it("a key press after a pointer press forgets it: the stale control is never restored", () => {
    function Parent() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button">A</button>
          <button type="button" onClick={() => setOpen(true)}>Ouvrir</button>
          {open && <ModalShell title="Fenêtre" onClose={() => setOpen(false)}><p>Texte</p></ModalShell>}
        </>
      )
    }
    render(<Parent />)
    const a = screen.getByRole("button", { name: "A" })
    fireEvent.pointerDown(a)
    fireEvent.keyDown(document.body, { key: "x" })
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }))
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(a).not.toHaveFocus()
    // The click on « Ouvrir » (no pointer press, as with VoiceOver on iOS) is the opener.
    expect(screen.getByRole("button", { name: "Ouvrir" })).toHaveFocus()
  })
})

describe("ModalShell stacked dialogs", () => {
  it("only the topmost dialog traps Tab and handles Escape", () => {
    const outerClose = vi.fn()
    const innerClose = vi.fn()
    render(
      <>
        <ModalShell title="Extérieure" onClose={outerClose}><button type="button">Action extérieure</button></ModalShell>
        <ModalShell title="Intérieure" onClose={innerClose}><button type="button">Action intérieure</button></ModalShell>
      </>,
    )
    const inner = screen.getByRole("dialog", { name: "Intérieure" })
    expect(inner).toContainElement(document.activeElement as HTMLElement)
    tab()
    tab()
    expect(inner).toContainElement(document.activeElement as HTMLElement)
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(innerClose).toHaveBeenCalledOnce()
    expect(outerClose).not.toHaveBeenCalled()
  })
})

describe("ModalShell busy", () => {
  it("« Fermer » stays focusable but aria-disabled, and nothing closes the dialog while busy", () => {
    const onClose = vi.fn()
    const { rerender } = render(<ModalShell title="Fenêtre" onClose={onClose} busy><p>Texte</p></ModalShell>)
    const close = screen.getByRole("button", { name: "Fermer" })
    expect(close).toHaveAttribute("aria-disabled", "true")
    expect(close).not.toBeDisabled()
    expect(close).toHaveFocus()
    fireEvent.click(close)
    fireEvent.keyDown(close, { key: "Escape" })
    fireEvent.click(screen.getByRole("dialog").parentElement!)
    expect(onClose).not.toHaveBeenCalled()

    rerender(<ModalShell title="Fenêtre" onClose={onClose} busy={false}><p>Texte</p></ModalShell>)
    expect(close).not.toHaveAttribute("aria-disabled")
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

