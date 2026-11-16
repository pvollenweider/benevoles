/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"
import FrontDeskDayOfBoard from "../admin/FrontDeskDayOfBoard"
import DayOfBoard from "../admin/DayOfBoard"
import { ACCESS_ENDED_TEXT } from "@/lib/day-of-sync"
import type { DayOfBoard as Board, DayOfShift } from "@/lib/day-of"

const shift: DayOfShift = {
  id: "s1", roleName: "Accueil", label: "Matin", date: "2027-06-14", startTime: "08:00", endTime: "12:00", capacity: 2,
  contactName: "Sacha Bonvin", contactPhone: "079 000 00 00",
  people: [{ registrationId: "r1", firstName: "Léa", lastName: "Favre", phone: "+41 79 123 45 67", checkedInAt: null }],
}
const board: Board = {
  inProgress: [{ key: "2027-06-14T08:00", date: "2027-06-14", startTime: "08:00", shifts: [shift] }],
  upcoming: [], earlier: [], laterCount: 0,
}
const props = {
  eventId: "evt-fete",
  board,
  today: "2027-06-14",
  refreshedAt: "09h05",
  timeZone: "Europe/Zurich",
  registrationWindow: { publicStatus: "published", registrationsOpen: true },
}
const renderFrontDesk = () => render(<FrontDeskDayOfBoard {...props} />)

describe("FrontDeskDayOfBoard", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  const dayOfCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/day-of"))
  const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(50) })

  it("renders the board without « Ajouter un besoin », and with no link to another admin page", () => {
    renderFrontDesk()
    expect(screen.getByRole("heading", { level: 4, name: "Accueil, Matin" })).toBeInTheDocument()
    expect(screen.queryByText(/Ajouter un besoin/i)).toBeNull()
    expect(screen.queryByRole("link", { name: /Inscriptions|Où manque|Écrire aux bénévoles|Modifier/ })).toBeNull()
    // The only links are phone links.
    for (const link of screen.getAllByRole("link")) expect(link.getAttribute("href")).toMatch(/^tel:/)
  })

  it("the same board for an organiser still offers « Ajouter un besoin »", () => {
    render(<DayOfBoard {...props} roles={["Accueil"]} />)
    expect(screen.getByRole("heading", { name: "Ajouter un besoin" })).toBeInTheDocument()
  })

  it("a 403 on the poll unmounts the board, focuses the end-of-access sentence and stops polling", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Accès refusé" }) })
    renderFrontDesk()
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
    await flush()
    const message = screen.getByRole("heading", { level: 2, name: ACCESS_ENDED_TEXT })
    expect(message).toHaveFocus()
    // The board's chrome went with it: timers, live region and freshness line.
    expect(screen.queryByRole("button", { name: "Actualiser" })).toBeNull()
    expect(screen.queryByRole("status", { name: "Mise à jour du tableau" })).toBeNull()
    expect(screen.queryByText(/Mis à jour à/)).toBeNull()
    expect(dayOfCalls()).toHaveLength(1)
    // The route the board builds is absolute: it works from /admin/front-desk/events/<id> too.
    expect(dayOfCalls()[0][0]).toBe("/api/admin/events/evt-fete/day-of")
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000) })
    expect(dayOfCalls()).toHaveLength(1)
  })

  it("a 403 on an attendance action ends the access the same way, without a row error to retry", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Accès refusé" }) })
    renderFrontDesk()
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Léa Favre" }))
    await flush()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/admin/events/evt-fete/registrations/bulk"])
    expect(screen.getByRole("heading", { level: 2, name: ACCESS_ENDED_TEXT })).toHaveFocus()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("button", { name: /Léa Favre/ })).toBeNull()
  })

  it("a 401 on an attendance action for the role says « session expired » once, with no row error, and stops polling", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "Non autorisé" }) })
    renderFrontDesk()
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Léa Favre" }))
    await flush()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/admin/events/evt-fete/registrations/bulk"])
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("heading", { level: 2, name: ACCESS_ENDED_TEXT })).toBeNull()
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument()
    // The visible freshness line and the live region say the same sentence: said once, shown too.
    expect(screen.getAllByText("Votre session a expiré : rechargez la page pour vous reconnecter.")).toHaveLength(2)
    expect(screen.getByRole("status", { name: "Mise à jour du tableau" })).toHaveTextContent("Votre session a expiré")
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000) })
    expect(dayOfCalls()).toHaveLength(0)
  })

  it("a 401 on an attendance action for an organiser ends in the same session-expired state", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "Non autorisé" }) })
    render(<DayOfBoard {...props} roles={["Accueil"]} />)
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Léa Favre" }))
    await flush()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/admin/events/evt-fete/registrations/bulk"])
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("button", { name: "Marquer présent, Léa Favre" })).toBeInTheDocument()
    expect(screen.getAllByText("Votre session a expiré : rechargez la page pour vous reconnecter.")).toHaveLength(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000) })
    expect(dayOfCalls()).toHaveLength(0)
  })

  it("a 403 on an attendance action for an organiser stays a row alert, board still there", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Accès refusé" }) })
    render(<DayOfBoard {...props} roles={["Accueil"]} />)
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent, Léa Favre" }))
    await flush()
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Présence de Léa Favre : refusé. Accès refusé")
    expect(alert).not.toHaveTextContent("erreur du serveur")
    expect(screen.queryByRole("heading", { level: 2, name: ACCESS_ENDED_TEXT })).toBeNull()
    expect(screen.getByRole("button", { name: "Marquer présent, Léa Favre" })).toBeInTheDocument()
  })

  it("a 401 keeps meaning « session expired »: the board stays, as before, and never becomes an end of access", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "Non autorisé" }) })
    renderFrontDesk()
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
    await flush()
    expect(screen.queryByRole("heading", { level: 2, name: ACCESS_ENDED_TEXT })).toBeNull()
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument()
    expect(screen.getAllByText("Votre session a expiré : rechargez la page pour vous reconnecter.")).toHaveLength(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000) })
    expect(dayOfCalls()).toHaveLength(1)
  })

  it("an organiser's board keeps its previous handling of a 403: the session-expired sentence, board still there", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Accès refusé" }) })
    render(<DayOfBoard {...props} roles={["Accueil"]} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
    await flush()
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument()
    expect(screen.getAllByText("Votre session a expiré : rechargez la page pour vous reconnecter.")).toHaveLength(2)
  })
})
