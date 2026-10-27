/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within, act } from "@testing-library/react"

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
const jsonOk = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const renderBoard = () => render(<DayOfBoard eventId="evt-1" board={board} today="2026-07-04" refreshedAt="14h05" />)

describe("DayOfBoard", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
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
    fetchMock.mockImplementation(async (url: string) => url.endsWith("/bulk")
      ? jsonOk({ done: 0, changedIds: [], skipped: 1 })
      : jsonOk({ board, today: "2026-07-04", refreshedAt: "14h06" }))
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/day-of", expect.anything()))
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

  it("« Actualiser » reads the board route and announces the update once it has landed", async () => {
    fetchMock.mockResolvedValue(jsonOk({ board, today: "2026-07-04", refreshedAt: "14h07" }))
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/day-of", expect.anything()))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Liste mise à jour à 14h07."))
    expect(screen.getByText("Mis à jour à 14h07.")).toBeInTheDocument()
  })

  it("with a « Secteur » filter, every read of the board keeps it (#1170)", async () => {
    fetchMock.mockResolvedValue(jsonOk({ board, today: "2026-07-04", refreshedAt: "14h07" }))
    render(<DayOfBoard eventId="evt-1" board={board} today="2026-07-04" refreshedAt="14h05" sector="sec-park" />)
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/day-of?secteur=sec-park", expect.anything()))
  })

  it("« Actualiser » that fails says so at once and keeps the old time visible, never a fake success", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("La liste n'a pas pu être mise à jour. Elle date de 14h05."))
    expect(screen.getByText("La mise à jour n'a pas abouti : liste de 14h05. Nouvel essai automatique.")).toBeInTheDocument()
    expect(screen.queryByText("Mis à jour à 14h05.")).toBeNull()
  })

  it("nothing changed: no « Liste mise à jour » after its own message, and a removed row hands the focus to its shift", async () => {
    // The read brings a board where Zoé is no longer confirmed.
    const without: Board = { ...board, inProgress: [{ ...board.inProgress[0], shifts: [{ ...bar, people: bar.people.slice(1) }] }] }
    fetchMock.mockImplementation(async (url: string) => url.endsWith("/bulk")
      ? jsonOk({ done: 0, changedIds: [], skipped: 1 })
      : jsonOk({ board: without, today: "2026-07-04", refreshedAt: "14h06" }))
    renderBoard()
    const button = screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })
    button.focus()
    fireEvent.click(button)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/day-of", expect.anything()))
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

  describe("refreshes itself while open (#1141)", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())
    const dayOfCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/day-of"))
    const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(50) })
    const marked: Board = { ...board, inProgress: [{ ...board.inProgress[0], shifts: [{ ...bar, people: [{ ...bar.people[0], checkedInAt: "2026-07-04T12:00:00.000Z" }, bar.people[1]] }] }] }

    it("polls every 25 s; a check-in made elsewhere appears, the search and focus stay, and the change is said once", async () => {
      fetchMock.mockResolvedValue(jsonOk({ board: marked, today: "2026-07-04", refreshedAt: "14h06" }))
      renderBoard()
      const search = screen.getByLabelText("Rechercher un bénévole ou un poste")
      fireEvent.change(search, { target: { value: "bar" } })
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000) }) // search count said, typing over
      const undo = screen.getByRole("button", { name: "Annuler la présence, Léon Favre" })
      undo.focus()
      expect(dayOfCalls()).toHaveLength(0)
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
      await flush()
      expect(dayOfCalls()).toHaveLength(1)
      expect(screen.getByRole("button", { name: "Annuler la présence, Zoé Müller" })).toBeInTheDocument()
      expect(search).toHaveValue("bar")
      expect(undo).toHaveFocus()
      expect(screen.getByText("Mis à jour à 14h06.")).toBeInTheDocument()
      expect(screen.getByRole("status")).toHaveTextContent("Liste mise à jour : 1 personne marquée présente.")
    })

    it("a poll that changes nothing says nothing", async () => {
      fetchMock.mockResolvedValue(jsonOk({ board, today: "2026-07-04", refreshedAt: "14h05" }))
      renderBoard()
      await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
      await flush()
      expect(dayOfCalls()).toHaveLength(1)
      expect(screen.getByRole("status")).toHaveTextContent("")
      // The background read never touches the « Actualiser » button.
      expect(screen.getByRole("button", { name: "Actualiser" })).not.toHaveAttribute("aria-disabled")
    })

    it("does not poll while the page is hidden, and reads at once when it comes back", async () => {
      fetchMock.mockResolvedValue(jsonOk({ board, today: "2026-07-04", refreshedAt: "14h09" }))
      let state = "hidden"
      vi.spyOn(document, "visibilityState", "get").mockImplementation(() => state as DocumentVisibilityState)
      renderBoard()
      act(() => { document.dispatchEvent(new Event("visibilitychange")) })
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
      expect(dayOfCalls()).toHaveLength(0)
      state = "visible"
      act(() => { document.dispatchEvent(new Event("visibilitychange")) })
      await flush()
      expect(dayOfCalls()).toHaveLength(1)
      expect(screen.getByText("Mis à jour à 14h09.")).toBeInTheDocument()
    })

    it("offline: says it once, shows the age of the list, and reads again when the network is back", async () => {
      fetchMock.mockResolvedValue(jsonOk({ board, today: "2026-07-04", refreshedAt: "14h12" }))
      renderBoard()
      act(() => { window.dispatchEvent(new Event("offline")) })
      await flush()
      expect(screen.getByText(/^Pas de connexion : liste de 14h05\./)).toBeInTheDocument()
      expect(screen.getByRole("status")).toHaveTextContent("Connexion perdue. La liste affichée date de 14h05.")
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
      expect(dayOfCalls()).toHaveLength(0)
      act(() => { window.dispatchEvent(new Event("online")) })
      await flush()
      expect(dayOfCalls()).toHaveLength(1)
      expect(screen.getByText("Mis à jour à 14h12.")).toBeInTheDocument()
      expect(screen.getByRole("status")).toHaveTextContent("Connexion rétablie. Liste mise à jour à 14h12.")
    })

    it("one failed poll stays quiet; the second in a row shows and says the list is old", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) })
      renderBoard()
      await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
      await flush()
      expect(dayOfCalls()).toHaveLength(1)
      expect(screen.getByText("Mis à jour à 14h05.")).toBeInTheDocument()
      await act(async () => { await vi.advanceTimersByTimeAsync(50_000) }) // backoff doubles
      await flush()
      expect(dayOfCalls()).toHaveLength(2)
      expect(screen.getByText(/La mise à jour n'a pas abouti/)).toBeInTheDocument()
      expect(screen.getByRole("status")).toHaveTextContent("La liste n'a pas pu être mise à jour. Elle date de 14h05.")
    })

    it("a poll sent before a check-in's answer does not undo it on screen", async () => {
      let answerPoll: (v: unknown) => void = () => {}
      fetchMock.mockImplementation((url: string) => url.endsWith("/bulk")
        ? Promise.resolve(jsonOk({ done: 1, changedIds: ["r1"], skipped: 0 }))
        : new Promise((resolve) => { answerPoll = resolve }))
      renderBoard()
      await act(async () => { await vi.advanceTimersByTimeAsync(25_000) }) // poll sent, not answered
      fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" }))
      await flush()
      expect(screen.getByRole("button", { name: "Annuler la présence, Zoé Müller" })).toBeInTheDocument()
      // The stale poll answers with Zoé not yet present.
      await act(async () => { answerPoll(jsonOk({ board, today: "2026-07-04", refreshedAt: "14h06" })); await vi.advanceTimersByTimeAsync(50) })
      expect(screen.getByRole("button", { name: "Annuler la présence, Zoé Müller" })).toBeInTheDocument()
      expect(screen.getByRole("status")).not.toHaveTextContent("présence annulée")
    })

    it("a poll answering while an action is in flight is not applied (the row stays), then read again", async () => {
      let answerBulk: (v: unknown) => void = () => {}
      const without: Board = { ...board, inProgress: [{ ...board.inProgress[0], shifts: [{ ...bar, people: bar.people.slice(1) }] }] }
      fetchMock.mockImplementation((url: string) => url.endsWith("/bulk")
        ? new Promise((resolve) => { answerBulk = resolve })
        : Promise.resolve(jsonOk({ board: without, today: "2026-07-04", refreshedAt: "14h06" })))
      renderBoard()
      fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" }))
      await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
      await flush()
      expect(dayOfCalls()).toHaveLength(1)
      // Zoé's row is still there for the action's outcome.
      expect(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })).toBeInTheDocument()
      await act(async () => { answerBulk(jsonOk({ done: 1, changedIds: ["r1"], skipped: 0 })); await vi.advanceTimersByTimeAsync(50) })
      // Read again once the action settled: now the board applies.
      await flush()
      expect(dayOfCalls()).toHaveLength(2)
      expect(screen.queryByRole("button", { name: /Zoé Müller/ })).toBeNull()
    })

    it("a failed undo keeps the check-in made just before, not yet seen by a poll", async () => {
      fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
        if (!url.endsWith("/bulk")) return jsonOk({ board, today: "2026-07-04", refreshedAt: "14h06" })
        return JSON.parse(String(init.body)).action === "check_in"
          ? jsonOk({ done: 1, changedIds: ["r1"], skipped: 0 })
          : { ok: false, status: 500, json: async () => ({ error: "Boom" }) }
      })
      renderBoard()
      fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" }))
      await flush()
      fireEvent.click(screen.getByRole("button", { name: "Annuler la présence, Zoé Müller" }))
      await flush()
      expect(screen.getByRole("alert")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Annuler la présence, Zoé Müller" })).toBeInTheDocument()
    })

    it("a card that moves section keeps the focus: on the person's button, or on the shift title", async () => {
      const moved: Board = { ...board, inProgress: [], upcoming: [{ ...board.inProgress[0] }, ...board.upcoming] }
      fetchMock.mockResolvedValue(jsonOk({ board: moved, today: "2026-07-04", refreshedAt: "14h06" }))
      renderBoard()
      screen.getByRole("button", { name: "Annuler la présence, Léon Favre" }).focus()
      await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
      await flush()
      expect(screen.getByRole("button", { name: "Annuler la présence, Léon Favre" })).toHaveFocus()

      fetchMock.mockResolvedValue(jsonOk({ board, today: "2026-07-04", refreshedAt: "14h07" }))
      screen.getByRole("heading", { level: 4, name: "Bar, Soir" }).focus()
      await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
      await flush()
      expect(screen.getByText("Mis à jour à 14h07.")).toBeInTheDocument()
      expect(screen.getByRole("heading", { level: 4, name: "Bar, Soir" })).toHaveFocus()
    })

    it("a network drop after the session expired keeps the expiry message, said once", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
      renderBoard()
      await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
      await flush()
      act(() => { window.dispatchEvent(new Event("offline")) })
      act(() => { window.dispatchEvent(new Event("online")) })
      await flush()
      expect(screen.getAllByText("Votre session a expiré : rechargez la page pour vous reconnecter.")).toHaveLength(2)
      expect(dayOfCalls()).toHaveLength(1)
    })

    it("an expired session stops polling and says how to get back", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
      renderBoard()
      await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
      await flush()
      // Shown, and said once through the status region.
      expect(screen.getAllByText("Votre session a expiré : rechargez la page pour vous reconnecter.")).toHaveLength(2)
      expect(screen.getByRole("status")).toHaveTextContent("Votre session a expiré")
      await act(async () => { await vi.advanceTimersByTimeAsync(600_000) })
      expect(dayOfCalls()).toHaveLength(1)
    })
  })
})
