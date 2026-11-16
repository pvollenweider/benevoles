/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

import ShiftsManager from "../admin/ShiftsManager"
import type { AdminSectorsState } from "../admin/ShiftsManager"
import type { RawShift } from "../admin/shifts/types"

vi.mock("../admin/AdminDayTimeline", () => ({ default: () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

// « Gérer les postes »: closing with a poste order changed and not saved asks first, through the
// confirmation modal (never window.confirm). « Revenir aux postes » keeps the order being edited;
// « Fermer sans enregistrer » closes and gives focus to « Gérer les postes ».

const fetchMock = vi.fn()
const shift = (over: Partial<RawShift>): RawShift => ({
  id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
  capacity: 2, status: "open", registrationCount: 0, displayOrder: 0, ...over,
})
const shifts = [shift({ id: "s1" }), shift({ id: "s2", roleName: "Accueil", label: "Accueil", displayOrder: 100 })]

const manageRoles = () => screen.getByRole("button", { name: "Gérer les postes" })
const panelHeading = () => screen.queryByRole("heading", { name: "Gérer les postes" })
const order = () => within(screen.getByRole("list", { name: /^Ordre des postes/ })).getAllByRole("listitem").map((li) => li.textContent ?? "")

function renderManager(initialShifts = shifts, initialSectors: AdminSectorsState | null = null) {
  return render(<ShiftsManager eventId="evt-1" eventStartDate="2026-07-04" eventEndDate="2026-07-04" initialShifts={initialShifts} initialSectors={initialSectors} />)
}

describe("« Gérer les postes » with an unsaved poste order", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("confirm", vi.fn())
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("closes at once when the order is unchanged", async () => {
    renderManager()
    fireEvent.click(manageRoles())
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }))
    expect(panelHeading()).toBeNull()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("closes at once when a poste was moved and moved back", () => {
    renderManager()
    fireEvent.click(manageRoles())
    fireEvent.click(screen.getByRole("button", { name: "Descendre le poste Bar" }))
    fireEvent.click(screen.getByRole("button", { name: "Monter le poste Bar" }))
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }))
    expect(panelHeading()).toBeNull()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("« Fermer » asks first; « Revenir aux postes » keeps the panel and the order, focus back on « Fermer »", async () => {
    renderManager()
    fireEvent.click(manageRoles())
    fireEvent.click(screen.getByRole("button", { name: "Descendre le poste Bar" }))
    const close = screen.getByRole("button", { name: "Fermer" })
    close.focus()
    fireEvent.click(close)

    const dialog = screen.getByRole("dialog", { name: "L'ordre des postes n'est pas enregistré" })
    expect(dialog).toHaveAccessibleDescription(/Si vous fermez maintenant, le nouvel ordre est perdu\. Pour le garder, revenez aux postes et choisissez « Enregistrer l'ordre »\./)
    const back = within(dialog).getByRole("button", { name: "Revenir aux postes" })
    expect(back).toHaveFocus()
    expect(within(dialog).getByRole("button", { name: "Fermer sans enregistrer" })).toBeInTheDocument()
    expect(window.confirm).not.toHaveBeenCalled()

    fireEvent.click(back)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(panelHeading()).toBeInTheDocument()
    expect(order()[0]).toContain("Accueil")
    await waitFor(() => expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("Escape is « Revenir aux postes »", () => {
    renderManager()
    fireEvent.click(manageRoles())
    fireEvent.click(screen.getByRole("button", { name: "Descendre le poste Bar" }))
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }))
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(panelHeading()).toBeInTheDocument()
  })

  it("« Fermer sans enregistrer » closes the panel, saves nothing and gives focus to « Gérer les postes »; reopening shows the saved order", () => {
    renderManager()
    fireEvent.click(manageRoles())
    fireEvent.click(screen.getByRole("button", { name: "Descendre le poste Bar" }))
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }))
    fireEvent.click(screen.getByRole("button", { name: "Fermer sans enregistrer" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(panelHeading()).toBeNull()
    // In the same task: focus never drops to <body> between the dialog and the panel closing.
    expect(manageRoles()).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(manageRoles())
    expect(order()[0]).toContain("Bar")
  })

  it("the « Gérer les postes » toggle asks the same", () => {
    renderManager()
    fireEvent.click(manageRoles())
    fireEvent.click(screen.getByRole("button", { name: "Descendre le poste Bar" }))
    fireEvent.click(manageRoles())
    expect(screen.getByRole("dialog", { name: "L'ordre des postes n'est pas enregistré" })).toBeInTheDocument()
    expect(panelHeading()).toBeInTheDocument()
  })

  it("« Enregistrer l'ordre » closes without asking", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    renderManager()
    fireEvent.click(manageRoles())
    fireEvent.click(screen.getByRole("button", { name: "Descendre le poste Bar" }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l'ordre" }))
    await waitFor(() => expect(panelHeading()).toBeNull())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ roleOrder: ["Accueil", "Bar"] })
  })

  it("grouped by sector: the order shown is compared with the saved one drawn the same way", () => {
    const sectors: AdminSectorsState = {
      enabled: true, adoptedAt: "2026-06-01T00:00:00.000Z",
      sectors: [{ id: "sec-entrees", name: "Entrées", displayOrder: 0, archivedAt: null }],
    }
    // Saved order: Bar, Accueil, Vestiaire; drawn: Entrées (Accueil, Vestiaire), then « Autres postes » (Bar).
    renderManager([
      shift({ id: "s1" }),
      shift({ id: "s2", roleName: "Accueil", label: "Accueil", displayOrder: 100, sectorId: "sec-entrees" }),
      shift({ id: "s3", roleName: "Vestiaire", label: "Vestiaire", displayOrder: 200, sectorId: "sec-entrees" }),
    ], sectors)
    fireEvent.click(screen.getByRole("button", { name: "Gérer les secteurs et postes" }))
    // Nothing moved: no question, though the drawn order differs from the saved array.
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Gérer les secteurs et postes" }))
    fireEvent.click(screen.getByRole("button", { name: "Descendre le poste Accueil" }))
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }))
    expect(screen.getByRole("dialog", { name: "L'ordre des postes n'est pas enregistré" })).toBeInTheDocument()
  })
})
