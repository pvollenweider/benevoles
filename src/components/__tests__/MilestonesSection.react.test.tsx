/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"
import MilestonesSection, { type MilestoneRow } from "../admin/MilestonesSection"

const MILESTONES: MilestoneRow[] = [
  { id: "m1", title: "Commander les t-shirts", dueDate: "2026-09-01T00:00:00.000Z", done: false, ownerId: null, ownerName: null },
  { id: "m2", title: "Fermer les inscriptions", dueDate: "2026-09-10T00:00:00.000Z", done: false, ownerId: null, ownerName: null },
]
const TEAM = [{ id: "a-sam", name: "Samira Diallo" }, { id: "a-col", name: "Colette Favre" }]

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data }
}

const renderSection = (milestones: MilestoneRow[] = MILESTONES) =>
  render(<MilestonesSection eventId="evt-1" initialMilestones={milestones} team={TEAM} timeZone="Europe/Zurich" />)
const ownerSelect = () => screen.getByRole("combobox", { name: /^Qui s'en occupe/ })
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

  it("deletes with a visible « Supprimer » named with its milestone, not a bare « × » (regression)", () => {
    renderSection()
    const remove = screen.getByRole("button", { name: /^Supprimer ?le jalon « Fermer les inscriptions »$/ })
    expect(remove).toHaveTextContent(/^Supprimer le jalon « Fermer les inscriptions »$/)
    expect(remove).not.toHaveAttribute("aria-label")
    expect(document.body.textContent).not.toContain("×")
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

// #985: an optional owner, among the organisation's active admins.
describe("MilestonesSection — owner", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("offers « Aucun » by default, then the team by name, marked optional", () => {
    renderSection()
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un jalon" }))
    expect(ownerSelect()).toHaveAccessibleName("Qui s'en occupe (facultatif)")
    expect(ownerSelect()).toHaveValue("")
    expect(ownerSelect()).not.toBeRequired()
    expect(within(ownerSelect()).getAllByRole("option").map((o) => o.textContent)).toEqual(["Aucun", "Colette Favre", "Samira Diallo"])
  })

  it("creates a milestone with an owner and shows the owner under its title", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ id: "m3", title: "Louer la tente", dueDate: "2026-09-05T00:00:00.000Z", done: false, ownerId: "a-sam", owner: { id: "a-sam", name: "Samira Diallo" } }))
    vi.stubGlobal("fetch", fetchMock)
    renderSection()
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un jalon" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Titre" }), { target: { value: "Louer la tente" } })
    fireEvent.change(screen.getByLabelText(/^Échéance/), { target: { value: "2026-09-05" } })
    fireEvent.change(ownerSelect(), { target: { value: "a-sam" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))

    await waitFor(() => expect(screen.getByText("Qui s'en occupe : Samira Diallo")).toBeInTheDocument())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "Louer la tente", dueDate: "2026-09-05", ownerId: "a-sam" })
    // The checkbox is still named by the title alone.
    expect(screen.getByRole("checkbox", { name: "Louer la tente" })).toHaveAccessibleDescription("Qui s'en occupe : Samira Diallo")
  })

  it("changes and removes the owner of an existing milestone, sending only that", async () => {
    const withOwner: MilestoneRow[] = [{ ...MILESTONES[0], ownerId: "a-sam", ownerName: "Samira Diallo" }]
    const fetchMock = vi.fn().mockResolvedValue(ok({ ...withOwner[0], ownerId: null, owner: null }))
    vi.stubGlobal("fetch", fetchMock)
    renderSection(withOwner)
    expect(screen.getByText("Qui s'en occupe : Samira Diallo")).toBeInTheDocument()
    fireEvent.click(editButton("Commander les t-shirts"))
    expect(ownerSelect()).toHaveValue("a-sam")
    fireEvent.change(ownerSelect(), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(editButton("Commander les t-shirts")).toHaveFocus())
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ ownerId: null }))
    expect(screen.queryByText(/^Qui s'en occupe :/)).not.toBeInTheDocument()
  })

  it("keeps a deactivated owner as a choice, and does not send it when unchanged", async () => {
    const formerOwner: MilestoneRow[] = [{ ...MILESTONES[0], ownerId: "a-gone", ownerName: "Léa Parti" }]
    const fetchMock = vi.fn().mockResolvedValue(ok({ ...formerOwner[0], title: "Commander les polos", owner: { id: "a-gone", name: "Léa Parti" } }))
    vi.stubGlobal("fetch", fetchMock)
    renderSection(formerOwner)
    expect(screen.getByText("Qui s'en occupe : Léa Parti (compte désactivé)")).toBeInTheDocument()
    fireEvent.click(editButton("Commander les t-shirts"))
    expect(ownerSelect()).toHaveValue("a-gone")
    expect(within(ownerSelect()).getByRole("option", { name: "Léa Parti (compte désactivé)" })).toBeEnabled()
    fireEvent.change(screen.getByRole("textbox", { name: "Titre" }), { target: { value: "Commander les polos" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(editButton("Commander les polos")).toHaveFocus())
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ title: "Commander les polos" }))
  })

  it("puts the server's refusal of the owner on the select", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: "Choisissez qui s'en occupe parmi les membres actifs de l'équipe.", field: "ownerId" }) }))
    renderSection()
    fireEvent.click(editButton("Commander les t-shirts"))
    fireEvent.change(ownerSelect(), { target: { value: "a-col" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Choisissez qui s'en occupe parmi les membres actifs de l'équipe."))
    expect(ownerSelect()).toHaveAttribute("aria-invalid", "true")
    expect(ownerSelect()).toHaveAccessibleDescription("Choisissez qui s'en occupe parmi les membres actifs de l'équipe.")
    expect(ownerSelect()).toHaveFocus()
    expect(screen.getByRole("textbox", { name: "Titre" })).not.toHaveAttribute("aria-invalid")
  })

  it("marks a milestone late from the day after its due day, in the organisation's zone", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    // 23:30 on 1 September in Zurich, the due day of « Commander les t-shirts »: not late yet.
    vi.setSystemTime(new Date("2026-09-01T21:30:00Z"))
    renderSection()
    expect(screen.queryByText("(dépassé)")).not.toBeInTheDocument()
    cleanup()
    // 00:30 on 2 September in Zurich (still 1 September in UTC).
    vi.setSystemTime(new Date("2026-09-01T22:30:00Z"))
    renderSection()
    expect(screen.getAllByText("(dépassé)")).toHaveLength(1)
  })
})
