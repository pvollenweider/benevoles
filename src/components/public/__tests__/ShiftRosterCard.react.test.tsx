/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react"

import ShiftRosterCard from "../ShiftRosterCard"
import { ROSTER_EMPTY_TEXT, ROSTER_INTRO_TEXT, type RosterViewerState, type ShiftRosterEntry } from "@/lib/shift-roster"

// « Qui est inscrit » (#1068): names, then the number of the others without their names.
describe("ShiftRosterCard", () => {
  afterEach(cleanup)
  const at = { date: "2031-06-06T00:00:00.000Z", startTime: "10:00", endTime: "12:00" }
  const entry = (shiftId: string, names: string[], othersCount: number, own = true): ShiftRosterEntry => ({ shiftId, label: shiftId, ...at, names, othersCount, own })
  const renderCard = (shifts: ShiftRosterEntry[], displayName: string | null = "Léa F.") =>
    render(<ShiftRosterCard token="tok" data={{ available: true, displayName, state: "hidden", shifts }} beginChange={() => () => {}} eventPageUrl="https://club.example/fete" />)
  const shiftBlock = (label: string) => screen.getByRole("heading", { level: 3, name: new RegExp(`^${label}`) }).parentElement!

  it("after the names, « et N autre(s) bénévole(s) » outside the list; alone, « N autre(s) bénévole(s), sans nom affiché »", () => {
    renderCard([entry("Bar", ["Aline M.", "Bruno K."], 3), entry("Caisse", ["Chloé R."], 1), entry("Accueil", [], 1), entry("Vestiaire", [], 4), entry("Rangement", ["Dan V."], 0)])
    const card = screen.getByRole("region", { name: "Qui est inscrit" })
    expect(within(card).getByText(ROSTER_INTRO_TEXT)).toBeInTheDocument()

    const bar = shiftBlock("Bar")
    // The list counts the people named only; the count follows it.
    expect(within(bar).getAllByRole("listitem")).toHaveLength(2)
    expect(within(bar).getByText("et 3 autres bénévoles").tagName).toBe("P")
    expect(within(shiftBlock("Caisse")).getByText("et 1 autre bénévole")).toBeInTheDocument()

    const accueil = shiftBlock("Accueil")
    expect(within(accueil).queryByRole("list")).toBeNull()
    expect(within(accueil).getByText("1 autre bénévole, sans nom affiché")).toBeInTheDocument()
    expect(within(shiftBlock("Vestiaire")).getByText("4 autres bénévoles, sans nom affiché")).toBeInTheDocument()

    const rangement = shiftBlock("Rangement")
    expect(within(rangement).queryByText(/autre/)).toBeNull()
    expect(screen.queryByText(ROSTER_EMPTY_TEXT)).toBeNull()
  })

  it("prints « Léa F. » with a non-breaking space, speaks « Léa, initiale F »", () => {
    renderCard([entry("Bar", ["Aline M."], 0)])
    const item = screen.getByRole("listitem")
    expect(item.querySelector('[aria-hidden="true"]')!.textContent).toBe("Aline M.")
    expect(item.querySelector(".sr-only")!.textContent).toBe("Aline, initiale M")
    const choice = document.getElementById("roster-choice")!
    expect(choice.querySelector('[aria-hidden="true"]')!.textContent).toContain("«\u00a0Léa\u00a0F.\u00a0»")
    expect(choice.querySelector(".sr-only")!.textContent).toContain("«\u00a0Léa, initiale F\u00a0»")
  })

  it("no confirmed shift: the empty sentence", () => {
    renderCard([])
    expect(screen.getByText(ROSTER_EMPTY_TEXT)).toBeInTheDocument()
  })

  it("only the viewer's own shifts, « personne d'autre » when alone, and the link to the others", () => {
    renderCard([entry("Bar", ["Aline M."], 0), entry("Accueil", ["Zoé R."], 2, false), entry("Vestiaire", [], 0)])
    expect(screen.queryByRole("heading", { level: 3, name: /^Accueil/ })).toBeNull()
    expect(screen.queryByText("Zoé R.")).toBeNull()
    expect(within(shiftBlock("Vestiaire")).getByText("Personne d'autre pour l'instant.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Voir qui est inscrit sur les autres créneaux" })).toHaveAttribute("href", "https://club.example/fete?inscrits=1")
  })

  it("no link while the event page is not published", () => {
    render(<ShiftRosterCard token="tok" data={{ available: true, displayName: "Léa F.", state: "hidden", shifts: [] }} beginChange={() => () => {}} eventPageUrl={null} />)
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("a name shown under the first text: two buttons; accepting the current one moves the focus to the one left", async () => {
    const next = { available: true, displayName: "Léa F.", state: "visible", shifts: [] }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => next })
    vi.stubGlobal("fetch", fetchMock)
    let data = { available: true as const, displayName: "Léa F.", state: "visible_confirmed" as RosterViewerState, shifts: [] as ShiftRosterEntry[] }
    const { rerender } = render(<ShiftRosterCard token="tok" data={data} beginChange={() => () => {}} />)
    expect(screen.getByRole("button", { name: "Masquer mon nom" })).toBeInTheDocument()
    const widen = screen.getByRole("button", { name: "Montrer aussi mon nom aux membres invités" })
    widen.focus()
    fireEvent.click(widen)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ visible: true })
    // The page applies the answer: the second button goes, the focus lands on the one left.
    data = { ...data, state: "visible" }
    rerender(<ShiftRosterCard token="tok" data={data} beginChange={() => () => {}} />)
    expect(screen.queryByRole("button", { name: /membres invités/ })).toBeNull()
    await waitFor(() => expect(screen.getByRole("button", { name: "Masquer mon nom" })).toHaveFocus())
    vi.unstubAllGlobals()
  })
})
