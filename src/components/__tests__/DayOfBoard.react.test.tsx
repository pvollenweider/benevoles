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
const renderBoard = () => render(
  <DayOfBoard
    eventId="evt-1"
    board={board}
    today="2026-07-04"
    refreshedAt="14h05"
    timeZone="Europe/Zurich"
    registrationWindow={{ publicStatus: "published", registrationsOpen: true }}
    roles={["Bar", "Accueil"]}
  />,
)

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
    expect(JSON.parse(init.body)).toEqual({ action: "check_in", registrationIds: ["r1"], observedShifts: { r1: "s1" } })

    const undo = await screen.findByRole("button", { name: "Annuler la présence, Zoé Müller" })
    expect(undo).toBe(button)
    expect(undo).toHaveFocus()
    await waitFor(() => expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("Présence enregistrée pour Zoé Müller. Bar, Soir : 2 présents sur 2 attendus."))
    expect(screen.getByRole("heading", { level: 4, name: "Bar, Soir" }).closest("li")).toHaveTextContent("2 présents sur 2 attendus.")
  })

  it("undoes a presence with the undo action", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ done: 1, changedIds: ["r2"], skipped: 0 }) })
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Annuler la présence, Léon Favre" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "undo_check_in", registrationIds: ["r2"], observedShifts: { r2: "s1" } })
    expect(await screen.findByRole("button", { name: "Marquer présent, Léon Favre" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("Présence annulée pour Léon Favre."))
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
    await waitFor(() => expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("Rien n'a changé pour Zoé Müller"))
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
    await waitFor(() => expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("Liste mise à jour à 14h07."))
    expect(screen.getByText("Mis à jour à 14h07.")).toBeInTheDocument()
  })

  it("with a « Secteur » filter, every read of the board keeps it (#1170)", async () => {
    fetchMock.mockResolvedValue(jsonOk({ board, today: "2026-07-04", refreshedAt: "14h07" }))
    render(<DayOfBoard eventId="evt-1" board={board} today="2026-07-04" refreshedAt="14h05" sector="sec-park" timeZone="Europe/Zurich" registrationWindow={{ publicStatus: "published", registrationsOpen: true }} />)
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/day-of?secteur=sec-park", expect.anything()))
  })

  it("« Actualiser » that fails says so at once and keeps the old time visible, never a fake success", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }))
    await waitFor(() => expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("La liste n'a pas pu être mise à jour. Elle date de 14h05."))
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
    expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("Rien n'a changé pour Zoé Müller")
    expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).not.toHaveTextContent("Liste mise à jour")
  })

  it("finished shifts stay as opened by hand once a search is cleared", () => {
    const withEarlier: Board = { ...board, earlier: [{ key: "2026-07-04T08:00", date: "2026-07-04", startTime: "08:00", shifts: [{ ...accueil, id: "s3", startTime: "08:00", endTime: "10:00" }] }] }
    const { container } = render(<DayOfBoard eventId="evt-1" board={withEarlier} today="2026-07-04" refreshedAt="14h05" timeZone="Europe/Zurich" registrationWindow={{ publicStatus: "published", registrationsOpen: true }} />)
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
    await waitFor(() => expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("1 créneau, 1 personne affichée."), { timeout: 2000 })

    fireEvent.change(search, { target: { value: "accueil" } })
    expect(screen.getByRole("heading", { level: 4, name: "Accueil" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { level: 4, name: "Bar, Soir" })).toBeNull()

    fireEvent.change(search, { target: { value: "xyz" } })
    expect(screen.getByText("Aucun bénévole ni poste ne correspond à « xyz ».")).toBeInTheDocument()
  })

  describe("refreshes itself while open (#1141)", () => {
    beforeEach(() => vi.useFakeTimers())
    // jsdom starts an interval for its rendering updates (focus fixup, animation frames) as soon
    // as the DOM changes while an element has the focus. Started under fake timers, that interval
    // is a fake one: dropped unrun by `useRealTimers`, it would leave jsdom waiting on it for
    // ever, and no requestAnimationFrame callback (the live region's `announce`) would run in the
    // tests after this block. So: unmount, let the pending fake timers run (jsdom's interval
    // fires and stops itself), then bring the real timers back.
    afterEach(() => {
      cleanup()
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    })
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
      expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("Liste mise à jour : 1 personne marquée présente.")
    })

    it("a poll that changes nothing says nothing", async () => {
      fetchMock.mockResolvedValue(jsonOk({ board, today: "2026-07-04", refreshedAt: "14h05" }))
      renderBoard()
      await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
      await flush()
      expect(dayOfCalls()).toHaveLength(1)
      expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("")
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
      expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("Connexion perdue. La liste affichée date de 14h05.")
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
      expect(dayOfCalls()).toHaveLength(0)
      act(() => { window.dispatchEvent(new Event("online")) })
      await flush()
      expect(dayOfCalls()).toHaveLength(1)
      expect(screen.getByText("Mis à jour à 14h12.")).toBeInTheDocument()
      expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("Connexion rétablie. Liste mise à jour à 14h12.")
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
      expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("La liste n'a pas pu être mise à jour. Elle date de 14h05.")
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
      expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).not.toHaveTextContent("présence annulée")
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
      expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("Votre session a expiré")
      await act(async () => { await vi.advanceTimersByTimeAsync(600_000) })
      expect(dayOfCalls()).toHaveLength(1)
    })
  })
})

// The « absent » state on the day-of board (#1141): three states, one persistent button per row,
// and two devices that never overwrite each other.
describe("DayOfBoard, absent state (#1141)", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })
  const status = () => screen.getByRole("status", { name: "Mise à jour du tableau" })
  const barCard = () => screen.getByRole("heading", { level: 4, name: "Bar, Soir" }).closest("li")!
  const withZoe = (over: Record<string, unknown>): Board => ({ ...board, inProgress: [{ ...board.inProgress[0], shifts: [{ ...bar, people: [{ ...bar.people[0], ...over }, bar.people[1]] }] }] })
  const zoeAbsent = withZoe({ attendanceStatus: "absent" })
  const renderWith = (b: Board) => render(
    <DayOfBoard eventId="evt-1" board={b} today="2026-07-04" refreshedAt="14h05" timeZone="Europe/Zurich" registrationWindow={{ publicStatus: "published", registrationsOpen: true }} roles={["Bar", "Accueil"]} />,
  )

  it("an expected person has two buttons, a recorded one only the undo; « Marquer absent » is outlined, never red", () => {
    renderBoard()
    const present = screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })
    const absent = screen.getByRole("button", { name: "Marquer absent, Zoé Müller" })
    // The second button comes after the first, in the same row.
    expect(present.compareDocumentPosition(absent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(absent).toHaveTextContent("Marquer absent")
    expect(absent.className).toMatch(/border-blue-600/)
    expect(absent.className).not.toMatch(/red-|dark:/)
    for (const b of [present, absent]) {
      expect(b.className).toMatch(/min-h-11/)
      expect(b.className).toMatch(/min-w-11/)
      expect(b).not.toHaveAttribute("aria-pressed")
    }
    // Léon is present: one button, no « Marquer absent » (the presence is undone first).
    expect(screen.getByRole("button", { name: "Annuler la présence, Léon Favre" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Marquer absent, Léon Favre" })).toBeNull()
    expect(screen.queryByRole("radiogroup")).toBeNull()
  })

  it("the three badges differ by word and sign, not by colour alone", () => {
    renderWith({ ...zoeAbsent, upcoming: board.upcoming })
    const card = barCard()
    const absent = within(card).getByText("Absent")
    expect(absent.className).toMatch(/bg-amber-100/)
    expect(absent.className).toMatch(/text-amber-900/)
    expect(absent.className).not.toMatch(/bg-gray-100|red-|dark:/)
    expect(within(absent).getByText(/✗/)).toHaveAttribute("aria-hidden", "true")
    const present = within(card).getByText("Présent")
    expect(within(present).getByText(/✓/)).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByText("Pas encore marqué").className).toMatch(/bg-gray-100/)
    expect(card).toHaveTextContent("1 présent sur 2 attendus, 1 absent.")
  })

  it("« Marquer absent » records the absence; its button goes and the focus moves to the row's first button", async () => {
    fetchMock.mockResolvedValue(jsonOk({ done: 1, changedIds: ["r1"], skipped: 0, results: [{ id: "r1", changed: true, state: "absent", checkedInAt: null }] }))
    renderBoard()
    const primary = screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })
    const absent = screen.getByRole("button", { name: "Marquer absent, Zoé Müller" })
    absent.focus()
    fireEvent.click(absent)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/events/evt-1/registrations/bulk")
    expect(JSON.parse(init.body)).toEqual({ action: "mark_absent", registrationIds: ["r1"], observedShifts: { r1: "s1" } })

    const undo = await screen.findByRole("button", { name: "Annuler l'absence, Zoé Müller" })
    // The same node as « Marquer présent »: it never unmounts.
    expect(undo).toBe(primary)
    expect(undo).toHaveTextContent("Annuler l'absence")
    expect(screen.queryByRole("button", { name: "Marquer absent, Zoé Müller" })).toBeNull()
    await waitFor(() => expect(undo).toHaveFocus())
    await waitFor(() => expect(status()).toHaveTextContent("Absence enregistrée pour Zoé Müller. Bar, Soir : 1 présent sur 2 attendus, 1 absent."))
    expect(barCard()).toHaveTextContent("1 présent sur 2 attendus, 1 absent.")
    expect(within(barCard()).getByText("Absent")).toBeInTheDocument()
  })

  it("« Annuler l'absence » puts the person back to expected on the same button, and « Marquer absent » comes back", async () => {
    fetchMock.mockResolvedValue(jsonOk({ done: 1, changedIds: ["r1"], skipped: 0, results: [{ id: "r1", changed: true, state: "expected", checkedInAt: null }] }))
    renderWith(zoeAbsent)
    const undo = screen.getByRole("button", { name: "Annuler l'absence, Zoé Müller" })
    undo.focus()
    fireEvent.click(undo)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "undo_absent", registrationIds: ["r1"], observedShifts: { r1: "s1" } })
    const mark = await screen.findByRole("button", { name: "Marquer présent, Zoé Müller" })
    expect(mark).toBe(undo)
    expect(mark).toHaveFocus()
    expect(screen.getByRole("button", { name: "Marquer absent, Zoé Müller" })).toBeInTheDocument()
    await waitFor(() => expect(status()).toHaveTextContent("Absence annulée pour Zoé Müller. Bar, Soir : 1 présent sur 2 attendus."))
  })

  it("while the request runs, both buttons are aria-disabled, never disabled, and a second press does nothing", async () => {
    let answer: (v: unknown) => void = () => {}
    fetchMock.mockImplementation(() => new Promise((resolve) => { answer = resolve }))
    renderBoard()
    const primary = screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })
    const absent = screen.getByRole("button", { name: "Marquer absent, Zoé Müller" })
    absent.focus()
    fireEvent.click(absent)
    await waitFor(() => expect(absent).toHaveAttribute("aria-disabled", "true"))
    expect(primary).toHaveAttribute("aria-disabled", "true")
    for (const b of [primary, absent]) expect(b).toBeEnabled()
    // The row keeps what it showed when tapped, and the pressed button keeps the focus.
    expect(absent).toHaveFocus()
    fireEvent.click(primary)
    fireEvent.click(absent)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => { answer(jsonOk({ done: 1, changedIds: ["r1"], skipped: 0, results: [{ id: "r1", changed: true, state: "absent", checkedInAt: null }] })) })
    await waitFor(() => expect(screen.getByRole("button", { name: "Annuler l'absence, Zoé Müller" })).not.toHaveAttribute("aria-disabled"))
  })

  it("a failed « Marquer absent » names the absence in the row's alert and leaves the person expected", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "Boom" }) })
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Marquer absent, Zoé Müller" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Absence de Zoé Müller : erreur du serveur/)
    expect(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Marquer absent, Zoé Müller" })).toBeInTheDocument()
  })

  it("conflict: an absence recorded on another device first. The row takes it, nothing is retried, it is said once and shown in the row", async () => {
    fetchMock.mockImplementation(async (url: string) => url.endsWith("/bulk")
      ? jsonOk({ done: 0, changedIds: [], skipped: 1, results: [{ id: "r1", changed: false, state: "absent", checkedInAt: null }] })
      : jsonOk({ board: zoeAbsent, today: "2026-07-04", refreshedAt: "14h06" }))
    renderBoard()
    const primary = screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })
    primary.focus()
    fireEvent.click(primary)

    const sentence = "Une absence est déjà enregistrée pour Zoé Müller, depuis un autre appareil. Bar, Soir : 1 présent sur 2 attendus, 1 absent."
    await waitFor(() => expect(status()).toHaveTextContent(sentence))
    // The row shows the server's state: the same button now undoes the absence, and keeps the focus.
    const undo = screen.getByRole("button", { name: "Annuler l'absence, Zoé Müller" })
    expect(undo).toBe(primary)
    expect(undo).toHaveFocus()
    expect(screen.queryByRole("button", { name: "Marquer absent, Zoé Müller" })).toBeNull()
    // The same sentence in the row, for who does not hear the live region: plain text, no live role.
    const row = undo.closest("li")!
    const shown = within(row).getByText(sentence)
    expect(shown).not.toHaveAttribute("role")
    expect(shown).not.toHaveAttribute("aria-live")
    expect(screen.queryByRole("alert")).toBeNull()
    // The silent read after the action, and nothing else: the check-in is not sent again.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/day-of", expect.anything()))
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/bulk"))).toHaveLength(1)
    expect(status()).toHaveTextContent(sentence)
    expect(status()).not.toHaveTextContent("Liste mise à jour")
    expect(barCard()).toHaveTextContent("1 présent sur 2 attendus, 1 absent.")
  })

  it("conflict on « Marquer absent »: a presence recorded elsewhere first. The pressed button goes, the focus moves to the first one", async () => {
    const zoePresent = withZoe({ checkedInAt: "2026-07-04T12:03:00.000Z" })
    fetchMock.mockImplementation(async (url: string) => url.endsWith("/bulk")
      ? jsonOk({ done: 0, changedIds: [], skipped: 1, results: [{ id: "r1", changed: false, state: "present", checkedInAt: "2026-07-04T12:03:00.000Z" }] })
      : jsonOk({ board: zoePresent, today: "2026-07-04", refreshedAt: "14h06" }))
    renderBoard()
    const primary = screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })
    const absent = screen.getByRole("button", { name: "Marquer absent, Zoé Müller" })
    absent.focus()
    fireEvent.click(absent)
    await waitFor(() => expect(status()).toHaveTextContent("Une présence est déjà enregistrée pour Zoé Müller, depuis un autre appareil. Bar, Soir : 2 présents sur 2 attendus."))
    const undo = screen.getByRole("button", { name: "Annuler la présence, Zoé Müller" })
    expect(undo).toBe(primary)
    expect(screen.queryByRole("button", { name: "Marquer absent, Zoé Müller" })).toBeNull()
    await waitFor(() => expect(undo).toHaveFocus())
    await new Promise((r) => setTimeout(r, 50))
    expect(status()).not.toHaveTextContent("Liste mise à jour")
  })

  it("the sentence shown in the row goes with the next action", async () => {
    fetchMock.mockImplementation(async (url: string, init?: { body?: string }) => {
      if (!url.endsWith("/bulk")) return jsonOk({ board: zoeAbsent, today: "2026-07-04", refreshedAt: "14h06" })
      return JSON.parse(init?.body ?? "{}").action === "check_in"
        ? jsonOk({ done: 0, changedIds: [], skipped: 1, results: [{ id: "r1", changed: false, state: "absent", checkedInAt: null }] })
        : jsonOk({ done: 1, changedIds: ["r1"], skipped: 0, results: [{ id: "r1", changed: true, state: "expected", checkedInAt: null }] })
    })
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" }))
    const undo = await screen.findByRole("button", { name: "Annuler l'absence, Zoé Müller" })
    expect(within(undo.closest("li")!).getByText(/^Une absence est déjà enregistrée/)).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/day-of", expect.anything()))
    await new Promise((r) => setTimeout(r, 20))
    fireEvent.click(undo)
    await screen.findByRole("button", { name: "Marquer présent, Zoé Müller" })
    expect(within(undo.closest("li")!).queryByText(/^Une absence est déjà enregistrée/)).toBeNull()
  })

  it("an absence recorded elsewhere arrives with « Actualiser » and is said as such, never as a presence undone", async () => {
    fetchMock.mockResolvedValue(jsonOk({ board: zoeAbsent, today: "2026-07-04", refreshedAt: "14h06" }))
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }))
    await waitFor(() => expect(status()).toHaveTextContent("Liste mise à jour à 14h06 : 1 personne marquée absente."))
    expect(screen.getByRole("button", { name: "Annuler l'absence, Zoé Müller" })).toBeInTheDocument()
  })

  // Fix round: focus is only moved when it was dropped, never taken from where the person is.
  it("an answer arriving while the focus is in the search field leaves it there", async () => {
    let answer: (v: unknown) => void = () => {}
    fetchMock.mockImplementation((url: string) => url.endsWith("/bulk") ? new Promise((resolve) => { answer = resolve }) : Promise.resolve(jsonOk({ board, today: "2026-07-04", refreshedAt: "14h06" })))
    renderBoard()
    const search = screen.getByLabelText("Rechercher un bénévole ou un poste")
    fireEvent.click(screen.getByRole("button", { name: "Marquer absent, Zoé Müller" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    // The person goes on to the search while the request is in flight.
    search.focus()
    await act(async () => { answer(jsonOk({ done: 1, changedIds: ["r1"], skipped: 0, results: [{ id: "r1", changed: true, state: "absent", checkedInAt: null }] })) })
    await screen.findByRole("button", { name: "Annuler l'absence, Zoé Müller" })
    await waitFor(() => expect(status()).toHaveTextContent("Absence enregistrée pour Zoé Müller."))
    expect(search).toHaveFocus()
  })

  it("an answer arriving while the focus is on another row's button leaves it there, conflict included", async () => {
    let answer: (v: unknown) => void = () => {}
    fetchMock.mockImplementation((url: string) => url.endsWith("/bulk") ? new Promise((resolve) => { answer = resolve }) : Promise.resolve(jsonOk({ board: zoeAbsent, today: "2026-07-04", refreshedAt: "14h06" })))
    renderBoard()
    const other = screen.getByRole("button", { name: "Annuler la présence, Léon Favre" })
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    other.focus()
    await act(async () => { answer(jsonOk({ done: 0, changedIds: [], skipped: 1, results: [{ id: "r1", changed: false, state: "absent", checkedInAt: null }] })) })
    await waitFor(() => expect(status()).toHaveTextContent(/^Une absence est déjà enregistrée pour Zoé Müller/))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/day-of", expect.anything()))
    await new Promise((r) => setTimeout(r, 30))
    expect(other).toHaveFocus()
  })

  it("the press says which shift the row was shown on", async () => {
    fetchMock.mockResolvedValue(jsonOk({ done: 1, changedIds: ["r3"], skipped: 0, results: [{ id: "r3", changed: true, state: "absent", checkedInAt: null }] }))
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Marquer absent, Anne Roy" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "mark_absent", registrationIds: ["r3"], observedShifts: { r3: "s2" } })
  })

  it("conflict where the server says « attendu »: the plain sentence is said and also shown in the row, with no live role", async () => {
    // « Annuler la présence » on Léon, already undone on another device.
    const leonExpected: Board = { ...board, inProgress: [{ ...board.inProgress[0], shifts: [{ ...bar, people: [bar.people[0], { ...bar.people[1], checkedInAt: null }] }] }] }
    fetchMock.mockImplementation(async (url: string) => url.endsWith("/bulk")
      ? jsonOk({ done: 0, changedIds: [], skipped: 1, results: [{ id: "r2", changed: false, state: "expected", checkedInAt: null }] })
      : jsonOk({ board: leonExpected, today: "2026-07-04", refreshedAt: "14h06" }))
    renderBoard()
    const primary = screen.getByRole("button", { name: "Annuler la présence, Léon Favre" })
    primary.focus()
    fireEvent.click(primary)
    const sentence = "Rien n'a changé pour Léon Favre : la liste est mise à jour."
    await waitFor(() => expect(status()).toHaveTextContent(sentence))
    // The row takes the server's state.
    const mark = screen.getByRole("button", { name: "Marquer présent, Léon Favre" })
    expect(mark).toBe(primary)
    expect(mark).toHaveFocus()
    const shown = within(mark.closest("li")!).getByText(sentence)
    expect(shown).not.toHaveAttribute("role")
    expect(shown).not.toHaveAttribute("aria-live")
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/day-of", expect.anything()))
    await new Promise((r) => setTimeout(r, 50))
    // Still there after the silent read: the row shows the same state as before it.
    expect(within(mark.closest("li")!).getByText(sentence)).toBeInTheDocument()
    expect(status()).not.toHaveTextContent("Liste mise à jour")
  })

  for (const [what, answer] of [
    ["moved to another shift", { id: "r1", changed: false, state: "expected", checkedInAt: null, moved: true }],
    ["no longer there", { id: "r1", changed: false, state: null, checkedInAt: null, gone: true }],
  ] as const) {
    it(`the person is ${what}: nothing is marked, the « left the board » sentence is said and shown in the row, and the list is read again silently`, async () => {
      const without: Board = { ...board, inProgress: [{ ...board.inProgress[0], shifts: [{ ...bar, people: bar.people.slice(1) }] }] }
      let release: () => void = () => {}
      const held = new Promise<void>((resolve) => { release = resolve })
      fetchMock.mockImplementation(async (url: string) => {
        if (url.endsWith("/bulk")) return jsonOk({ done: 0, changedIds: [], skipped: 1, results: [answer] })
        await held
        return jsonOk({ board: without, today: "2026-07-04", refreshedAt: "14h06" })
      })
      renderBoard()
      const primary = screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })
      primary.focus()
      fireEvent.click(primary)
      const sentence = "Zoé Müller ne figure plus parmi les personnes attendues, Bar, Soir."
      await waitFor(() => expect(status()).toHaveTextContent(sentence))
      // Until the read lands, the row is as it was (no state invented) and explains itself.
      expect(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" })).toBe(primary)
      const shown = within(primary.closest("li")!).getByText(sentence)
      expect(shown).not.toHaveAttribute("role")
      expect(barCard()).toHaveTextContent("1 présent sur 2 attendus.")
      expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/bulk"))).toHaveLength(1)
      // The silent read removes the row; the focus goes to its shift, and nothing more is said.
      await act(async () => { release() })
      await waitFor(() => expect(screen.queryByRole("button", { name: /Zoé Müller/ })).toBeNull())
      await waitFor(() => expect(screen.getByRole("heading", { level: 4, name: "Bar, Soir" })).toHaveFocus())
      await new Promise((r) => setTimeout(r, 50))
      expect(screen.queryByText(sentence, { selector: "li p" })).toBeNull()
      expect(status()).toHaveTextContent(sentence)
      expect(status()).not.toHaveTextContent("Liste mise à jour")
    })
  }

  it("the sentence shown in a row goes when a later read changes that person's state", async () => {
    let dayOf: Board = zoeAbsent
    fetchMock.mockImplementation(async (url: string) => url.endsWith("/bulk")
      ? jsonOk({ done: 0, changedIds: [], skipped: 1, results: [{ id: "r1", changed: false, state: "absent", checkedInAt: null }] })
      : jsonOk({ board: dayOf, today: "2026-07-04", refreshedAt: "14h06" }))
    renderBoard()
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Zoé Müller" }))
    const undo = await screen.findByRole("button", { name: "Annuler l'absence, Zoé Müller" })
    const row = undo.closest("li")!
    await waitFor(() => expect(within(row).getByText(/^Une absence est déjà enregistrée/)).toBeInTheDocument())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/day-of", expect.anything()))
    await new Promise((r) => setTimeout(r, 30))
    // The silent read after the action brought the same state: the sentence still explains the row.
    expect(within(row).getByText(/^Une absence est déjà enregistrée/)).toBeInTheDocument()
    // Someone undoes the absence elsewhere; « Actualiser » brings it.
    dayOf = board
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }))
    await screen.findByRole("button", { name: "Marquer présent, Zoé Müller" })
    expect(within(row).queryByText(/^Une absence est déjà enregistrée/)).toBeNull()
  })
})
