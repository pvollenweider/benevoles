/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))

import DayOfBoard from "../admin/DayOfBoard"
import type { DayOfBoard as Board, DayOfShift } from "@/lib/day-of"

// « Jour J » (#561).
const bar: DayOfShift = {
  id: "s1", roleName: "Bar", label: "Soir", date: "2026-07-04", startTime: "13:00", endTime: "16:00", capacity: 3,
  contactName: "Paul", contactPhone: "079 000 00 00",
  people: [
    { registrationId: "r1", firstName: "Zoé", lastName: "Müller", phone: "+41 79 123 45 67", checkedInAt: null },
    { registrationId: "r2", firstName: "Léon", lastName: "Favre", phone: null, checkedInAt: "2026-07-04T11:05:00.000Z" },
  ],
}
const accueil: DayOfShift = {
  id: "s2", roleName: "Accueil", label: "Accueil", date: "2026-07-04", startTime: "15:00", endTime: "18:00", capacity: 1,
  contactName: null, contactPhone: null,
  people: [{ registrationId: "r3", firstName: "Anne", lastName: "Roy", phone: null, checkedInAt: null }],
}
const board: Board = {
  inProgress: [{ key: "2026-07-04T13:00", date: "2026-07-04", startTime: "13:00", shifts: [bar] }],
  upcoming: [{ key: "2026-07-04T15:00", date: "2026-07-04", startTime: "15:00", shifts: [accueil] }],
  earlier: [],
  laterCount: 2,
}
const renderBoard = () => render(<DayOfBoard eventId="evt-1" board={board} today="2026-07-04" refreshedAt="14h05" />)

describe("DayOfBoard", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    refresh.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("shows running and coming shifts by start time, with state, missing places and phone links", () => {
    renderBoard()
    expect(screen.getByRole("heading", { level: 3, name: "Depuis 13h" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "À 15h" })).toBeInTheDocument()
    const card = screen.getByRole("heading", { level: 4, name: "Bar, Soir" }).closest("li")!
    expect(card).toHaveTextContent("de 13h à 16h")
    expect(card).toHaveTextContent("1 présent sur 2 attendus. Il manque 1 personne.")
    expect(within(card).getByRole("link", { name: "Appeler Zoé Müller au +41 79 123 45 67" })).toHaveAttribute("href", "tel:+41791234567")
    expect(within(card).getByRole("link", { name: /^Appeler Paul, contact du créneau, au 079 000 00 00$/ })).toHaveAttribute("href", "tel:0790000000")
    expect(screen.getByText("Encore 2 créneaux plus tard aujourd'hui.")).toBeInTheDocument()
    // Name, shift, state, phone: nothing else about the person.
    expect(card.textContent).not.toMatch(/@/)
  })

  it("one tap marks someone present through the bulk route; the button keeps the focus and the outcome is announced", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ done: 1, changedIds: ["r1"], skipped: 0 }) })
    renderBoard()
    const button = screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })
    button.focus()
    fireEvent.click(button)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/events/evt-1/registrations/bulk")
    expect(JSON.parse(init.body)).toEqual({ action: "check_in", registrationIds: ["r1"] })

    const undo = await screen.findByRole("button", { name: "Annuler la présence, Zoé Müller" })
    expect(undo).toBe(button)
    expect(undo).toHaveFocus()
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Présence enregistrée pour Zoé Müller. Bar, Soir : 2 présents sur 2 attendus."))
    expect(screen.getByRole("heading", { level: 4, name: "Bar, Soir" }).closest("li")).toHaveTextContent("2 présents sur 2 attendus.")
  })

  it("undoes a presence with the undo action", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ done: 1, changedIds: ["r2"], skipped: 0 }) })
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Annuler la présence, Léon Favre" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "undo_check_in", registrationIds: ["r2"] })
    expect(await screen.findByRole("button", { name: "Marquer présent, Léon Favre" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Présence annulée pour Léon Favre."))
  })

  it("a refused request says so and leaves the state as it was", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "Boom" }) })
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Présence de Zoé Müller : erreur du serveur/)
    expect(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })).toBeInTheDocument()
  })

  it("nothing changed on the server (marked from another phone): the list is refreshed", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ done: 0, changedIds: [], skipped: 1 }) })
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Rien n'a changé pour Zoé Müller"))
  })

  it("an action, not a toggle: no aria-pressed", () => {
    renderBoard()
    expect(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })).not.toHaveAttribute("aria-pressed")
    expect(screen.getByRole("button", { name: "Annuler la présence, Léon Favre" })).not.toHaveAttribute("aria-pressed")
  })

  it("a failure shows in the person's row, and the same failure again is a new alert", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "Boom" }) })
    renderBoard()
    const button = screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })
    fireEvent.click(button)
    const first = await screen.findByRole("alert")
    expect(button.closest("li")).toContainElement(first)
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByRole("alert")).not.toBe(first))
    expect(screen.getAllByRole("alert")).toHaveLength(1)
  })

  it("« Actualiser » announces the update once the refresh has landed", async () => {
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Liste mise à jour à 14h05."))
  })

  it("nothing changed: no « Liste mise à jour » after its own message, and a removed row hands the focus to its shift", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ done: 0, changedIds: [], skipped: 1 }) })
    const { rerender } = renderBoard()
    // The refresh brings a board where Zoé is no longer confirmed.
    const without: Board = { ...board, inProgress: [{ ...board.inProgress[0], shifts: [{ ...bar, people: bar.people.slice(1) }] }] }
    refresh.mockImplementation(() => rerender(<DayOfBoard eventId="evt-1" board={without} today="2026-07-04" refreshedAt="14h06" />))
    const button = screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })
    button.focus()
    fireEvent.click(button)
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole("button", { name: /Zoé Müller/ })).toBeNull())
    await waitFor(() => expect(screen.getByRole("heading", { level: 4, name: "Bar, Soir" })).toHaveFocus())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByRole("status")).toHaveTextContent("Rien n'a changé pour Zoé Müller")
    expect(screen.getByRole("status")).not.toHaveTextContent("Liste mise à jour")
  })

  it("finished shifts stay as opened by hand once a search is cleared", () => {
    const withEarlier: Board = { ...board, earlier: [{ key: "2026-07-04T08:00", date: "2026-07-04", startTime: "08:00", shifts: [{ ...accueil, id: "s3", startTime: "08:00", endTime: "10:00" }] }] }
    const { container } = render(<DayOfBoard eventId="evt-1" board={withEarlier} today="2026-07-04" refreshedAt="14h05" />)
    const details = container.querySelector("details")!
    expect(details.open).toBe(false)
    details.open = true
    fireEvent(details, new Event("toggle"))
    const search = screen.getByLabelText("Rechercher un bénévole ou un poste")
    fireEvent.change(search, { target: { value: "anne" } })
    fireEvent.change(search, { target: { value: "" } })
    expect(container.querySelector("details")!.open).toBe(true)
  })

  it("search finds a volunteer accent-insensitively, or a shift by its role", async () => {
    renderBoard()
    const search = screen.getByLabelText("Rechercher un bénévole ou un poste")
    fireEvent.change(search, { target: { value: "zoe" } })
    expect(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Léon Favre/ })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Accueil" })).toBeNull()
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 créneau, 1 personne affichée."), { timeout: 2000 })

    fireEvent.change(search, { target: { value: "accueil" } })
    expect(screen.getByRole("heading", { level: 4, name: "Accueil" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { level: 4, name: "Bar, Soir" })).toBeNull()

    fireEvent.change(search, { target: { value: "xyz" } })
    expect(screen.getByText("Aucun bénévole ni poste ne correspond à « xyz ».")).toBeInTheDocument()
  })
})
