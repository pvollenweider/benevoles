/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

import ShiftsManager from "../admin/ShiftsManager"
import type { AdminSectorsState } from "../admin/ShiftsManager"

vi.mock("../admin/AdminDayTimeline", () => ({ default: () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

// Sector first (#1147): sectors are created before any poste, then « Ajouter un poste dans « S » »
// opens the shift form in that sector; the new poste shows under it.

const fetchMock = vi.fn()
const sectors: AdminSectorsState = {
  enabled: true, adoptedAt: "2026-06-01T00:00:00.000Z",
  sectors: [{ id: "sec-entrees", name: "Entrées", displayOrder: 0, archivedAt: null }],
}

describe("ShiftsManager with sectors", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const renderManager = (initialSectors: AdminSectorsState | null = sectors) =>
    render(<ShiftsManager eventId="evt-1" eventStartDate="2026-07-04" eventEndDate="2026-07-04" initialShifts={[]} initialSectors={initialSectors} />)

  it("offers « Gérer les postes » before the first poste once sectors are on, not without them", () => {
    renderManager()
    expect(screen.getByRole("button", { name: "Gérer les postes" })).toBeInTheDocument()
    cleanup()
    renderManager(null)
    expect(screen.queryByRole("button", { name: "Gérer les postes" })).not.toBeInTheDocument()
  })

  it("« Ajouter un poste dans « Entrées » » opens the form in that sector; Annuler creates nothing and gives the button its focus back", async () => {
    renderManager()
    fireEvent.click(screen.getByRole("button", { name: "Gérer les postes" }))
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un poste dans « Entrées »" }))
    const editor = screen.getByRole("group", { name: "Nouveau poste : premier créneau" })
    expect(within(editor).getByLabelText("Secteur")).toHaveValue("sec-entrees")
    expect(within(editor).getByLabelText("Poste *")).toHaveFocus()
    fireEvent.click(within(editor).getByRole("button", { name: "Annuler" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Ajouter un poste dans « Entrées »" })).toHaveFocus())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("the saved poste shows under its sector in the open panel, focus back on the sector's add button", async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ id: "n1", roleName: "Accueil", label: "Accueil", date: "2026-07-04T00:00:00.000Z", startTime: "10:00", endTime: "12:00", capacity: 2, status: "open", displayOrder: 0, sectorId: "sec-entrees" }),
    })
    renderManager()
    fireEvent.click(screen.getByRole("button", { name: "Gérer les postes" }))
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un poste dans « Entrées »" }))
    const editor = screen.getByRole("group", { name: "Nouveau poste : premier créneau" })
    fireEvent.change(within(editor).getByLabelText("Poste *"), { target: { value: "Accueil" } })
    fireEvent.change(within(editor).getByLabelText("Début *"), { target: { value: "10:00" } })
    fireEvent.change(within(editor).getByLabelText("Fin *"), { target: { value: "12:00" } })
    fireEvent.click(within(editor).getByRole("button", { name: "Ajouter" }))
    await waitFor(() => expect(screen.getByRole("list", { name: "Ordre des postes, Entrées" })).toHaveTextContent("Accueil"))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ roleName: "Accueil", sectorId: "sec-entrees" })
    await waitFor(() => expect(screen.getByRole("button", { name: "Ajouter un poste dans « Entrées »" })).toHaveFocus())
  })
})
