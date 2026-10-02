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

/**
 * Holds the shifts and the edited order like ShiftsManager does, and shows them for the assertions.
 * `frozenRoles`: the order ignores updates, so a renamed role's row is never rendered under its new name.
 */
function Harness({ open = true, spies, frozenRoles = false }: { open?: boolean; spies: Spies; frozenRoles?: boolean }) {
  const [shifts, setShifts] = useState(initialShifts)
  const [roles, setRoles] = useState(["Bar", "Accueil"])
  return (
    <>
      <RoleManagerPanel open={open} panelId="roles-panel" eventId="evt-1" shifts={shifts} setShifts={setShifts} roles={roles} setRoles={frozenRoles ? () => {} : setRoles} {...spies} />
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

  it("renames a role in the shifts and in the order, announces it in words and focuses its « Renommer »", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    const spies = makeSpies()
    render(<Harness spies={spies} />)
    fireEvent.click(screen.getByRole("button", { name: "Renommer le poste Bar" }))
    const input = screen.getByLabelText("Nouveau nom du poste « Bar »")
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: "Buvette" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(spies.onAnnounce).toHaveBeenCalledWith("Poste « Bar » renommé en « Buvette »."))
    expect(spies.onAnnounce).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/events/evt-1/roles/Bar")
    expect(JSON.parse(init.body)).toEqual({ name: "Buvette" })
    expect(screen.getByTestId("roles")).toHaveTextContent("Buvette,Accueil")
    expect(screen.getByTestId("shift-roles")).toHaveTextContent("Buvette,Accueil")
    // The row remounted under its new key: focus is on its « Renommer », not on <body>.
    await waitFor(() => expect(screen.getByRole("button", { name: "Renommer le poste Buvette" })).toHaveFocus())
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

  // ── Focus and announcements (#554) ──────────────────────────────────────────

  const renameButton = (role: string) => screen.getByRole("button", { name: `Renommer le poste ${role}` })
  const renameInput = () => screen.getByLabelText("Nouveau nom du poste « Bar »")
  const spokenAlerts = () => screen.queryAllByRole("alert").filter((e) => e.textContent?.trim())

  it("« Annuler » returns the focus to « Renommer »", async () => {
    render(<Harness spies={makeSpies()} />)
    fireEvent.click(renameButton("Bar"))
    const cancel = screen.getByRole("button", { name: "Annuler" })
    expect(cancel).toHaveAttribute("type", "button")
    cancel.focus()
    fireEvent.click(cancel)
    expect(screen.queryByLabelText("Nouveau nom du poste « Bar »")).not.toBeInTheDocument()
    await waitFor(() => expect(renameButton("Bar")).toHaveFocus())
  })

  it("Escape in the input cancels and returns the focus to « Renommer »", async () => {
    render(<Harness spies={makeSpies()} />)
    fireEvent.click(renameButton("Bar"))
    fireEvent.keyDown(renameInput(), { key: "Escape" })
    expect(screen.queryByLabelText("Nouveau nom du poste « Bar »")).not.toBeInTheDocument()
    await waitFor(() => expect(renameButton("Bar")).toHaveFocus())
  })

  it("an unchanged name sends nothing and returns the focus to « Renommer »", async () => {
    const spies = makeSpies()
    render(<Harness spies={spies} />)
    fireEvent.click(renameButton("Bar"))
    fireEvent.change(renameInput(), { target: { value: "  Bar " } })
    fireEvent.keyDown(renameInput(), { key: "Enter" })
    await waitFor(() => expect(renameButton("Bar")).toHaveFocus())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(spies.onAnnounce).not.toHaveBeenCalled()
  })

  it("when the renamed row is not rendered, focus falls back to the panel's heading", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    render(<Harness spies={makeSpies()} frozenRoles />)
    fireEvent.click(renameButton("Bar"))
    fireEvent.change(renameInput(), { target: { value: "Buvette" } })
    fireEvent.keyDown(renameInput(), { key: "Enter" })
    await waitFor(() => expect(screen.getByRole("heading", { name: "Gérer les postes" })).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
  })

  it("a rename error after Enter is one alert under the input, which keeps focus", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Ce poste existe déjà." }) })
    const spies = makeSpies()
    render(<Harness spies={spies} />)
    fireEvent.click(renameButton("Bar"))
    expect(renameInput()).toHaveFocus()
    fireEvent.change(renameInput(), { target: { value: "Accueil" } })
    fireEvent.keyDown(renameInput(), { key: "Enter" })

    await waitFor(() => expect(spokenAlerts()).toHaveLength(1))
    expect(spokenAlerts()[0]).toHaveTextContent("Ce poste existe déjà.")
    expect(renameInput()).toHaveFocus()
    expect(renameInput()).toHaveAttribute("aria-invalid", "true")
    expect(renameInput()).toHaveAccessibleDescription("Ce poste existe déjà.")
    expect(spies.onAnnounce).not.toHaveBeenCalled()

    // Typing clears it.
    fireEvent.change(renameInput(), { target: { value: "Accueil 2" } })
    expect(renameInput()).not.toHaveAttribute("aria-invalid")
    expect(spokenAlerts()).toHaveLength(0)
  })

  it("a rename error after clicking « Valider » is not an alert: focus moves to the input, which it describes", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Ce poste existe déjà." }) })
    const spies = makeSpies()
    render(<Harness spies={spies} />)
    fireEvent.click(renameButton("Bar"))
    fireEvent.change(renameInput(), { target: { value: "Accueil" } })
    const validate = screen.getByRole("button", { name: "Valider" })
    validate.focus()
    fireEvent.click(validate)

    await waitFor(() => expect(renameInput()).toHaveFocus())
    expect(renameInput()).toHaveAttribute("aria-invalid", "true")
    expect(renameInput()).toHaveAccessibleDescription("Ce poste existe déjà.")
    expect(screen.getByText("Ce poste existe déjà.")).not.toHaveAttribute("role")
    expect(spokenAlerts()).toHaveLength(0)
    expect(spies.onAnnounce).not.toHaveBeenCalled()
  })

  it("« Valider » keeps focus while the rename is sent (aria-disabled, not disabled) and sends it once", async () => {
    let resolve!: (v: unknown) => void
    fetchMock.mockReturnValue(new Promise((r) => { resolve = r }))
    render(<Harness spies={makeSpies()} />)
    fireEvent.click(renameButton("Bar"))
    fireEvent.change(renameInput(), { target: { value: "Buvette" } })
    const validate = screen.getByRole("button", { name: "Valider" })
    validate.focus()
    fireEvent.click(validate)

    const busy = screen.getByRole("button", { name: "…" })
    expect(busy).toHaveAttribute("aria-disabled", "true")
    expect(busy).not.toBeDisabled()
    expect(busy).toHaveFocus()
    fireEvent.click(busy)
    fireEvent.keyDown(renameInput(), { key: "Enter" })
    expect(fetchMock).toHaveBeenCalledOnce()

    await act(async () => resolve({ ok: true, json: async () => ({}) }))
    await waitFor(() => expect(renameButton("Buvette")).toHaveFocus())
  })

  it("« aria-controls » is set only while the controlled editor is shown, and then resolves", () => {
    const { container } = render(<Harness spies={makeSpies()} />)
    expect(container.querySelector("#roles-panel")).toContainElement(screen.getByRole("heading", { name: "Gérer les postes" }))
    const color = screen.getByRole("button", { name: "Changer la couleur du poste Bar" })
    const limit = screen.getByRole("button", { name: "Limite : aucune, poste « Bar »" })
    const access = screen.getByRole("button", { name: "Accès : tous, poste « Bar »" })
    for (const b of [color, limit, access]) expect(b).not.toHaveAttribute("aria-controls")

    for (const [button, label] of [[color, "Couleur du poste « Bar »"], [limit, "Nombre maximal de créneaux « Bar » par personne"], [access, "Étiquettes donnant accès au poste « Bar »"]] as const) {
      fireEvent.click(button)
      expect(button).toHaveAttribute("aria-expanded", "true")
      const controlled = document.getElementById(button.getAttribute("aria-controls") ?? "")
      expect(controlled).not.toBeNull()
      expect(controlled).toContainElement(button === color ? screen.getByRole("group", { name: label }) : screen.getByLabelText(label))
    }
    // Opening « Accès » closed the others: their aria-controls are gone.
    expect(color).not.toHaveAttribute("aria-controls")
    expect(limit).not.toHaveAttribute("aria-controls")
    for (const el of container.querySelectorAll("[aria-controls]")) {
      expect(document.getElementById(el.getAttribute("aria-controls")!)).not.toBeNull()
    }
  })

  it("closing « Limite » with « Annuler » returns the focus to its button", async () => {
    render(<Harness spies={makeSpies()} />)
    fireEvent.click(screen.getByRole("button", { name: "Limite : aucune, poste « Bar »" }))
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Limite : aucune, poste « Bar »" })).toHaveFocus())
  })

  it("after a colour is picked, focus is back on the role's colour button and the colour is announced once", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    const spies = makeSpies()
    render(<Harness spies={spies} />)
    const color = screen.getByRole("button", { name: "Changer la couleur du poste Bar" })
    fireEvent.click(color)
    const pink = screen.getByRole("button", { name: "Rose" })
    pink.focus()
    fireEvent.click(pink)

    await waitFor(() => expect(color).toHaveFocus())
    expect(screen.queryByRole("group", { name: "Couleur du poste « Bar »" })).not.toBeInTheDocument()
    expect(spies.onAnnounce).toHaveBeenCalledOnce()
    expect(spies.onAnnounce).toHaveBeenCalledWith("Couleur du poste « Bar » : Rose.")
  })

  it("a failed colour keeps the picker open, focus on the swatch, and says the error once", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Poste introuvable" }) })
    const spies = makeSpies()
    render(<Harness spies={spies} />)
    fireEvent.click(screen.getByRole("button", { name: "Changer la couleur du poste Bar" }))
    const pink = screen.getByRole("button", { name: "Rose" })
    pink.focus()
    fireEvent.click(pink)

    await waitFor(() => expect(spokenAlerts()).toHaveLength(1))
    expect(spokenAlerts()[0]).toHaveTextContent("Poste introuvable")
    expect(screen.getByRole("group", { name: "Couleur du poste « Bar »" })).toBeInTheDocument()
    expect(pink).toHaveFocus()
    expect(spies.onAnnounce).not.toHaveBeenCalled()
  })

  it("Escape in the colour picker closes it and returns the focus to the colour button", async () => {
    render(<Harness spies={makeSpies()} />)
    const color = screen.getByRole("button", { name: "Changer la couleur du poste Bar" })
    fireEvent.click(color)
    fireEvent.keyDown(screen.getByRole("button", { name: "Rose" }), { key: "Escape" })
    expect(screen.queryByRole("group", { name: "Couleur du poste « Bar »" })).not.toBeInTheDocument()
    await waitFor(() => expect(color).toHaveFocus())
  })
})
