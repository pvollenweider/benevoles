/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import ShiftRecurrenceForm from "../admin/ShiftRecurrenceForm"

// « Répéter un créneau chaque semaine » (#866): the preview shows the dates the API will create.

const fetchMock = vi.fn()

describe("ShiftRecurrenceForm", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const setup = () => {
    const onCreated = vi.fn()
    const onClose = vi.fn()
    render(<ShiftRecurrenceForm eventId="evt-1" eventStart="2026-12-01" eventEnd="2026-12-31" defaultHolidays="CH" existingShifts={[]} onCreated={onCreated} onClose={onClose} />)
    return { onCreated, onClose }
  }

  const fill = () => {
    fireEvent.change(screen.getByRole("combobox", { name: "Poste" }), { target: { value: "Accueil" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "vendredi" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Début" }), { target: { value: "14:00" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Fin" }), { target: { value: "17:00" } })
  }

  it("focuses its heading and previews the dates, holidays left out with their reason", () => {
    setup()
    expect(screen.getByRole("heading", { name: "Répéter un créneau chaque semaine" })).toHaveFocus()
    expect(screen.getByText(/Renseignez le poste/)).toBeInTheDocument()
    fill()
    expect(screen.getByText(/Aperçu : chaque vendredi de 14:00 à 17:00, 3 dates, 3 créneaux, 2 personnes par créneau, 1 date exclue\./)).toBeInTheDocument()
    expect(screen.getByText(/jour férié \(Noël\)/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Créer 3 créneaux" })).toBeInTheDocument()
  })

  it("adds and removes a closure, which leaves its date out", () => {
    setup()
    fill()
    fireEvent.change(screen.getByLabelText(/Fermetures/), { target: { value: "2026-12-04" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter la date" }))
    expect(screen.getByText(/2 dates, 2 créneaux/)).toBeInTheDocument()
    expect(screen.getByText(/: fermeture/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Retirer la fermeture/ }))
    expect(screen.getByText(/3 dates, 3 créneaux/)).toBeInTheDocument()
  })

  it("moves focus to the first missing field instead of posting", () => {
    setup()
    fireEvent.change(screen.getByRole("combobox", { name: "Poste" }), { target: { value: "Accueil" } })
    fireEvent.click(screen.getByRole("button", { name: "Créer les créneaux" }))
    expect(screen.getByRole("checkbox", { name: "lundi" })).toHaveFocus()
    expect(screen.getByText("Choisissez au moins un jour de la semaine.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("posts the rule and hands the created shifts back", async () => {
    const { onCreated } = setup()
    fill()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ recurrenceId: "r1", rule: { id: "r1" }, shifts: [{ id: "s1", date: "2026-12-11T00:00:00.000Z", startTime: "14:00", endTime: "17:00", roleName: "Accueil", label: "Accueil", capacity: 2, displayOrder: 0, status: "open" }] }), { status: 201 }))
    fireEvent.click(screen.getByRole("button", { name: "Créer 3 créneaux" }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ eventId: "evt-1", roleName: "Accueil", from: "2026-12-01", until: "2026-12-31", weekdays: [5], everyWeeks: 1, slotMinutes: 180, holidays: "CH", closures: [] })
    expect(onCreated.mock.calls[0][0][0]).toMatchObject({ id: "s1", date: "2026-12-11", registrationCount: 0 })
    expect(onCreated.mock.calls[0][1]).toEqual({ id: "r1" })
  })

  it("does not stay silent when the rule can't be created: alert and focus on the field", () => {
    setup()
    fill()
    fireEvent.change(screen.getByLabelText(/^Au/), { target: { value: "2026-12-02" } })
    fireEvent.change(screen.getByLabelText(/^Du/), { target: { value: "2026-12-20" } })
    fireEvent.click(screen.getByRole("button", { name: "Créer les créneaux" }))
    expect(screen.getByRole("alert")).toHaveTextContent("La date de fin est avant la date de début.")
    expect(screen.getByLabelText(/^Au/)).toHaveFocus()
    expect(screen.getByLabelText(/^Au/)).toHaveAttribute("aria-invalid", "true")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("requires at least one person per shift", () => {
    setup()
    fill()
    const capacity = screen.getByLabelText(/Personnes par créneau/)
    fireEvent.change(capacity, { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: /Créer/ }))
    expect(capacity).toHaveFocus()
    expect(capacity).toHaveAccessibleDescription("Indiquez au moins une personne par créneau.")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("announces closures added, removed or already listed", () => {
    setup()
    fill()
    const closure = screen.getByLabelText(/Fermetures/)
    fireEvent.change(closure, { target: { value: "2026-12-04" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter la date" }))
    expect(screen.getByText("Fermeture du vendredi 4 décembre 2026 ajoutée.")).toBeInTheDocument()
    fireEvent.change(closure, { target: { value: "2026-12-04" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter la date" }))
    expect(screen.getByText("La fermeture du vendredi 4 décembre 2026 est déjà dans la liste.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Retirer la fermeture/ }))
    expect(screen.getByText("Fermeture du vendredi 4 décembre 2026 retirée.")).toBeInTheDocument()
  })

  it("names the time format in a lasting hint and the weekday error on each box", () => {
    setup()
    expect(screen.getByRole("textbox", { name: "Début" })).toHaveAccessibleDescription(/Format HH:MM, par exemple 14:00\./)
    fireEvent.change(screen.getByRole("combobox", { name: "Poste" }), { target: { value: "Accueil" } })
    fireEvent.click(screen.getByRole("button", { name: "Créer les créneaux" }))
    expect(screen.getByRole("checkbox", { name: "mardi" })).toHaveAccessibleDescription("Choisissez au moins un jour de la semaine.")
    expect(screen.getByRole("checkbox", { name: "mardi" })).toHaveAttribute("aria-invalid", "true")
  })
})
