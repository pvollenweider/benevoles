/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react"

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
// The hrefs the mocked Link went on to on its own (its navigation not prevented).
const followed = vi.hoisted(() => [] as string[])
vi.mock("next/navigation", () => ({ useRouter: () => router }))
// Next's Link, as far as the popover relies on it: `onNavigate` for an in-app navigation only (not
// with Ctrl, Cmd, Shift or Alt, which open a new tab or window), its preventDefault read at once.
vi.mock("next/link", () => ({
  default: ({ onNavigate, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: (e: { preventDefault(): void }) => void }) => (
    <a {...rest} onClick={e => {
      e.preventDefault() // jsdom does not navigate; what matters is whether onNavigate let it go
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
      let prevented = false
      onNavigate?.({ preventDefault() { prevented = true } })
      if (!prevented) followed.push(String(rest.href))
    }}>{children}</a>
  ),
}))

import ShiftPopover from "../admin/day-timeline/ShiftPopover"
import { ROW_H } from "@/lib/day-timeline"
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
      onDuplicate: vi.fn().mockResolvedValue(undefined), onApplyToPoste: vi.fn().mockResolvedValue({ shifts: 3, days: 1, keptHigher: 0 }),
    }
    render(<ShiftPopover {...props} />)
    return props
  }

  it("stays inside the viewport: below a high bar, above a bar near the bottom", () => {
    const vh = window.innerHeight
    const props = {
      shift, eventId: "evt-1", onClose: vi.fn(), onPatch: vi.fn(), onDelete: vi.fn(),
      onDuplicate: vi.fn(), onApplyToPoste: vi.fn(),
    }
    const { unmount } = render(<ShiftPopover {...props} anchor={{ x: 100, y: 100, w: 80 }} />)
    const below = screen.getByRole("dialog")
    expect(parseFloat(below.style.top)).toBe(100 + ROW_H + 6)
    expect(parseFloat(below.style.top) + parseFloat(below.style.maxHeight)).toBeLessThanOrEqual(vh)
    unmount()
    render(<ShiftPopover {...props} anchor={{ x: 100, y: vh - 60, w: 80 }} />)
    const above = screen.getByRole("dialog")
    expect(parseFloat(above.style.top)).toBeGreaterThanOrEqual(0)
    expect(parseFloat(above.style.top) + parseFloat(above.style.maxHeight)).toBeLessThanOrEqual(vh - 60)
  })

  it("is placed again inside the viewport when the window gets shorter", () => {
    const original = window.innerHeight
    try {
      render(<ShiftPopover shift={shift} eventId="evt-1" anchor={{ x: 100, y: 300, w: 80 }} onClose={vi.fn()} onPatch={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} onApplyToPoste={vi.fn()} />)
      Object.defineProperty(window, "innerHeight", { value: 380, configurable: true, writable: true })
      act(() => { window.dispatchEvent(new Event("resize")) })
      const dialog = screen.getByRole("dialog")
      expect(parseFloat(dialog.style.top)).toBeGreaterThanOrEqual(0)
      expect(parseFloat(dialog.style.top) + parseFloat(dialog.style.maxHeight)).toBeLessThanOrEqual(380)
    } finally {
      Object.defineProperty(window, "innerHeight", { value: original, configurable: true, writable: true })
    }
  })

  it("uses the measured content height: a short popover stays below a bar in the lower half", () => {
    const vh = window.innerHeight
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() { return (this as HTMLElement).hasAttribute("data-popover-content") ? 100 : 0 },
    })
    try {
      const y = vh - 260
      render(<ShiftPopover shift={shift} eventId="evt-1" anchor={{ x: 100, y, w: 80 }} onClose={vi.fn()} onPatch={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} onApplyToPoste={vi.fn()} />)
      // Unmeasured, the larger side (above) would be taken; 100 px fit in the 206 px below.
      expect(parseFloat(screen.getByRole("dialog").style.top)).toBe(y + ROW_H + 6)
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "offsetHeight", descriptor)
    }
  })

  it("closes and saves without pulling focus back when focus leaves for another control", () => {
    const outside = document.createElement("button")
    document.body.appendChild(outside)
    const opener = document.createElement("button")
    document.body.appendChild(opener)
    opener.focus()
    const props = { onClose: vi.fn(), onPatch: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(), onApplyToPoste: vi.fn() }
    try {
      render(<ShiftPopover shift={shift} eventId="evt-1" anchor={{ x: 100, y: 100, w: 80 }} {...props} />)
      const heading = screen.getByRole("heading", { name: /Bar/ })
      fireEvent.focusOut(heading, { relatedTarget: null })
      expect(props.onClose).not.toHaveBeenCalled()
      outside.focus()
      fireEvent.focusOut(heading, { relatedTarget: outside })
      expect(props.onPatch).toHaveBeenCalledTimes(1)
      expect(props.onClose).toHaveBeenCalledTimes(1)
      expect(outside).toHaveFocus()
    } finally {
      outside.remove()
      opener.remove()
    }
  })

  it("Escape gives focus back to the bar only when focus was inside the popover", () => {
    const opener = document.createElement("button")
    document.body.appendChild(opener)
    opener.focus()
    const props = { onClose: vi.fn(), onPatch: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(), onApplyToPoste: vi.fn() }
    try {
      render(<ShiftPopover shift={shift} eventId="evt-1" anchor={{ x: 100, y: 100, w: 80 }} {...props} />)
      expect(screen.getByRole("heading", { name: /Bar/ })).toHaveFocus()
      fireEvent.keyDown(document, { key: "Escape" })
      expect(props.onClose).toHaveBeenCalledTimes(1)
      expect(opener).toHaveFocus()
    } finally {
      opener.remove()
    }
  })

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

  it("« Décaler » of an overnight shift's start keeps its next-morning end (#1024)", async () => {
    const p = setup({ startTime: "22:00", endTime: "02:00" })
    const start = screen.getByLabelText("Début")
    for (const value of ["2", "23", "23:", "23:0", "23:00"]) fireEvent.change(start, { target: { value } })
    fireEvent.blur(start)
    expect(screen.getByLabelText("Fin")).toHaveValue("02:00")
    fireEvent.click(screen.getByRole("button", { name: "Décaler" }))
    await waitFor(() => expect(p.onPatch).toHaveBeenCalledWith("s1", { startTime: "23:00", endTime: "02:00" }))
  })

  it("duplicates and applies the capacity to the role", async () => {
    const p = setup()
    fireEvent.click(screen.getByRole("button", { name: "Dupliquer" }))
    await waitFor(() => expect(p.onDuplicate).toHaveBeenCalledWith("s1"))

    fireEvent.change(screen.getByLabelText("Places"), { target: { value: "5" } })
    fireEvent.click(screen.getByRole("button", { name: "Appliquer à tout le poste" }))
    await waitFor(() => expect(p.onApplyToPoste).toHaveBeenCalledWith("s1", "Bar", "day", { capacity: 5 }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Appliqué à 3 créneaux du poste « Bar » ce jour."))
  })

  it("refuses a capacity under the confirmed people: flagged, not applied, not saved on close", () => {
    const p = setup()
    fireEvent.change(screen.getByLabelText("Places"), { target: { value: "1" } })
    expect(screen.getByLabelText("Places")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText(/Au moins 2 : 2 personnes sont déjà inscrites/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Appliquer à tout le poste" }))
    expect(p.onApplyToPoste).not.toHaveBeenCalled()
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

  // #587: the heading's time in words, no title-only help, busy buttons with a name, a link that
  // says where it goes.
  it("names the dialog with the role and the time in words, without a title attribute", () => {
    setup({ startTime: "10:30", endTime: "12:00" })
    expect(screen.getByRole("dialog", { name: "Bar, de 10h30 à 12h" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Bar, de 10h30 à 12h" })).toBeInTheDocument()
    expect(screen.getByText("10h30–12h")).toHaveAttribute("aria-hidden", "true")
    expect(document.querySelector("[title]")).toBeNull()
    expect(screen.getByRole("textbox", { name: "Libellé" })).toHaveAccessibleDescription(
      "Laisser vide si identique au poste. Libellé et places sont enregistrés à la fermeture (Échap ou « Fermer et enregistrer »).",
    )
  })

  it("shows a long role name whole in its heading (#606)", () => {
    const long = "Accueil des artistes et des invités de la soirée de clôture"
    setup({ roleName: long, label: long })
    const name = screen.getByText(long)
    expect(name).not.toHaveClass("truncate")
    expect(name.className).toContain("[overflow-wrap:anywhere]")
  })

  it("busy « Décaler » and « Dupliquer » keep a name a screen reader can say", async () => {
    const p = setup()
    p.onPatch.mockReturnValue(new Promise(() => {}))
    p.onDuplicate.mockReturnValue(new Promise(() => {}))
    fireEvent.change(screen.getByLabelText("Fin"), { target: { value: "13:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Décaler" }))
    expect(await screen.findByRole("button", { name: "Décalage…" })).toHaveAttribute("aria-disabled", "true")
    cleanup()

    const q = setup()
    q.onDuplicate.mockReturnValue(new Promise(() => {}))
    fireEvent.click(screen.getByRole("button", { name: "Dupliquer" }))
    expect(await screen.findByRole("button", { name: "Duplication…" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.queryByRole("button", { name: "…" })).toBeNull()
  })

  it("links to the shift's registrations as « Voir les inscriptions »", () => {
    setup()
    expect(screen.getByRole("link", { name: "Voir les inscriptions" })).toHaveAttribute("href", "/admin/events/evt-1/registrations?shift=s1")
  })

  // #991: following the link used to drop the label and places typed just before.
  describe("« Voir les inscriptions » with pending edits", () => {
    afterEach(() => { router.push.mockReset(); router.refresh.mockReset(); followed.length = 0 })
    const link = () => screen.getByRole("link", { name: /Voir les inscriptions|Enregistrement…/ })

    it("follows at once, without saving, when nothing was changed", () => {
      const p = setup()
      fireEvent.click(link())
      expect(p.onPatch).not.toHaveBeenCalled()
      expect(p.onClose).toHaveBeenCalled()
      expect(followed).toEqual(["/admin/events/evt-1/registrations?shift=s1"])
      expect(router.push).not.toHaveBeenCalled()
    })

    it("saves the places first, once, then closes and goes to the registrations", async () => {
      const p = setup()
      let resolve!: (ok: boolean) => void
      p.onPatch.mockReturnValue(new Promise<boolean>(r => { resolve = r }))
      fireEvent.change(screen.getByLabelText("Places"), { target: { value: "6" } })
      fireEvent.click(link())
      expect(p.onPatch).toHaveBeenCalledWith("s1", { label: "Bar", capacity: 6 })
      expect(link()).toHaveTextContent("Enregistrement…")
      expect(link()).toHaveAttribute("aria-disabled", "true")
      expect(link()).toHaveAttribute("href", "/admin/events/evt-1/registrations?shift=s1")
      expect(screen.getByRole("button", { name: "Fermer et enregistrer" })).toHaveAttribute("aria-disabled", "true")
      // Neither a second activation nor a click outside or Escape saves again meanwhile.
      fireEvent.click(link())
      fireEvent.mouseDown(document.body)
      fireEvent.keyDown(document, { key: "Escape" })
      expect(p.onPatch).toHaveBeenCalledTimes(1)
      expect(p.onClose).not.toHaveBeenCalled()
      await act(async () => { resolve(true) })
      expect(p.onClose).toHaveBeenCalledTimes(1)
      expect(router.push).toHaveBeenCalledWith("/admin/events/evt-1/registrations?shift=s1")
      expect(router.refresh).toHaveBeenCalled()
      expect(followed).toEqual([])
    })

    it("stays open, focus on the link, when the save fails; closing saves again afterwards", async () => {
      const p = setup()
      p.onPatch.mockResolvedValueOnce(false)
      fireEvent.change(screen.getByLabelText("Libellé"), { target: { value: "Bar soir" } })
      link().focus()
      fireEvent.click(link())
      await waitFor(() => expect(link()).toHaveTextContent("Voir les inscriptions"))
      expect(link()).not.toHaveAttribute("aria-disabled")
      expect(link()).toHaveFocus()
      expect(p.onClose).not.toHaveBeenCalled()
      expect(router.push).not.toHaveBeenCalled()
      expect(followed).toEqual([])
      fireEvent.keyDown(document, { key: "Escape" })
      expect(p.onPatch).toHaveBeenLastCalledWith("s1", { label: "Bar soir", capacity: 3 })
      expect(p.onClose).toHaveBeenCalled()
    })

    it("moves focus to a changed value that cannot be saved, without leaving", () => {
      const p = setup()
      fireEvent.change(screen.getByLabelText("Places"), { target: { value: "1" } })
      fireEvent.click(link())
      const places = screen.getByLabelText("Places")
      expect(places).toHaveFocus()
      expect(places).toHaveAttribute("aria-invalid", "true")
      expect(places).toHaveAccessibleDescription(/Au moins 2 : 2 personnes sont déjà inscrites/)
      expect(p.onPatch).not.toHaveBeenCalled()
      expect(p.onClose).not.toHaveBeenCalled()

      fireEvent.change(places, { target: { value: "3" } })
      fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "5" } })
      fireEvent.click(link())
      expect(screen.getByLabelText("Minimum")).toHaveFocus()
      expect(p.onPatch).not.toHaveBeenCalled()
      expect(followed).toEqual([])
    })

    it("keeps the popover and its edits for a Ctrl or Cmd click (new tab)", () => {
      const p = setup()
      fireEvent.change(screen.getByLabelText("Places"), { target: { value: "6" } })
      fireEvent.click(link(), { ctrlKey: true })
      fireEvent.click(link(), { metaKey: true })
      expect(p.onClose).not.toHaveBeenCalled()
      expect(p.onPatch).not.toHaveBeenCalled()
      expect(screen.getByLabelText("Places")).toHaveValue(6)
    })
  })
})
