/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { useState, type KeyboardEventHandler } from "react"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import ShiftSelect from "../admin/registrations/ShiftSelect"
import { fmtShortDate, type ShiftRef } from "@/lib/registrations-list"

// The shift picker as a select-only combobox (#555): keyboard, names and states.
const bar: ShiftRef = { id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 3, registrationCount: 1 }
const equipe: ShiftRef = { id: "s2", roleName: "Équipe", label: "Équipe", date: "2026-07-04", startTime: "14:00", endTime: "16:00", capacity: 3, registrationCount: 3 }
const barSoir: ShiftRef = { id: "s3", roleName: "Bar", label: "Soir", date: "2026-07-04", startTime: "18:00", endTime: "20:00", capacity: 2, registrationCount: 0 }
const shifts = [bar, equipe, barSoir]
const date = fmtShortDate("2026-07-04")

function Harness({ onChange = () => {}, initial = "", nullable = false, existingShifts, onParentKeyDown }: {
  onChange?: (id: string) => void; initial?: string; nullable?: boolean; existingShifts?: ShiftRef[]; onParentKeyDown?: KeyboardEventHandler
}) {
  const [value, setValue] = useState(initial)
  return (
    <div onKeyDown={onParentKeyDown}>
      <p id="lbl">Créneau *</p>
      <ShiftSelect labelledBy="lbl" shifts={shifts} value={value} onChange={(id) => { onChange(id); setValue(id) }} nullable={nullable} existingShifts={existingShifts} placeholder="Tous les créneaux" />
    </div>
  )
}

const combo = () => screen.getByRole("combobox", { name: "Créneau *" })
const key = (k: string, init: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(combo(), { key: k, ...init })
const active = () => document.getElementById(combo().getAttribute("aria-activedescendant") ?? "")

describe("ShiftSelect", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("is a combobox named by its label, closed, with no list or active option", () => {
    render(<Harness />)
    expect(combo()).toHaveAttribute("aria-expanded", "false")
    expect(combo()).toHaveAttribute("aria-haspopup", "listbox")
    expect(combo()).not.toHaveAttribute("aria-controls")
    expect(combo()).not.toHaveAttribute("aria-activedescendant")
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("opens on click and commits the clicked option, focus kept on the trigger", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    combo().focus()
    fireEvent.click(combo())
    const list = screen.getByRole("listbox", { name: "Créneau *" })
    expect(combo()).toHaveAttribute("aria-expanded", "true")
    expect(combo()).toHaveAttribute("aria-controls", list.id)
    const option = screen.getByRole("option", { name: /^sam\. 4 juil\., de 10h à 12h, Bar,/ })
    // The press on an option does not take the focus away from the trigger.
    expect(fireEvent.mouseDown(option)).toBe(false)
    fireEvent.click(option)
    expect(onChange).toHaveBeenCalledWith("s1")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(combo()).toHaveFocus()
    expect(combo()).toHaveTextContent("Bar")
  })

  it("opens with ArrowDown and moves the active option, without choosing", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    key("ArrowDown")
    const options = screen.getAllByRole("option")
    expect(active()).toBe(options[0])
    key("ArrowDown")
    expect(active()).toBe(options[1])
    key("End")
    expect(active()).toBe(options[2])
    key("ArrowDown")
    expect(active()).toBe(options[2])
    key("Home")
    expect(active()).toBe(options[0])
    key("ArrowUp")
    expect(active()).toBe(options[0])
    expect(onChange).not.toHaveBeenCalled()
  })

  it("opens on the selected option", () => {
    render(<Harness initial="s3" />)
    key("ArrowUp")
    expect(active()).toBe(screen.getAllByRole("option")[2])
  })

  it("commits the active option with Enter, and with Space", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    key("Enter")
    expect(screen.getByRole("listbox")).toBeInTheDocument()
    key("ArrowDown")
    key("Enter")
    expect(onChange).toHaveBeenLastCalledWith("s2")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(combo()).not.toHaveAttribute("aria-activedescendant")

    key(" ")
    key("ArrowDown")
    key(" ")
    expect(onChange).toHaveBeenLastCalledWith("s3")
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("closes with Escape without choosing, and keeps Escape from the page only while open", () => {
    const onChange = vi.fn()
    const onParentKeyDown = vi.fn()
    render(<Harness onChange={onChange} onParentKeyDown={onParentKeyDown} />)
    key("ArrowDown")
    key("ArrowDown")
    key("Escape")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(onParentKeyDown.mock.calls.some(([e]) => e.key === "Escape")).toBe(false)
    key("Escape")
    expect(onParentKeyDown.mock.calls.some(([e]) => e.key === "Escape")).toBe(true)
  })

  it("commits the active option on Tab", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    key("ArrowDown")
    key("ArrowDown")
    const tab = key("Tab")
    expect(tab).toBe(true) // not prevented: the focus moves on
    expect(onChange).toHaveBeenCalledWith("s2")
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("finds options by their first letters, accents aside", () => {
    render(<Harness />)
    key("b")
    expect(screen.getByRole("listbox")).toBeInTheDocument()
    const options = screen.getAllByRole("option")
    expect(active()).toBe(options[0])
    key("b")
    expect(active()).toBe(options[2])
    key("e")
    // « be » matches nothing: the active option stays.
    expect(active()).toBe(options[2])
  })

  it("matches an accented role from a plain letter", () => {
    render(<Harness />)
    key("e")
    expect(active()).toBe(screen.getAllByRole("option")[1])
  })

  it("marks only the current value as selected", () => {
    render(<Harness initial="s2" />)
    fireEvent.click(combo())
    const [o1, o2, o3] = screen.getAllByRole("option")
    expect(o1).toHaveAttribute("aria-selected", "false")
    expect(o2).toHaveAttribute("aria-selected", "true")
    expect(o3).toHaveAttribute("aria-selected", "false")
  })

  it("names each option in words: date, hours, role, label, filling and conflicts", () => {
    const { unmount } = render(<Harness />)
    fireEvent.click(combo())
    expect(screen.getByRole("option", { name: `${date}, de 10h à 12h, Bar, 1 inscrit sur 3` })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: `${date}, de 14h à 16h, Équipe, complet` })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: `${date}, de 18h à 20h, Bar, Soir, aucun inscrit sur 2` })).toBeInTheDocument()
    unmount()

    render(<Harness existingShifts={[{ ...bar, startTime: "10:00", endTime: "15:00" }]} />)
    fireEvent.click(combo())
    expect(screen.getByRole("option", { name: /^sam\. 4 juil\., de 10h à 12h, Bar, 1 inscrit sur 3, déjà inscrit$/ })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Équipe, complet, conflit d'horaire$/ })).toBeInTheDocument()
  })

  it("offers « Tous les créneaux » first when the choice can be empty", () => {
    const onChange = vi.fn()
    const { unmount } = render(<Harness nullable initial="s1" onChange={onChange} />)
    fireEvent.click(combo())
    const all = screen.getByRole("option", { name: "Tous les créneaux" })
    expect(screen.getAllByRole("option")[0]).toBe(all)
    expect(all).toHaveAttribute("aria-selected", "false")
    key("Home")
    key("Enter")
    expect(onChange).toHaveBeenCalledWith("")
    fireEvent.click(combo())
    expect(screen.getByRole("option", { name: "Tous les créneaux" })).toHaveAttribute("aria-selected", "true")
    unmount()

    render(<Harness />)
    fireEvent.click(combo())
    expect(screen.queryByRole("option", { name: "Tous les créneaux" })).toBeNull()
  })

  it("closes on a press outside", () => {
    render(<Harness />)
    fireEvent.click(combo())
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(combo()).toHaveAttribute("aria-expanded", "false")
  })

  // #574: in a form, the field's id, required and invalid states, and its descriptions.
  it("sets no required, invalid or description by default", () => {
    render(<Harness />)
    expect(combo()).not.toHaveAttribute("aria-required")
    expect(combo()).not.toHaveAttribute("aria-invalid")
    expect(combo()).not.toHaveAttribute("aria-describedby")
    expect(combo()).not.toHaveAttribute("id")
  })

  it("puts the id, required, invalid and description on the combobox", () => {
    render(
      <>
        <p id="lbl">Créneau *</p>
        <p id="err">Sélectionnez un créneau.</p>
        <ShiftSelect id="pick" labelledBy="lbl" required invalid describedBy="err" shifts={shifts} value="" onChange={() => {}} />
      </>,
    )
    expect(combo()).toHaveAttribute("id", "pick")
    expect(combo()).toHaveAttribute("aria-required", "true")
    expect(combo()).toHaveAttribute("aria-invalid", "true")
    expect(combo()).toHaveAccessibleDescription("Sélectionnez un créneau.")
    expect(combo().className).toContain("border-red-600")
  })

  // #574: near the right edge, the open list moves left to stay on screen, and follows a resize.
  it("moves the open list left when it would overflow the viewport, and again on resize", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 700 } as DOMRect)
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(500)
    const clientWidth = vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1024)
    render(<Harness />)
    fireEvent.click(combo())
    const list = screen.getByRole("listbox")
    expect(list.style.left).toBe("-184px")

    clientWidth.mockReturnValue(1300)
    fireEvent(window, new Event("resize"))
    expect(list.style.left).toBe("")
    clientWidth.mockReturnValue(1100)
    fireEvent(window, new Event("resize"))
    expect(list.style.left).toBe("-108px")
  })

  it("leaves the list in place when it fits", () => {
    render(<Harness />)
    fireEvent.click(combo())
    expect(screen.getByRole("listbox").style.left).toBe("")
  })

  it("scrolls the active option into view", () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      render(<Harness />)
      key("ArrowDown")
      key("ArrowDown")
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" })
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getAllByRole("option")[1])
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })
})
