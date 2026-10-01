/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react"
import { useState } from "react"

import RoleManagerPanel from "../admin/shifts/RoleManagerPanel"
import type { RawShift } from "../admin/shifts/types"

// « Gérer les postes »: reorder, rename, delete a role, and its inline editors.

const fetchMock = vi.fn()

const shift = (over: Partial<RawShift>): RawShift => ({
  id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
  capacity: 2, status: "open", registrationCount: 0, displayOrder: 0, ...over,
})

const initialShifts = [
  shift({ id: "s1", roleName: "Bar", registrationCount: 2 }),
  shift({ id: "s2", roleName: "Accueil", displayOrder: 1 }),
]

type Spies = {
  onClose: () => void
  onAnnounce: (text: string) => void
  onRequestDelete: React.ComponentProps<typeof RoleManagerPanel>["onRequestDelete"]
  onDeletingChange: (deleting: boolean) => void
  onDeleteError: (error: string) => void
  onRoleDeleted: (role: string, unpublished: boolean | undefined) => void
}

/** Holds the shifts and the edited order like ShiftsManager does, and shows them for the assertions. */
function Harness({ open = true, spies }: { open?: boolean; spies: Spies }) {
  const [shifts, setShifts] = useState(initialShifts)
  const [roles, setRoles] = useState(["Bar", "Accueil"])
  return (
    <>
      <RoleManagerPanel open={open} eventId="evt-1" shifts={shifts} setShifts={setShifts} roles={roles} setRoles={setRoles} {...spies} />
      <output data-testid="roles">{roles.join(",")}</output>
      <output data-testid="shift-roles">{shifts.map(s => s.roleName).join(",")}</output>
    </>
  )
}

const makeSpies = () => ({
  onClose: vi.fn(), onAnnounce: vi.fn(), onRequestDelete: vi.fn(), onDeletingChange: vi.fn(), onDeleteError: vi.fn(), onRoleDeleted: vi.fn(),
})

describe("RoleManagerPanel", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renders nothing while closed", () => {
    render(<Harness open={false} spies={makeSpies()} />)
    expect(screen.queryByRole("heading", { name: "Gérer les postes" })).not.toBeInTheDocument()
  })

  it("renames a role in the shifts and in the order, then announces it", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    const spies = makeSpies()
    render(<Harness spies={spies} />)
    fireEvent.click(screen.getByRole("button", { name: "Renommer le poste Bar" }))
    const input = screen.getByLabelText("Nouveau nom du poste « Bar »")
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: "Buvette" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(spies.onAnnounce).toHaveBeenCalledWith("Poste renommé « Bar » → « Buvette »."))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/events/evt-1/roles/Bar")
    expect(JSON.parse(init.body)).toEqual({ name: "Buvette" })
    expect(screen.getByTestId("roles")).toHaveTextContent("Buvette,Accueil")
    expect(screen.getByTestId("shift-roles")).toHaveTextContent("Buvette,Accueil")
    expect(screen.getByRole("button", { name: "Renommer le poste Buvette" })).toBeInTheDocument()
  })

  it("asks for confirmation before deleting a role, then deletes it", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ unpublished: true }) })
    const spies = makeSpies()
    render(<Harness spies={spies} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer le poste Bar" }))
    expect(fetchMock).not.toHaveBeenCalled()
    const pending = spies.onRequestDelete.mock.calls[0][0]
    expect(pending.recap.title).toBe("Supprimer le poste « Bar » ?")

    await act(() => pending.run())
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/roles/Bar", { method: "DELETE" })
    expect(spies.onDeletingChange.mock.calls).toEqual([[true], [false]])
    expect(spies.onRoleDeleted).toHaveBeenCalledWith("Bar", true)
    expect(spies.onDeleteError).not.toHaveBeenCalled()
  })

  it("hands a failed deletion's error to the confirmation modal", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Poste introuvable" }) })
    const spies = makeSpies()
    render(<Harness spies={spies} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer le poste Accueil" }))
    await act(() => spies.onRequestDelete.mock.calls[0][0].run())
    expect(spies.onDeleteError).toHaveBeenCalledWith("Poste introuvable")
    expect(spies.onRoleDeleted).not.toHaveBeenCalled()
  })

  it("shows the error when the order cannot be saved, and stays open", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
    const spies = makeSpies()
    render(<Harness spies={spies} />)
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l'ordre" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("L'ordre n'a pas pu être enregistré.")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ roleOrder: ["Bar", "Accueil"] })
    expect(spies.onClose).not.toHaveBeenCalled()
  })

  it("opens one inline editor at a time and returns the focus to its button on Escape", async () => {
    render(<Harness spies={makeSpies()} />)
    const limitButton = screen.getByRole("button", { name: "Limite : aucune, poste « Bar »" })
    fireEvent.click(limitButton)
    expect(limitButton).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(screen.getByRole("button", { name: "Accès : tous, poste « Bar »" }))
    expect(screen.queryByLabelText("Nombre maximal de créneaux « Bar » par personne")).not.toBeInTheDocument()
    const tags = screen.getByLabelText("Étiquettes donnant accès au poste « Bar »")
    fireEvent.keyDown(tags, { key: "Escape" })
    expect(screen.queryByLabelText("Étiquettes donnant accès au poste « Bar »")).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("button", { name: "Accès : tous, poste « Bar »" })).toHaveFocus())
  })

  it("keeps an open inline editor and its typed value while closed and reopened", () => {
    const spies = makeSpies()
    const { rerender } = render(<Harness spies={spies} />)
    fireEvent.click(screen.getByRole("button", { name: "Limite : aucune, poste « Bar »" }))
    fireEvent.change(screen.getByLabelText("Nombre maximal de créneaux « Bar » par personne"), { target: { value: "4" } })
    rerender(<Harness open={false} spies={spies} />)
    rerender(<Harness spies={spies} />)
    expect(screen.getByLabelText("Nombre maximal de créneaux « Bar » par personne")).toHaveValue(4)
  })
})
