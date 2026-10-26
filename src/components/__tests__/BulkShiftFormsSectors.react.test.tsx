/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import ShiftSeriesForm from "../admin/ShiftSeriesForm"
import ShiftRecurrenceForm from "../admin/ShiftRecurrenceForm"

// Sector first (#1147) in « Créer une série » and « Répéter chaque semaine »: the same « Secteur »
// select as the shift editor, before « Poste », with the same follow and mismatch rules.

const fetchMock = vi.fn()
const sectors = [{ id: "sec-entrees", name: "Entrées" }, { id: "sec-bar", name: "Bar" }]
const existingShifts = [
  { roleName: "Accueil", displayOrder: 0, status: "open", sectorId: "sec-entrees" },
  { roleName: "Buvette", displayOrder: 100, status: "open", sectorId: "sec-bar" },
]

const forms = [
  {
    name: "Créer une série",
    render: (props: { sectors?: typeof sectors | null } = {}) =>
      render(<ShiftSeriesForm eventId="evt-1" dates={["2026-07-04"]} existingShifts={existingShifts} onCreated={vi.fn()} onClose={vi.fn()} sectors={sectors} {...props} />),
    fill: () => {
      fireEvent.change(screen.getByRole("textbox", { name: "Début" }), { target: { value: "10:00" } })
      fireEvent.change(screen.getByRole("textbox", { name: "Fin" }), { target: { value: "14:00" } })
    },
    url: "/api/admin/shifts/series",
    reply: [],
  },
  {
    name: "Répéter chaque semaine",
    render: (props: { sectors?: typeof sectors | null } = {}) =>
      render(<ShiftRecurrenceForm eventId="evt-1" eventStart="2026-07-01" eventEnd="2026-07-31" defaultHolidays="none" existingShifts={existingShifts} onCreated={vi.fn()} onClose={vi.fn()} sectors={sectors} {...props} />),
    fill: () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "mercredi" }))
      fireEvent.change(screen.getByRole("textbox", { name: "Début" }), { target: { value: "14:00" } })
      fireEvent.change(screen.getByRole("textbox", { name: "Fin" }), { target: { value: "17:00" } })
    },
    url: "/api/admin/shifts/recurrence",
    reply: { rule: { id: "rule-1" }, shifts: [] },
  },
]

describe.each(forms)("$name with sectors (#1147)", (form) => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const poste = () => screen.getByRole("combobox", { name: "Poste" })
  const select = () => screen.getByLabelText("Secteur")
  const create = () => fireEvent.click(screen.getByRole("button", { name: /^Créer/ }))
  const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body)

  it("asks for the sector before the poste, « Autres postes (aucun secteur) » last", () => {
    form.render()
    expect([...(select() as HTMLSelectElement).options].map((o) => o.text)).toEqual(["Entrées", "Bar", "Autres postes (aucun secteur)"])
    expect(select().compareDocumentPosition(poste()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("without sectors, no select and no sectorId sent", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => form.reply })
    form.render({ sectors: null })
    expect(screen.queryByLabelText("Secteur")).not.toBeInTheDocument()
    fireEvent.change(poste(), { target: { value: "Vestiaire" } })
    form.fill()
    create()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(sent()).not.toHaveProperty("sectorId")
  })

  it("follows the existing poste typed while untouched, and sends its sector", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => form.reply })
    form.render()
    fireEvent.change(poste(), { target: { value: "buvette" } })
    expect(select()).toHaveValue("sec-bar")
    expect(screen.queryByRole("button", { name: /Utiliser ce poste/ })).not.toBeInTheDocument()
    expect(poste()).toHaveAccessibleDescription(/^Secteur du poste : « Bar »\./)
    form.fill()
    expect(screen.getByRole("button", { name: /^Créer/ })).toHaveAccessibleDescription(/(dans|Secteur :) « Bar »\.$/)
    create()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe(form.url)
    expect(sent()).toMatchObject({ roleName: "Buvette", sectorId: "sec-bar" })
  })

  it("a new poste goes to the select's sector, said under the poste field", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => form.reply })
    form.render()
    fireEvent.change(select(), { target: { value: "sec-entrees" } })
    fireEvent.change(poste(), { target: { value: "Vestiaire" } })
    expect(poste()).toHaveAccessibleDescription("Le poste sera créé dans « Entrées » avec ses créneaux.")
    form.fill()
    create()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(sent()).toMatchObject({ roleName: "Vestiaire", sectorId: "sec-entrees" })
  })

  it("once chosen, an existing poste of another sector blocks creation; the switch button fixes it", async () => {
    form.render()
    fireEvent.change(select(), { target: { value: "sec-entrees" } })
    fireEvent.change(poste(), { target: { value: "Buvette" } })
    expect(select()).toHaveValue("sec-entrees")
    expect(screen.getByText("Le poste « Buvette » est dans le secteur « Bar ».")).toBeInTheDocument()
    form.fill()
    create()
    await waitFor(() => expect(poste()).toHaveFocus())
    expect(poste()).toHaveAttribute("aria-invalid", "true")
    expect(poste()).toHaveAccessibleDescription("Le poste « Buvette » est dans le secteur « Bar ». Choisissez ce secteur, ou un autre nom de poste.")
    expect(screen.getByText("À corriger : le secteur du poste.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce poste dans « Bar »" }))
    expect(select()).toHaveValue("sec-bar")
    expect(select()).toHaveFocus()
    expect(screen.queryByText("À corriger : le secteur du poste.")).not.toBeInTheDocument()
  })

  it("suggests every poste until a sector is chosen, then those of the sector", () => {
    const view = form.render()
    const options = () => [...view.container.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"))
    expect(options()).toEqual(expect.arrayContaining(["Accueil", "Buvette"]))
    fireEvent.change(select(), { target: { value: "sec-bar" } })
    expect(options()).toContain("Buvette")
    expect(options()).not.toContain("Accueil")
  })
})
