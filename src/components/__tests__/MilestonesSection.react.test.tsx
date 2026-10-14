/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"
import MilestonesSection, { type MilestoneRow } from "../admin/MilestonesSection"

const MILESTONES: MilestoneRow[] = [
  { id: "m1", title: "Commander les t-shirts", dueDate: "2026-09-01T00:00:00.000Z", done: false },
  { id: "m2", title: "Fermer les inscriptions", dueDate: "2026-09-10T00:00:00.000Z", done: false },
]

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data }
}

const renderSection = () => render(<MilestonesSection eventId="evt-1" initialMilestones={MILESTONES} />)
// jsdom drops the space before the sr-only span; browsers keep it.
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const editButton = (title: string) => screen.getByRole("button", { name: new RegExp(`^Modifier ?le jalon « ${escape(title)} »$`) })
const rowTitles = () => screen.getAllByRole("listitem").map((li) => li.textContent)

// #989: a milestone's title and due date are edited in place.
describe("MilestonesSection — edit a milestone", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("names each « Modifier » with its milestone and opens a prefilled form with the focus on the title", () => {
    renderSection()
    expect(editButton("Fermer les inscriptions")).toHaveTextContent(/^Modifier le jalon « Fermer les inscriptions »$/)
    fireEvent.click(editButton("Fermer les inscriptions"))
    const form = screen.getByRole("form", { name: "Modifier le jalon « Fermer les inscriptions »" })
    const title = within(form).getByRole("textbox", { name: "Titre" })
    expect(title).toHaveValue("Fermer les inscriptions")
    expect(title).toHaveFocus()
    expect(title).toBeRequired()
    expect(within(form).getByLabelText(/^Échéance/)).toHaveValue("2026-09-10")
  })

  it("sends only the changed fields, keeps the list sorted and gives the focus back to « Modifier »", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ id: "m2", title: "Fermer les inscriptions", dueDate: "2026-08-25T00:00:00.000Z", done: false }))
    vi.stubGlobal("fetch", fetchMock)
    renderSection()
    fireEvent.click(editButton("Fermer les inscriptions"))
    fireEvent.change(screen.getByLabelText(/^Échéance/), { target: { value: "2026-08-25" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))

    await waitFor(() => expect(editButton("Fermer les inscriptions")).toHaveFocus())
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/milestones/m2", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ dueDate: "2026-08-25" }),
    }))
    expect(rowTitles()[0]).toMatch(/^Fermer les inscriptions/)
    expect(rowTitles()[1]).toMatch(/^Commander les t-shirts/)
  })

  it("checks the fields like the creation form", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    renderSection()
    fireEvent.click(editButton("Commander les t-shirts"))
    const title = screen.getByRole("textbox", { name: "Titre" })
    fireEvent.change(title, { target: { value: "  " } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Indiquez le titre du jalon.")
    expect(title).toHaveAttribute("aria-invalid", "true")
    expect(title).toHaveFocus()

    fireEvent.change(title, { target: { value: "Commander les t-shirts" } })
    const date = screen.getByLabelText(/^Échéance/)
    fireEvent.change(date, { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Indiquez l'échéance.")
    expect(date).toHaveAttribute("aria-invalid", "true")
    expect(date).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows the server's error in the form and keeps it open", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Le titre est trop long." }) }))
    renderSection()
    fireEvent.click(editButton("Commander les t-shirts"))
    fireEvent.change(screen.getByRole("textbox", { name: "Titre" }), { target: { value: "Autre titre" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Le titre est trop long."))
    expect(screen.getByRole("textbox", { name: "Titre" })).toHaveFocus()
  })

  it("cancels with « Annuler » or Escape, without a request, and gives the focus back to « Modifier »", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    renderSection()
    fireEvent.click(editButton("Commander les t-shirts"))
    fireEvent.change(screen.getByRole("textbox", { name: "Titre" }), { target: { value: "Brouillon" } })
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(editButton("Commander les t-shirts")).toHaveFocus()

    fireEvent.click(editButton("Commander les t-shirts"))
    expect(screen.getByRole("textbox", { name: "Titre" })).toHaveValue("Commander les t-shirts")
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Titre" }), { key: "Escape" })
    expect(screen.queryByRole("form")).not.toBeInTheDocument()
    expect(editButton("Commander les t-shirts")).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not close while saving, neither with Escape nor « Annuler »", async () => {
    let answer: (value: unknown) => void = () => {}
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise((resolve) => { answer = resolve })))
    renderSection()
    fireEvent.click(editButton("Commander les t-shirts"))
    fireEvent.change(screen.getByRole("textbox", { name: "Titre" }), { target: { value: "Commander les polos" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrement…" })).toHaveAttribute("aria-disabled", "true"))
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Titre" }), { key: "Escape" })
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.getByRole("form")).toBeInTheDocument()

    answer(ok({ id: "m1", title: "Commander les polos", dueDate: "2026-09-01T00:00:00.000Z", done: false }))
    await waitFor(() => expect(editButton("Commander les polos")).toHaveFocus())
  })

  it("closes the add form when a milestone is edited, and leaves the focus in the edit form", () => {
    renderSection()
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un jalon" }))
    expect(screen.getByRole("form", { name: "Nouveau jalon" })).toBeInTheDocument()
    fireEvent.click(editButton("Fermer les inscriptions"))
    expect(screen.queryByRole("form", { name: "Nouveau jalon" })).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Titre" })).toHaveValue("Fermer les inscriptions")
    expect(screen.getByRole("textbox", { name: "Titre" })).toHaveFocus()
  })

  it("cancels the add form with Escape and gives the focus back to its button", () => {
    renderSection()
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un jalon" }))
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Titre" }), { key: "Escape" })
    expect(screen.queryByRole("form")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "+ Ajouter un jalon" })).toHaveFocus()
  })
})
