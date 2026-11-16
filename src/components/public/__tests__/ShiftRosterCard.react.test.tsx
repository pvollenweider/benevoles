/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react"

import ShiftRosterCard, { type RosterData } from "../ShiftRosterCard"
import type { RosterViewerState, ShiftRosterEntry } from "@/lib/shift-roster"
import { ROSTER_COUNT_NOTICE, ROSTER_EMPTY_TEXT } from "@/lib/shift-roster-text"

// « Qui est inscrit » (#1068): names, then the number of the others without their names; the
// volunteer's own choice is a switch, its state in words.
describe("ShiftRosterCard", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  const at = { date: "2031-06-06T00:00:00.000Z", startTime: "10:00", endTime: "12:00" }
  const entry = (shiftId: string, names: string[], othersCount: number, own = true): ShiftRosterEntry => ({ shiftId, label: shiftId, ...at, names, othersCount, own })
  const card = (state: RosterViewerState, shifts: ShiftRosterEntry[] = [], eventPageUrl: string | null = null) =>
    <ShiftRosterCard token="tok" data={{ available: true, displayName: "Léa F.", state, shifts }} beginChange={() => () => {}} eventPageUrl={eventPageUrl} />
  const renderCard = (shifts: ShiftRosterEntry[]) => render(card("hidden", shifts, "https://club.example/fete"))
  const shiftBlock = (label: string) => screen.getByRole("heading", { level: 3, name: new RegExp(`^${label}`) }).parentElement!
  const answer = (next: RosterData) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => next })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }
  const sentBody = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(fetchMock.mock.calls[0][1].body)

  it("after the names, « et N autre(s) bénévole(s) » outside the list; alone, « N autre(s) bénévole(s), sans nom affiché »", () => {
    renderCard([entry("Bar", ["Aline M.", "Bruno K."], 3), entry("Caisse", ["Chloé R."], 1), entry("Accueil", [], 1), entry("Vestiaire", [], 4), entry("Rangement", ["Dan V."], 0)])
    const region = screen.getByRole("region", { name: "Qui est inscrit" })
    // No introduction any more: the heading, then the shifts.
    expect(region.querySelector("h2")!.nextElementSibling!.querySelector("h3")).not.toBeNull()

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

  it("prints « Léa F. » with a non-breaking space, speaks « Léa, initiale F », each once", () => {
    renderCard([entry("Bar", ["Aline M."], 0)])
    const item = screen.getByRole("listitem")
    expect(item.querySelector('[aria-hidden="true"]')!.textContent).toBe("Aline\u00a0M.")
    expect(item.querySelector(".sr-only")!.textContent).toBe("Aline, initiale M")
    // The switch's description: the spoken form only, in a hidden node read through aria-describedby.
    const choice = document.getElementById("roster-choice")!
    expect(choice).toHaveAttribute("hidden")
    expect(choice.textContent).toContain("« Léa, initiale F »")
    expect(choice.textContent).not.toContain("Léa F.")
  })

  it("the date printed short, spoken whole", () => {
    renderCard([entry("Bar", [], 0)])
    const h3 = screen.getByRole("heading", { level: 3, name: /^Bar/ })
    expect(h3.querySelector('[aria-hidden="true"]')!.textContent).toBe("ven. 6 juin")
    expect(h3.querySelector(".sr-only")!.textContent).toBe("vendredi 6 juin")
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

  it("no link to the event page while it is not published", () => {
    render(card("hidden"))
    expect(screen.queryByRole("link", { name: /autres créneaux/ })).toBeNull()
  })

  it("the choice is a switch with a constant label, its state in words, the count notice and the guide", () => {
    render(card("hidden"))
    const sw = screen.getByRole("switch", { name: "Afficher mon nom aux autres bénévoles" })
    expect(sw).toHaveAttribute("aria-checked", "false")
    expect(sw).toHaveAccessibleDescription(/^Masqué\. Si tu l'affiches, les bénévoles confirmés et les membres invités par l'organisation verront/)
    expect(screen.getByText("Masqué")).toBeInTheDocument()
    expect(screen.getByText(ROSTER_COUNT_NOTICE)).toBeInTheDocument()
    const more = screen.getByRole("link", { name: "En savoir plus sur « Qui est inscrit » (ouvre dans un nouvel onglet)" })
    expect(more).toHaveAttribute("href", "/doc/ma-page-personnelle#qui-est-inscrit")
    expect(more).toHaveAttribute("target", "_blank")
  })

  it("shown: the switch on, « Visible : « Léa F. » »; turning it off withdraws at once", async () => {
    const fetchMock = answer({ available: true, displayName: "Léa F.", state: "hidden", shifts: [] })
    render(card("visible"))
    const sw = screen.getByRole("switch", { name: "Afficher mon nom aux autres bénévoles" })
    expect(sw).toHaveAttribute("aria-checked", "true")
    expect(sw).toHaveAccessibleDescription(/^Visible : « Léa, initiale F »\./)
    fireEvent.click(sw)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(sentBody(fetchMock)).toEqual({ visible: false, noticeVersion: "2026-10-21.2" })
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Ton nom est maintenant masqué."))
  })

  it("ticked at sign-up, not confirmed: the switch off, « À confirmer »; one tap confirms", async () => {
    const fetchMock = answer({ available: true, displayName: "Léa F.", state: "visible", shifts: [] })
    render(card("pending"))
    const sw = screen.getByRole("switch")
    expect(sw).toHaveAttribute("aria-checked", "false")
    expect(screen.getByText(/^À confirmer/, { selector: "p span" })).toBeVisible()
    fireEvent.click(sw)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(sentBody(fetchMock)).toEqual({ visible: true, noticeVersion: "2026-10-21.2" })
  })

  it("while saving, a second tap sends nothing", async () => {
    let resolve: (v: unknown) => void = () => {}
    const fetchMock = vi.fn().mockReturnValue(new Promise((r) => { resolve = r }))
    vi.stubGlobal("fetch", fetchMock)
    render(card("hidden"))
    const sw = screen.getByRole("switch")
    fireEvent.click(sw)
    await waitFor(() => expect(sw).toHaveAttribute("aria-disabled", "true"))
    fireEvent.click(sw)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Not flipped before the server answers.
    expect(sw).toHaveAttribute("aria-checked", "false")
    resolve({ ok: true, status: 200, json: async () => ({ available: true, displayName: "Léa F.", state: "visible", shifts: [] }) })
    await waitFor(() => expect(sw).not.toHaveAttribute("aria-disabled"))
  })

  it("a known minor: no switch, the sentence and the count notice", () => {
    render(card("minor"))
    expect(screen.queryByRole("switch")).toBeNull()
    expect(screen.getByText(/moins de 18 ans/)).toBeInTheDocument()
    expect(screen.getByText(ROSTER_COUNT_NOTICE)).toBeInTheDocument()
  })

  it("a name shown under the first text: the switch on and a button; accepting the current one moves the focus to the switch", async () => {
    const fetchMock = answer({ available: true, displayName: "Léa F.", state: "visible", shifts: [] })
    const { rerender } = render(card("visible_confirmed"))
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText(/^Visible aux bénévoles confirmés/, { selector: ".sr-only" })).toBeInTheDocument()
    const widen = screen.getByRole("button", { name: "Le leur montrer aussi" })
    expect(widen).toHaveAccessibleDescription("Les membres invités ne le voient pas encore.")
    widen.focus()
    fireEvent.click(widen)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(sentBody(fetchMock)).toEqual({ visible: true, noticeVersion: "2026-10-21.2" })
    // The page applies the answer: the button goes, the focus lands on the switch.
    rerender(card("visible"))
    expect(screen.queryByRole("button", { name: "Le leur montrer aussi" })).toBeNull()
    await waitFor(() => expect(screen.getByRole("switch")).toHaveFocus())
  })
})
