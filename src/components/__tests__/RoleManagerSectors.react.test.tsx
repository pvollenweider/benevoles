/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"
import { useState } from "react"

import RoleManagerPanel from "../admin/shifts/RoleManagerPanel"
import type { RawShift } from "../admin/shifts/types"
import type { AdminSectorsState } from "../admin/ShiftsManager"

// « Gérer les postes » once the event adopted sectors (#1147): one tree, sector by sector, empty
// sectors included, « Ajouter un poste dans « S » », « Déplacer… », « Autres postes » last.

const fetchMock = vi.fn()

const shift = (over: Partial<RawShift>): RawShift => ({
  id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
  capacity: 2, status: "open", registrationCount: 0, displayOrder: 0, sectorId: null, ...over,
})

const ADOPTED: AdminSectorsState = {
  enabled: true, adoptedAt: "2026-06-01T00:00:00.000Z",
  sectors: [
    { id: "sec-entrees", name: "Entrées", displayOrder: 0, archivedAt: null },
    { id: "sec-scene", name: "Scène", displayOrder: 1, archivedAt: null },
  ],
}

function Harness({ initialShifts, initialRoles, sectors = ADOPTED, onAnnounce = vi.fn(), onAddPoste = vi.fn() }: {
  initialShifts: RawShift[]; initialRoles: string[]; sectors?: AdminSectorsState
  onAnnounce?: (t: string) => void; onAddPoste?: React.ComponentProps<typeof RoleManagerPanel>["onAddPoste"]
}) {
  const [shifts, setShifts] = useState(initialShifts)
  const [roles, setRoles] = useState(initialRoles)
  const [sectorsState, setSectorsState] = useState<AdminSectorsState | null>(sectors)
  return (
    <>
      <RoleManagerPanel open panelId="roles-panel" eventId="evt-1" shifts={shifts} setShifts={setShifts} roles={roles} setRoles={setRoles}
        onClose={vi.fn()} onAnnounce={onAnnounce} onRequestDelete={vi.fn()} onDeletingChange={vi.fn()} onDeleteError={vi.fn()} onRoleDeleted={vi.fn()}
        sectorsState={sectorsState} setSectorsState={setSectorsState} onAddPoste={onAddPoste} />
      <output data-testid="roles">{roles.join(",")}</output>
    </>
  )
}

const shifts = [
  shift({ id: "s1", roleName: "Accueil", sectorId: "sec-entrees" }),
  shift({ id: "s2", roleName: "Billetterie", sectorId: "sec-entrees", displayOrder: 100 }),
  shift({ id: "s3", roleName: "Montage", displayOrder: 200 }),
]
const roles = ["Accueil", "Billetterie", "Montage"]

describe("RoleManagerPanel with sectors adopted", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("draws one tree: the sectors in order, an empty one included, then « Autres postes »; h2 > h3 > h4", () => {
    render(<Harness initialShifts={shifts} initialRoles={roles} />)
    expect(screen.getByRole("heading", { level: 3, name: /Postes par secteur/ })).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual(["Entrées", "Scène", "Autres postes"])
    const sectorsList = screen.getByRole("list", { name: "Ordre des secteurs" })
    const [entrees, scene] = within(sectorsList).getAllByRole("listitem").filter((li) => li.parentElement === sectorsList)
    expect(within(entrees).getByRole("list", { name: "Ordre des postes, Entrées" })).toHaveTextContent(/Accueil.*Billetterie/)
    expect(within(entrees).getByText("2 postes")).toBeInTheDocument()
    expect(within(scene).getByText("Aucun poste pour l'instant.")).toBeInTheDocument()
    expect(within(scene).getByRole("button", { name: "Ajouter un poste dans « Scène »" })).toBeInTheDocument()
    expect(screen.getByRole("list", { name: "Ordre des postes, Autres postes" })).toHaveTextContent("Montage")
    // No landmark per sector.
    expect(screen.queryAllByRole("region")).toHaveLength(0)
  })

  it("explains « Déplacer… » while every poste is still in « Autres postes » (right after the first sector)", () => {
    const fresh = shifts.map((s) => ({ ...s, sectorId: null }))
    render(<Harness initialShifts={fresh} initialRoles={roles} />)
    expect(screen.getByText("Vos postes existants restent dans « Autres postes ». Utilisez « Déplacer… » pour les ranger dans vos secteurs.")).toBeInTheDocument()
    cleanup()
    render(<Harness initialShifts={shifts} initialRoles={roles} />)
    expect(screen.queryByText(/Vos postes existants restent/)).not.toBeInTheDocument()
  })

  it("hands « Ajouter un poste dans « S » » to the parent with a getter for the button", () => {
    const onAddPoste = vi.fn()
    render(<Harness initialShifts={shifts} initialRoles={roles} onAddPoste={onAddPoste} />)
    const button = screen.getByRole("button", { name: "Ajouter un poste dans « Scène »" })
    fireEvent.click(button)
    expect(onAddPoste).toHaveBeenCalledWith({ id: "sec-scene", name: "Scène" }, expect.any(Function))
    expect(onAddPoste.mock.calls[0][1]()).toBe(button)
  })

  it("« Déplacer… » moves the poste with all its shifts, focus follows it to its new sector, and the announcement gives its place", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    const onAnnounce = vi.fn()
    render(<Harness initialShifts={shifts} initialRoles={roles} onAnnounce={onAnnounce} />)
    expect(screen.queryByRole("button", { name: /^Secteur :/ })).not.toBeInTheDocument()
    const open = screen.getByRole("button", { name: "Déplacer le poste « Montage »" })
    expect(open).toHaveTextContent("Déplacer…")
    fireEvent.click(open)
    const select = screen.getByLabelText("Déplacer le poste « Montage » vers")
    expect(select).toHaveFocus()
    expect(select).toHaveAccessibleDescription("Tous les créneaux du poste suivent, sur tous les jours.")
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual(["Entrées", "Scène", "Autres postes (aucun secteur)"])
    fireEvent.change(select, { target: { value: "sec-entrees" } })
    fireEvent.click(screen.getByRole("button", { name: "Déplacer" }))

    await waitFor(() => expect(onAnnounce).toHaveBeenCalledWith("Poste « Montage » déplacé dans le secteur « Entrées », en dernière position (3 sur 3)."))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sectorId: "sec-entrees" })
    expect(screen.getByRole("list", { name: "Ordre des postes, Entrées" })).toHaveTextContent("Montage")
    expect(screen.queryByRole("heading", { name: "Autres postes" })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("button", { name: "Déplacer le poste « Montage »" })).toHaveFocus())
  })

  it("« Déplacer » to the current sector closes like « Annuler », without request or announcement", async () => {
    const onAnnounce = vi.fn()
    render(<Harness initialShifts={shifts} initialRoles={roles} onAnnounce={onAnnounce} />)
    fireEvent.click(screen.getByRole("button", { name: "Déplacer le poste « Accueil »" }))
    fireEvent.click(screen.getByRole("button", { name: "Déplacer" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Déplacer le poste « Accueil »" })).toHaveFocus())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onAnnounce).not.toHaveBeenCalled()
  })

  it("a refused move keeps the form open with its error tied to the select", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Ce secteur est archivé : rétablissez-le avant d'y placer un poste." }) })
    render(<Harness initialShifts={shifts} initialRoles={roles} />)
    fireEvent.click(screen.getByRole("button", { name: "Déplacer le poste « Montage »" }))
    const select = screen.getByLabelText("Déplacer le poste « Montage » vers")
    fireEvent.change(select, { target: { value: "sec-scene" } })
    fireEvent.click(screen.getByRole("button", { name: "Déplacer" }))
    await waitFor(() => expect(select).toHaveAttribute("aria-invalid", "true"))
    expect(select).toHaveAccessibleDescription(/Ce secteur est archivé.*Tous les créneaux du poste suivent/)
  })

  it("Monter / Descendre move a poste inside its sector only", () => {
    const onAnnounce = vi.fn()
    render(<Harness initialShifts={shifts} initialRoles={roles} onAnnounce={onAnnounce} />)
    fireEvent.click(screen.getByRole("button", { name: "Descendre le poste Accueil" }))
    expect(screen.getByTestId("roles")).toHaveTextContent("Billetterie,Accueil,Montage")
    fireEvent.click(screen.getByRole("button", { name: "Descendre le poste Accueil" }))
    expect(onAnnounce).toHaveBeenLastCalledWith("Accueil est déjà en dernière position.")
  })

  it("a sector being renamed keeps its heading", () => {
    render(<Harness initialShifts={shifts} initialRoles={roles} />)
    fireEvent.click(screen.getByRole("button", { name: "Renommer le secteur Entrées" }))
    expect(screen.getByLabelText("Nouveau nom du secteur « Entrées »")).toHaveFocus()
    expect(screen.getByRole("heading", { level: 4, name: "Entrées" })).toBeInTheDocument()
  })

  it("shows the empty sectors and the add form with no poste at all; « Fermer » stays, « Enregistrer l'ordre » goes", () => {
    render(<Harness initialShifts={[]} initialRoles={[]} />)
    expect(screen.getAllByText("Aucun poste pour l'instant.")).toHaveLength(2)
    expect(screen.queryByRole("heading", { name: "Autres postes" })).not.toBeInTheDocument()
    expect(screen.getByLabelText("Nouveau secteur")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Fermer" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Enregistrer l'ordre" })).not.toBeInTheDocument()
  })

  it("before the first sector: the « Secteurs » part, then the flat list, without « Déplacer… »", () => {
    render(<Harness initialShifts={shifts.map((s) => ({ ...s, sectorId: null }))} initialRoles={roles} sectors={{ enabled: true, adoptedAt: null, sectors: [] }} />)
    expect(screen.getByRole("heading", { level: 3, name: /Secteurs/ })).toBeInTheDocument()
    expect(screen.getByRole("list", { name: "Ordre des postes" })).toHaveTextContent(/Accueil.*Billetterie.*Montage/)
    expect(screen.queryByRole("button", { name: /Déplacer le poste/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { level: 4 })).not.toBeInTheDocument()
  })

  it("the first sector turns the part into the tree and gives the add field its focus back", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sector: { id: "sec-1", name: "Entrées", displayOrder: 0, archivedAt: null }, adopted: true }) })
    const onAnnounce = vi.fn()
    render(<Harness initialShifts={shifts.map((s) => ({ ...s, sectorId: null }))} initialRoles={roles} sectors={{ enabled: true, adoptedAt: null, sectors: [] }} onAnnounce={onAnnounce} />)
    expect(screen.getByRole("heading", { level: 2, name: "Gérer les postes" })).toBeInTheDocument()
    const input = screen.getByLabelText("Nouveau secteur")
    input.focus()
    fireEvent.change(input, { target: { value: "Entrées" } })
    fireEvent.submit(input.closest("form")!)
    await waitFor(() => expect(onAnnounce).toHaveBeenCalledWith("Secteur « Entrées » ajouté. Cet événement utilise maintenant des secteurs."))
    expect(screen.getByRole("heading", { level: 3, name: /Postes par secteur/ })).toBeInTheDocument()
    // The panel is renamed in place once the server confirmed the adoption.
    expect(screen.getByRole("heading", { level: 2, name: "Gérer les secteurs et postes" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Gérer les postes" })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText("Nouveau secteur")).toHaveFocus())
    expect(screen.getByText(/Vos postes existants restent dans « Autres postes »/)).toBeInTheDocument()
  })

  it("a first sector the server refuses renames nothing: the panel stays « Gérer les postes »", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Les secteurs ne sont pas disponibles." }) })
    render(<Harness initialShifts={shifts.map((s) => ({ ...s, sectorId: null }))} initialRoles={roles} sectors={{ enabled: true, adoptedAt: null, sectors: [] }} />)
    const input = screen.getByLabelText("Nouveau secteur")
    fireEvent.change(input, { target: { value: "Entrées" } })
    fireEvent.submit(input.closest("form")!)
    await waitFor(() => expect(screen.getByText("Les secteurs ne sont pas disponibles.")).toBeInTheDocument())
    expect(screen.getByRole("heading", { level: 2, name: "Gérer les postes" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Gérer les secteurs et postes" })).not.toBeInTheDocument()
  })

  it("archiving a sector without postes gives focus to the previous sector's « Renommer », never to <body>", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sector: { id: "sec-scene", name: "Scène", displayOrder: 1, archivedAt: "2026-10-26T00:00:00.000Z" } }) })
    render(<Harness initialShifts={shifts} initialRoles={roles} />)
    const archive = screen.getByRole("button", { name: "Archiver le secteur Scène" })
    archive.focus()
    fireEvent.click(archive)
    // The previous sector's « Renommer » is the first fallback that exists.
    await waitFor(() => expect(screen.getByRole("button", { name: "Renommer le secteur Entrées" })).toHaveFocus())
  })
})
