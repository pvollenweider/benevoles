/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import ShiftEditor from "../admin/shifts/ShiftEditor"
import type { RawShift } from "../admin/shifts/types"

// Sector first, then poste (#1147): the shift form of an event that adopted sectors.

const fetchMock = vi.fn()
const sectors = [{ id: "sec-entrees", name: "Entrées" }, { id: "sec-bar", name: "Bar" }]
const shift = (over: Partial<RawShift>): RawShift => ({
  id: "s1", roleName: "Accueil", label: "Accueil", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
  capacity: 2, status: "open", registrationCount: 0, displayOrder: 0, sectorId: "sec-entrees", ...over,
})
const existingShifts = [
  shift({ id: "s1" }),
  shift({ id: "s2", roleName: "Buvette", sectorId: "sec-bar", displayOrder: 100 }),
  shift({ id: "s3", roleName: "Montage", sectorId: null, displayOrder: 200 }),
]

const setup = (props: Partial<React.ComponentProps<typeof ShiftEditor>> = {}) => {
  const onSaved = vi.fn()
  const onCancel = vi.fn()
  const view = render(
    <ShiftEditor eventId="evt-1" dates={["2026-07-04"]} editingId={null} initial={{ date: "2026-07-04" }}
      existingShifts={existingShifts} onSaved={onSaved} onCancel={onCancel} sectors={sectors} {...props} />,
  )
  return { onSaved, onCancel, view }
}

const fill = () => {
  fireEvent.change(screen.getByLabelText("Début *"), { target: { value: "14:00" } })
  fireEvent.change(screen.getByLabelText("Fin *"), { target: { value: "16:00" } })
}
const suggestions = (container: HTMLElement) => [...container.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"))

describe("ShiftEditor with sectors", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("asks for the sector first: the select comes before « Poste », focused, with « Autres postes (aucun secteur) » last", () => {
    setup()
    const select = screen.getByLabelText("Secteur")
    expect(select).toHaveFocus()
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual(["Entrées", "Bar", "Autres postes (aucun secteur)"])
    expect(select.compareDocumentPosition(screen.getByLabelText("Poste *")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("with every sector archived: no select, the new poste still goes explicitly to « Autres postes »", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "new", roleName: "Vestiaire", date: "2026-07-04" }) })
    setup({ sectors: [] })
    expect(screen.queryByLabelText("Secteur")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Poste *")).toHaveFocus()
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Vestiaire" } })
    fill()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).sectorId).toBeNull()
  })

  it("keeps the form without sectors as it was", () => {
    setup({ sectors: null })
    expect(screen.queryByLabelText("Secteur")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Poste *")).toHaveFocus()
  })

  it("starts in « Autres postes » (a sector is never required), suggests every poste until a sector is chosen, then filters to it", () => {
    const { view } = setup()
    expect(screen.getByLabelText("Secteur")).toHaveValue("")
    expect(suggestions(view.container)).toEqual(expect.arrayContaining(["Accueil", "Buvette", "Montage"]))
    fireEvent.change(screen.getByLabelText("Secteur"), { target: { value: "sec-entrees" } })
    expect(suggestions(view.container)).toContain("Accueil")
    expect(suggestions(view.container)).not.toContain("Buvette")
    fireEvent.change(screen.getByLabelText("Secteur"), { target: { value: "sec-bar" } })
    expect(suggestions(view.container)).toContain("Buvette")
    expect(suggestions(view.container)).not.toContain("Accueil")
  })

  it("sends the chosen sector with a new poste, and says the poste will be created there", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "new", roleName: "Vestiaire", date: "2026-07-04" }) })
    const { onSaved } = setup()
    fireEvent.change(screen.getByLabelText("Secteur"), { target: { value: "sec-bar" } })
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Vestiaire" } })
    expect(screen.getByText("Le poste sera créé dans « Bar » avec son premier créneau.")).toBeInTheDocument()
    fill()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ roleName: "Vestiaire", sectorId: "sec-bar" })
  })

  it("sends null for « Autres postes »", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "new", roleName: "Vestiaire", date: "2026-07-04" }) })
    setup()
    fireEvent.change(screen.getByLabelText("Secteur"), { target: { value: "" } })
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Vestiaire" } })
    fill()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).sectorId).toBeNull()
  })

  it("says where an existing poste of another sector is, offers to switch the select, and moves focus to it", async () => {
    setup()
    fireEvent.change(screen.getByLabelText("Secteur"), { target: { value: "sec-bar" } })
    const poste = screen.getByLabelText("Poste *")
    fireEvent.change(poste, { target: { value: " accueil" } })
    expect(poste).toHaveAccessibleDescription("Le poste « Accueil » est dans le secteur « Entrées ».")
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce poste dans « Entrées »" }))
    expect(screen.getByLabelText("Secteur")).toHaveValue("sec-entrees")
    expect(screen.getByLabelText("Secteur")).toHaveFocus()
    // The select says, as its description, that the poste's settings apply.
    expect(screen.getByLabelText("Secteur")).toHaveAccessibleDescription(/Les paramètres du poste.*Accueil.*s'appliquent/)
    expect(screen.queryByRole("button", { name: /Utiliser ce poste/ })).not.toBeInTheDocument()
  })

  it("names « Autres postes » for an existing poste without a sector", () => {
    setup()
    fireEvent.change(screen.getByLabelText("Secteur"), { target: { value: "sec-bar" } })
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Montage" } })
    expect(screen.getByText("Le poste « Montage » est dans « Autres postes ».")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Utiliser ce poste dans « Autres postes »" })).toBeInTheDocument()
  })

  it("blocks saving while the sector and the poste disagree: the poste field is invalid, says how to fix it, and gets focus", async () => {
    setup()
    fireEvent.change(screen.getByLabelText("Secteur"), { target: { value: "sec-bar" } })
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Accueil" } })
    fill()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    const poste = screen.getByLabelText("Poste *")
    await waitFor(() => expect(poste).toHaveFocus())
    expect(poste).toHaveAttribute("aria-invalid", "true")
    expect(poste).toHaveAccessibleDescription("Le poste « Accueil » est dans le secteur « Entrées ». Choisissez ce secteur, ou un autre nom de poste.")
    expect(screen.getByText("À corriger : le secteur du poste.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("adds a shift to an existing poste of the chosen sector with that sector", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "new", roleName: "Accueil", date: "2026-07-04" }) })
    setup()
    fireEvent.change(screen.getByLabelText("Secteur"), { target: { value: "sec-entrees" } })
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "accueil" } })
    expect(screen.queryByText(/sera créé/)).not.toBeInTheDocument()
    fill()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ roleName: "Accueil", sectorId: "sec-entrees" })
  })

  it("opened from « Ajouter un poste dans « Bar » »: the sector preset, the poste field empty and focused, the heading and hint", () => {
    setup({ presetSector: { id: "sec-bar", name: "Bar" } })
    expect(screen.getByRole("group", { name: "Nouveau poste : premier créneau" })).toBeInTheDocument()
    expect(screen.getByLabelText("Secteur")).toHaveValue("sec-bar")
    expect(screen.getByLabelText("Poste *")).toHaveFocus()
    expect(screen.getByLabelText("Poste *")).toHaveValue("")
    // Said once, with the poste field that has focus (not again by the group around it).
    expect(screen.getByLabelText("Poste *")).toHaveAccessibleDescription("Le poste sera créé dans « Bar » avec son premier créneau.")
    expect(screen.getByRole("group", { name: "Nouveau poste : premier créneau" })).not.toHaveAttribute("aria-describedby")
  })

  it("until a sector is chosen, the select follows the existing poste typed, with no mismatch, and says where it is", () => {
    setup()
    const select = screen.getByLabelText("Secteur")
    const poste = screen.getByLabelText("Poste *")
    fireEvent.change(poste, { target: { value: " accueil" } })
    expect(select).toHaveValue("sec-entrees")
    expect(screen.queryByRole("button", { name: /Utiliser ce poste/ })).not.toBeInTheDocument()
    expect(poste).toHaveAccessibleDescription(/^Secteur du poste : « Entrées »\. Les paramètres du poste/)
    // Its description says why it changed, for whoever comes back to it.
    expect(select).toHaveAccessibleDescription(/^Secteur du poste : « Entrées »\./)
    fireEvent.change(poste, { target: { value: "Buvette" } })
    expect(select).toHaveValue("sec-bar")
    fireEvent.change(poste, { target: { value: "Montage" } })
    expect(select).toHaveValue("")
    expect(screen.getByText(/^Secteur du poste : « Autres postes »\./)).toBeInTheDocument()
  })

  it("a new name goes back to « Autres postes » while no sector was chosen (« Bar » then « Barrière »)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "new", roleName: "Buvette 2", date: "2026-07-04" }) })
    setup()
    const poste = screen.getByLabelText("Poste *")
    fireEvent.change(poste, { target: { value: "Buvette" } })
    expect(screen.getByLabelText("Secteur")).toHaveValue("sec-bar")
    fireEvent.change(poste, { target: { value: "Buvette 2" } })
    expect(screen.getByLabelText("Secteur")).toHaveValue("")
    expect(poste).toHaveAccessibleDescription("Le poste sera créé dans « Autres postes » avec son premier créneau.")
    fill()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ roleName: "Buvette 2" })
    expect(body.sectorId ?? null).toBeNull()
  })

  it("a new name keeps a sector chosen by hand", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "new", roleName: "Buvette 2", date: "2026-07-04" }) })
    setup()
    fireEvent.change(screen.getByLabelText("Secteur"), { target: { value: "sec-bar" } })
    const poste = screen.getByLabelText("Poste *")
    fireEvent.change(poste, { target: { value: "Buvette 2" } })
    expect(screen.getByLabelText("Secteur")).toHaveValue("sec-bar")
    expect(poste).toHaveAccessibleDescription("Le poste sera créé dans « Bar » avec son premier créneau.")
    fill()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ roleName: "Buvette 2", sectorId: "sec-bar" })
  })

  it("saves an existing poste typed in an untouched select with the poste's own sector", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "new", roleName: "Accueil", date: "2026-07-04" }) })
    setup()
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Accueil" } })
    fill()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ roleName: "Accueil", sectorId: "sec-entrees" })
  })

  it("a select changed by hand is chosen: it no longer follows, and the mismatch rule applies", () => {
    setup()
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Accueil" } })
    fireEvent.change(screen.getByLabelText("Secteur"), { target: { value: "sec-bar" } })
    expect(screen.getByText("Le poste « Accueil » est dans le secteur « Entrées ».")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Montage" } })
    expect(screen.getByLabelText("Secteur")).toHaveValue("sec-bar")
    expect(screen.getByText("Le poste « Montage » est dans « Autres postes ».")).toBeInTheDocument()
  })

  it("a preset sector is chosen: an existing poste of another sector shows the mismatch, the select stays", () => {
    setup({ presetSector: { id: "sec-bar", name: "Bar" } })
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Accueil" } })
    expect(screen.getByLabelText("Secteur")).toHaveValue("sec-bar")
    expect(screen.getByRole("button", { name: "Utiliser ce poste dans « Entrées »" })).toBeInTheDocument()
  })

  it("editing a shift: no select, the poste's sector shown and how to change it, following the poste typed", () => {
    setup({ editingId: "s1", initial: { roleName: "Accueil", date: "2026-07-04", startTime: "10:00", endTime: "12:00" } })
    expect(screen.queryByLabelText("Secteur")).not.toBeInTheDocument()
    expect(screen.getByText(/^Secteur : Entrées\./)).toBeInTheDocument()
    expect(screen.getByLabelText("Poste *")).toHaveAccessibleDescription(/^Secteur : Entrées\./)
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Buvette" } })
    expect(screen.getByText(/^Secteur : Bar\./)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Tout nouveau" } })
    expect(screen.getByText(/^Secteur : Entrées\./)).toBeInTheDocument()
  })
})
