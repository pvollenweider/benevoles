/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import ShiftEditor from "../admin/shifts/ShiftEditor"
import ShiftSeriesForm from "../admin/ShiftSeriesForm"
import ShiftRecurrenceForm from "../admin/ShiftRecurrenceForm"
import type { RawShift } from "../admin/shifts/types"

// #1018: the poste field of the shift forms suggests the event's postes (every day) first, then
// the examples; typing an existing poste says its settings apply and sends its stored spelling.

const fetchMock = vi.fn()

const shift = (roleName: string, date: string, displayOrder: number, status = "open") =>
  ({ id: `${roleName}-${date}`, roleName, label: roleName, date, startTime: "10:00", endTime: "12:00", capacity: 2, status, displayOrder, registrationCount: 0 }) as unknown as RawShift

// Day 1 has Accueil and Montage; day 2 has Bar; a cancelled Loge does not count.
const existing = [
  shift("Bar", "2026-07-05", 200),
  shift("Accueil", "2026-07-04", 100),
  shift("Montage", "2026-07-04", 300),
  shift("Loge", "2026-07-04", 50, "cancelled"),
]

const HINT = "Les réglages du poste « Accueil » s'appliquent (couleur, limite, accès, chevauchement)."
// The hint keeps its non-breaking spaces: match the text as is.
const raw = { normalizer: (s: string) => s }

/** The visible hint (the field's description) and the polite live region. */
const visibleHint = (input: HTMLElement) => document.getElementById(input.getAttribute("aria-describedby") ?? "")
const liveRegion = () => document.querySelector('[aria-live="polite"]')

function options(input: HTMLElement): string[] {
  const list = document.getElementById(input.getAttribute("list") ?? "")
  return [...(list?.querySelectorAll("option") ?? [])].map((o) => o.getAttribute("value") ?? "")
}

describe("poste picker of the shift forms (#1018)", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const editor = (props: Partial<React.ComponentProps<typeof ShiftEditor>> = {}) => {
    const onSaved = vi.fn()
    render(
      <ShiftEditor eventId="evt-1" dates={["2026-07-04", "2026-07-05"]} editingId={null} initial={{ date: "2026-07-05" }}
        existingShifts={existing} onSaved={onSaved} onCancel={vi.fn()} {...props} />,
    )
    return { onSaved, input: screen.getByLabelText("Poste *") }
  }

  it("lists the event's postes first, in poste order, then the unused examples", () => {
    const { input } = editor()
    const list = options(input)
    expect(list.slice(0, 3)).toEqual(["Accueil", "Bar", "Montage"])
    expect(list).toContain("Billetterie")
    expect(list).toContain("Loge") // only cancelled on the event: still an example
    expect(list.filter((o) => o.toLowerCase() === "bar")).toHaveLength(1)
  })

  it("says the poste's settings apply once an existing poste is typed: shown at once, said once typing settles", async () => {
    const { input } = editor()
    fireEvent.change(input, { target: { value: "  accueil " } })
    expect(visibleHint(input)?.textContent).toBe(HINT)
    expect(visibleHint(input)).not.toHaveAttribute("aria-live")
    expect(liveRegion()?.textContent).toBe("")
    await waitFor(() => expect(liveRegion()?.textContent).toBe(HINT))
    fireEvent.change(input, { target: { value: "Accueil VIP" } })
    expect(screen.queryByText(HINT, raw)).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute("aria-describedby")
    expect(liveRegion()?.textContent).toBe("")
  })

  it("gives no hint for a new poste", async () => {
    const { input } = editor()
    fireEvent.change(input, { target: { value: "Parking" } })
    await new Promise((r) => setTimeout(r, 600))
    expect(screen.queryByText(/Les réglages du poste/)).not.toBeInTheDocument()
  })

  it("sends the existing poste's spelling, so the shift joins it", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "s1" }) })
    const { input, onSaved } = editor()
    fireEvent.change(input, { target: { value: "accueil " } })
    fireEvent.change(screen.getByLabelText("Début *"), { target: { value: "10:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ roleName: "Accueil", label: "Accueil" })
  })

  it("gives no hint when editing a shift without changing its poste", async () => {
    editor({ editingId: "s9", initial: { roleName: "Accueil", date: "2026-07-04", startTime: "08:00", endTime: "09:00" } })
    await new Promise((r) => setTimeout(r, 600))
    expect(screen.queryByText(/Les réglages du poste/)).not.toBeInTheDocument()
  })

  it("does the same in the series form", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] })
    render(<ShiftSeriesForm eventId="evt-1" dates={["2026-07-05"]} existingShifts={existing} onCreated={vi.fn()} onClose={vi.fn()} />)
    const input = screen.getByRole("combobox", { name: "Poste" })
    expect(options(input).slice(0, 3)).toEqual(["Accueil", "Bar", "Montage"])
    fireEvent.change(input, { target: { value: "ACCUEIL" } })
    expect(visibleHint(input)?.textContent).toBe(HINT)
    fireEvent.change(screen.getByRole("textbox", { name: "Début" }), { target: { value: "10:00" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Fin" }), { target: { value: "14:00" } })
    fireEvent.click(screen.getByRole("button", { name: /Créer 2 créneaux/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ roleName: "Accueil" })
  })

  it("does the same in the weekly permanence form", async () => {
    render(<ShiftRecurrenceForm eventId="evt-1" eventStart="2026-07-01" eventEnd="2026-08-31" defaultHolidays="none" existingShifts={existing} onCreated={vi.fn()} onClose={vi.fn()} />)
    const input = screen.getByRole("combobox", { name: "Poste" })
    expect(options(input).slice(0, 3)).toEqual(["Accueil", "Bar", "Montage"])
    fireEvent.change(input, { target: { value: "accueil" } })
    expect(visibleHint(input)?.textContent).toBe(HINT)
  })
})
