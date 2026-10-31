/**
 * @vitest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import DraftBoard from "../admin/DraftBoard"
import type { DraftBoardData } from "@/lib/draft-board-data"
import type { BoardItem, BoardRow } from "@/lib/draft-board"

// « Affectations en brouillon » (#1146, lot C): the summary, publication and the person × day planning.
const fetchMock = vi.fn()
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); refresh.mockReset() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const draftItem: BoardItem = {
  kind: "draft", shiftId: "s2", name: "Bar · Nuit", startTime: "22:00", time: "de 22h à 2h, jusqu'au lendemain", fit: "outside", fitLabel: "Pas disponible à ces heures", fitDetail: "", review: null,
  draft: { id: "d1", revision: 2, source: "manual", locked: false, stale: false, staleText: null, ackKey: "a1|key", acked: false, problems: ["Nadia Rochat a indiqué ne pas être disponible : confirmez."], markers: [] },
}
const row = (extra: Partial<BoardRow> = {}): BoardRow => ({
  volunteerId: "v-n", firstName: "Nadia", lastName: "Rochat", sameNameHint: null, hasEmail: true, reviewTexts: [], seenRevision: null, committedMinutes: 240, draftMinutes: 240, findings: [], markers: [], problemCount: 1,
  cells: [
    { date: "2031-07-10", availability: "Pas disponible", availabilityKind: "unavailable", items: [] },
    { date: "2031-07-11", availability: "Libre de 9h à 16h", availabilityKind: "ranges", items: [{ kind: "confirmed", shiftId: "s1", registrationId: "r1", name: "Bar", startTime: "10:00", time: "de 10h à 14h", fit: "full", fitLabel: "Disponible sur tout le créneau", fitDetail: "", review: null }, draftItem] },
  ],
  ...extra,
})
const COVERAGE = [{ date: "2031-07-10", missing: 0, shifts: [] }, { date: "2031-07-11", missing: 2, shifts: [{ shiftId: "s2", name: "Bar · Nuit", time: "de 22h à 2h, jusqu'au lendemain", missing: 2 }] }]
const EMPTY = { withoutEmail: 0, toReview: [], coverage: COVERAGE }
const board = (extra: Partial<DraftBoardData> = {}): DraftBoardData => ({
  dates: ["2031-07-10", "2031-07-11"],
  rows: [row()],
  summary: {
    drafts: 1, people: 1, stale: 0, ackMissing: 1, withoutEmail: 0, toReview: [], coverage: COVERAGE,
    problems: [{ code: "ack_missing", draftId: "d1", volunteerId: "v-n", shiftId: "s2", message: "Nadia Rochat a indiqué ne pas être disponible : confirmez.", short: "A indiqué ne pas être disponible : confirmez.", anchor: "cell-v-n-2031-07-11", date: "2031-07-11" }],
    selection: [{ id: "d1", revision: 2 }],
  },
  collecting: true, protection: "off", scope: "event",
  ...extra,
})
const view = (data = board(), v: "grid" | "day" = "grid") => render(<DraftBoard eventId="evt" board={data} day="2031-07-11" view={v} scope="event" basePath="/admin/events/evt/availability/drafts" />)

describe("DraftBoard", () => {
  it("never repeats an id between the table and the day list", () => {
    const { container } = view()
    const all = [...container.querySelectorAll("[id]")].map((el) => el.id)
    expect(new Set(all).size).toBe(all.length)
    expect(container.querySelector("#grid-cell-v-n-2031-07-11")).not.toBeNull()
    expect(container.querySelector("#day-cell-v-n-2031-07-11")).not.toBeNull()
  })

  it("keeps the row header to the name, reads full dates, and names the cell buttons with person and date", () => {
    view()
    const table = screen.getByRole("table", { name: /Affectations par personne et par jour/ })
    expect(within(table.querySelector("tbody")!).getByRole("rowheader")).toHaveTextContent(/^Nadia Rochat$/)
    expect(within(table).getByRole("columnheader", { name: "Vendredi 11 juillet" })).toBeInTheDocument()
    expect(within(table).getByRole("button", { name: "Ajouter une affectation pour Nadia Rochat le vendredi 11 juillet" })).toBeInTheDocument()
    expect(within(table).getByRole("button", { name: /^Voir le brouillon, Nadia Rochat, Bar, Nuit, de 22h à 2h/ })).toBeInTheDocument()
  })

  it("links each blocking problem to the person and date, and holds the publish button with its reason", () => {
    view()
    expect(screen.getByRole("link", { name: "Nadia Rochat, vendredi 11 juillet" })).toHaveAttribute("href", expect.stringContaining("#grid-cell-v-n-2031-07-11"))
    const publish = screen.getByRole("button", { name: "Publier les affectations" })
    expect(publish).toHaveAttribute("aria-disabled", "true")
    expect(publish).toHaveAccessibleDescription("Réglez d'abord le point listé ci-dessus.")
    fireEvent.click(publish)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("publishes after a plain confirmation that counts people without email, then focuses a lasting result block", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ published: 3, people: 2 }) })
    view(board({ summary: { drafts: 3, people: 2, stale: 0, ackMissing: 0, ...EMPTY, withoutEmail: 1, problems: [], selection: [{ id: "d1", revision: 2 }] } }))
    fireEvent.click(screen.getByRole("button", { name: "Publier les affectations" }))
    const dialog = screen.getByRole("dialog", { name: "Publier les affectations ?" })
    expect(within(dialog).getByText(/^1 personne n'a pas d'adresse email\W+elles ne reçoivent rien, prévenez-les vous-même\.$/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "Publier" }))
    const block = await screen.findByRole("group", { name: "Publication faite" })
    await waitFor(() => expect(block).toHaveFocus())
    expect(block).toHaveAccessibleDescription(/^3 affectations publiées pour 2 personnes\..*1 personne n'a pas d'adresse email\W+prévenez-les vous-même\.$/)
    expect(within(block).getByRole("link", { name: "Voir les inscriptions" })).toHaveAttribute("href", "/admin/events/evt/registrations")
    // Said by the focused block only, never also by the status.
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("")
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.selection).toEqual([{ id: "d1", revision: 2 }])
    expect(body.idempotencyKey).toMatch(/.{8,}/)
    expect(refresh).toHaveBeenCalled()
  })

  it("shows a refusal as a focused block listing the problems the summary does not, not a second live region", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Rien n'a été publié : 1 point à régler.", code: "refused", problems: [{ code: "capacity", shiftId: "s9", message: "Bar : complet." }] }) })
    const before = board({ summary: { drafts: 1, people: 1, stale: 0, ackMissing: 0, ...EMPTY, problems: [], selection: [{ id: "d1", revision: 2 }] } })
    const r = view(before)
    fireEvent.click(screen.getByRole("button", { name: "Publier les affectations" }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    // The block waits for the page read again, so its words never change once focused.
    expect(screen.queryByRole("group", { name: "La publication n'a pas eu lieu" })).not.toBeInTheDocument()
    r.rerender(<DraftBoard eventId="evt" board={{ ...before }} day="2031-07-11" view="grid" scope="event" basePath="/admin/events/evt/availability/drafts" />)
    const block = await screen.findByRole("group", { name: "La publication n'a pas eu lieu" })
    await waitFor(() => expect(block).toHaveFocus())
    expect(block).toHaveAccessibleDescription(/^Rien n'a été publié\W+la situation a changé pendant la confirmation\. Points à régler\W+$/)
    expect(within(block).getByText("Bar : complet.")).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("adds a draft from a cell's choice of shifts, asking for the acknowledgement first", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ person: { firstName: "Nadia", lastName: "Rochat" }, options: [{ shiftId: "s3", name: "Accueil", time: "de 15h à 18h", occupied: 1, capacity: 3, fit: "outside", fitLabel: "Pas disponible à ces heures", fitDetail: "", ackKey: "a1|k3", taken: null, workload: [], drafted: 2 }] }) })
    view()
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /^Ajouter une affectation pour Nadia Rochat le vendredi 11 juillet/ }))
    const dialog = await screen.findByRole("dialog", { name: "Ajouter une affectation pour Nadia Rochat, vendredi 11 juillet" })
    await within(dialog).findByRole("heading", { level: 3, name: "Accueil, de 15h à 18h" })
    expect(within(dialog).getByText(/^1 place prise sur 3\W+2 brouillons déjà prévus$/)).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("1 créneau le vendredi 11 juillet."))
    const add = within(dialog).getByRole("button", { name: "Ajouter en brouillon : Accueil, de 15h à 18h" })
    fireEvent.click(add)
    const box = within(dialog).getByRole("checkbox", { name: /^Ajouter quand même\W+je sais que Nadia Rochat n'a pas indiqué/ })
    expect(box).toHaveFocus()
    expect(box).toHaveAttribute("aria-invalid", "true")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ draft: { id: "d9", revision: 1 } }) })
    fireEvent.click(box)
    fireEvent.click(add)
    await waitFor(() => expect(document.getElementById("option-added-s3")).toHaveFocus())
    expect(document.getElementById("option-added-s3")).toHaveTextContent(/^Brouillon ajouté\W+Accueil, de 15h à 18h\.$/)
    // Said once, by the focused sentence: the dialog's status keeps the list's count.
    expect(within(dialog).getByRole("status")).toHaveTextContent("1 créneau le vendredi 11 juillet.")
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ shiftId: "s3", volunteerId: "v-n", ackKey: "a1|k3" })
  })

  it("asks for the acknowledgement before recording a review, and sends its key once ticked", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ draft: { id: "d1", revision: 3 } }) })
    view()
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /^Voir le brouillon/ }))
    const dialog = screen.getByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer la relecture" }))
    expect(dialog).toHaveAccessibleName(/^Brouillon de Nadia Rochat\W+Bar, Nuit, vendredi 11 juillet, de 22h à 2h/)
    const box = within(dialog).getByRole("checkbox", { name: /^Garder ce brouillon\W+je sais que Nadia Rochat/ })
    expect(box).toHaveFocus()
    expect(box).toHaveAttribute("aria-invalid", "true")
    expect(box).toHaveAccessibleDescription(/Cochez cette case/)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(box)
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer la relecture" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ revision: 2, ackKey: "a1|key" })
  })

  it("removes a draft after a confirmation and puts focus back on the cell's « Ajouter »", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    view()
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /^Voir le brouillon/ }))
    const dialog = screen.getByRole("dialog")
    within(dialog).getByRole("button", { name: "Retirer ce brouillon" }).focus()
    fireEvent.click(within(dialog).getByRole("button", { name: "Retirer ce brouillon" }))
    // It asks first (a stacked confirmation, « Annuler » focused); nothing sent yet.
    const confirm = screen.getByRole("alertdialog", { name: "Retirer ce brouillon ?" })
    expect(within(confirm).getByRole("button", { name: "Annuler" })).toHaveFocus()
    // The draft's dialog below is inert while the confirmation is open (browse mode, rotor).
    expect(dialog).toHaveAttribute("inert")
    fireEvent.click(within(confirm).getByRole("button", { name: "Annuler" }))
    expect(dialog).not.toHaveAttribute("inert")
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Retirer ce brouillon" })).toHaveFocus())
    fireEvent.click(within(dialog).getByRole("button", { name: "Retirer ce brouillon" }))
    const again = screen.getByRole("alertdialog")
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(within(again).getByRole("button", { name: "Retirer le brouillon" }))
    await waitFor(() => expect(document.getElementById("grid-add-v-n-2031-07-11")).toHaveFocus())
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/events/evt/drafts/d1?revision=2")
    await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("Brouillon retiré : Nadia Rochat, Bar, Nuit, vendredi 11 juillet."))
  })

  it("offers the day view, with headings for the day and each person", () => {
    view(board(), "day")
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Vendredi 11 juillet" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 4, name: "Nadia Rochat" })).toBeInTheDocument()
    // The day's places to fill, shift by shift, above the people (PRODUCT.md capability 4).
    const coverage = document.getElementById("day-coverage")!
    expect(within(coverage).getByRole("heading", { level: 4, name: "À pourvoir ce jour" })).toBeInTheDocument()
    expect(coverage).toHaveTextContent(/Bar\W+Nuit, de 22h à 2h, jusqu'au lendemain\W+2 places à pourvoir/)
    expect(screen.getByRole("button", { name: "Par jour" })).toHaveAttribute("aria-pressed", "true")
  })
})

describe("DraftBoard with generated proposals (#1172)", () => {
  const proposed: BoardItem = { ...draftItem, draft: { ...draftItem.draft!, source: "proposal", locked: false } }
  const proposalBoard = () => board({ rows: [row({ cells: [{ date: "2031-07-11", availability: "Libre de 9h à 16h", availabilityKind: "ranges", items: [proposed] }] })] })

  it("says « Proposé », and the draft dialog locks it, stays open and says so", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ draft: { id: "d1", revision: 3, locked: true } }) })
    render(<DraftBoard eventId="evt" board={proposalBoard()} day="2031-07-11" view="grid" scope="event" basePath="/x" proposals />)
    const table = screen.getByRole("table", { name: /Affectations par personne et par jour/ })
    expect(within(table).getByText("Proposé")).toBeInTheDocument()
    // One pill for the kind: « Proposé » replaces « Brouillon » (independent review, P1 #5).
    expect(within(table).queryByText("Brouillon")).not.toBeInTheDocument()
    fireEvent.click(within(table).getByRole("button", { name: /^Voir le brouillon, Nadia Rochat.*, proposé, pas disponible à ces heures$/ }))
    const dialog = screen.getByRole("dialog")
    // Reviewing it would lock it: said before, on the button (independent review, P1 #6).
    expect(within(dialog).getByRole("button", { name: "Enregistrer la relecture" })).toHaveAccessibleDescription(/^Enregistrer la relecture verrouille ce brouillon\W+une nouvelle proposition ne le remplacera pas\.$/)
    expect(within(dialog).getByText("Ce brouillon n'est pas verrouillé.")).toBeInTheDocument()
    const lock = within(dialog).getByRole("button", { name: "Verrouiller" })
    expect(lock).toHaveAccessibleDescription("Une nouvelle proposition ne remplace jamais un brouillon verrouillé.")
    fireEvent.click(lock)
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Déverrouiller" })).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt/drafts/d1/lock", expect.objectContaining({ method: "POST", body: JSON.stringify({ revision: 2, locked: true }) }))
    expect(within(dialog).getByText("Ce brouillon est verrouillé.")).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Brouillon verrouillé."))
  })

  it("marks a locked draft with a lock and the word, apart from the grey « Brouillon » and « Proposé » pills (finding 10)", () => {
    const locked: BoardItem = { ...proposed, draft: { ...proposed.draft!, locked: true } }
    render(<DraftBoard eventId="evt" board={board({ rows: [row({ cells: [{ date: "2031-07-11", availability: "Libre", availabilityKind: "ranges", items: [locked] }] })] })} day="2031-07-11" view="grid" scope="event" basePath="/x" proposals />)
    const table = screen.getByRole("table", { name: /Affectations par personne et par jour/ })
    const chip = within(table).getByText("Verrouillé")
    expect(chip.querySelector("svg[aria-hidden='true']")).not.toBeNull()
    expect(chip.className).not.toBe(within(table).getByText("Proposé").className)
    expect(within(table).queryByText("Brouillon")).not.toBeInTheDocument()
    expect(chip.className).not.toMatch(/f3f4f6|blue/)
  })

  it("takes the draft's real state after a refused lock, in place (finding 12)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Ce brouillon a changé entre-temps." }) })
    const r = render(<DraftBoard eventId="evt" board={proposalBoard()} day="2031-07-11" view="grid" scope="event" basePath="/x" proposals />)
    fireEvent.click(within(screen.getByRole("table", { name: /Affectations par personne/ })).getByRole("button", { name: /^Voir le brouillon/ }))
    const dialog = screen.getByRole("dialog")
    const lock = within(dialog).getByRole("button", { name: "Verrouiller" })
    lock.focus()
    fireEvent.click(lock)
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Ce brouillon a changé entre-temps."))
    expect(refresh).toHaveBeenCalled()
    // The refresh brings the draft locked elsewhere, at a new revision.
    const lockedElsewhere: BoardItem = { ...proposed, draft: { ...proposed.draft!, locked: true, revision: 5 } }
    r.rerender(<DraftBoard eventId="evt" board={board({ rows: [row({ cells: [{ date: "2031-07-11", availability: "Libre", availabilityKind: "ranges", items: [lockedElsewhere] }] })] })} day="2031-07-11" view="grid" scope="event" basePath="/x" proposals />)
    const toggle = within(screen.getByRole("dialog")).getByRole("button", { name: "Déverrouiller" })
    expect(toggle).toBe(lock) // the same button, focus kept
    expect(toggle).toHaveFocus()
    expect(within(screen.getByRole("dialog")).getByText("Ce brouillon est verrouillé.")).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("Ce brouillon est verrouillé."))
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ draft: { id: "d1", revision: 6, locked: false } }) })
    fireEvent.click(toggle)
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/events/evt/drafts/d1/lock", expect.objectContaining({ body: JSON.stringify({ revision: 5, locked: false }) })))
  })

  it("offers no lock without proposals", () => {
    render(<DraftBoard eventId="evt" board={proposalBoard()} day="2031-07-11" view="grid" scope="event" basePath="/x" />)
    fireEvent.click(within(screen.getByRole("table", { name: /Affectations par personne/ })).getByRole("button", { name: /^Voir le brouillon/ }))
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Verrouiller" })).not.toBeInTheDocument()
  })
})

describe("DraftBoard: states, coverage and reviews (independent review)", () => {
  it("says availability outside the answer as its own warning line, not a pill, before the kind", () => {
    view()
    const table = screen.getByRole("table", { name: /Affectations par personne et par jour/ })
    const line = within(table).getByText("Pas disponible à ces heures")
    expect(line.tagName).toBe("P")
    expect(line.querySelector("svg[aria-hidden='true']")).not.toBeNull()
    expect(line.className).toMatch(/92400e/)
    expect(within(table).getByText("Brouillon").className).not.toMatch(/92400e/)
    expect(within(table).getByText("Confirmée")).toBeInTheDocument()
  })

  it("puts the places still to fill in a second header row, read with their date, linking to the day", () => {
    view()
    const table = screen.getByRole("table", { name: /places à pourvoir/ })
    const header = within(table).getByRole("rowheader", { name: "À pourvoir" })
    expect(header.closest("thead")).not.toBeNull()
    expect(within(table).getByText("Rien à pourvoir")).toBeInTheDocument()
    expect(within(table).getByRole("link", { name: "2 places à pourvoir, voir les créneaux du vendredi 11 juillet" })).toHaveAttribute("href", expect.stringMatching(/day=2031-07-11.*view=day.*#day-coverage$/))
  })

  it("names the problem's person in its link only, and a capacity problem links to its day", () => {
    view(board({ summary: { ...board().summary, problems: [...board().summary.problems, { code: "capacity", shiftId: "s2", message: "Bar, Nuit : 1 place, 0 déjà prise et 2 affectations à publier (Lou Tóth, Nadia Rochat).", anchor: null, date: "2031-07-11" }] } }))
    const items = screen.getByRole("heading", { level: 3, name: "2 points empêchent la publication" }).nextElementSibling!
    expect(items.querySelectorAll(":scope > li")[0]).toHaveTextContent(/^Nadia Rochat, vendredi 11 juillet\W+A indiqué ne pas être disponible/)
    expect(screen.getByRole("link", { name: "Vendredi 11 juillet" })).toHaveAttribute("href", expect.stringMatching(/day=2031-07-11.*view=day#day-coverage$/))
  })

  it("points a summary link that changes the day at the day list (below md)", () => {
    render(<DraftBoard eventId="evt" board={board()} day="2031-07-10" view="grid" scope="event" basePath="/x" />)
    expect(screen.getByRole("link", { name: "Nadia Rochat, vendredi 11 juillet" })).toHaveAttribute("href", "/x?day=2031-07-11#day-cell-v-n-2031-07-11")
  })

  it("marks a mission outside a corrected answer « à revoir », links to it and its registration, and marks it seen", async () => {
    const mission: BoardItem = { kind: "confirmed", shiftId: "s1", registrationId: "r1", name: "Bar", startTime: "10:00", time: "de 10h à 14h", fit: "outside", fitLabel: "Pas disponible à ces heures", fitDetail: "", review: "À revoir : actuellement en dehors de ses disponibilités corrigées." }
    const flagged = row({ reviewTexts: ["À revoir : disponibilités modifiées après la publication des affectations."], seenRevision: 4, cells: [{ date: "2031-07-11", availability: "Libre", availabilityKind: "ranges", items: [mission] }] })
    view(board({ rows: [flagged], summary: { ...board().summary, problems: [], toReview: [{ volunteerId: "v-n", date: "2031-07-11", name: "Bar", time: "de 10h à 14h" }] } }))
    expect(screen.getByRole("heading", { level: 3, name: "1 mission à revoir après une correction des disponibilités" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Nadia Rochat, vendredi 11 juillet" })).toBeInTheDocument()
    const table = screen.getByRole("table", { name: /Affectations par personne et par jour/ })
    expect(within(table).getByText("À revoir : actuellement en dehors de ses disponibilités corrigées.")).toBeInTheDocument()
    expect(within(table).getByRole("link", { name: "Voir l'inscription, Nadia Rochat, Bar, vendredi 11 juillet" })).toHaveAttribute("href", "/admin/events/evt/registrations?shift=s1&q=Nadia+Rochat")
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    fireEvent.click(within(table).getByRole("button", { name: /^Marquer comme vu\W*: disponibilités de Nadia Rochat$/ }))
    await waitFor(() => expect(document.getElementById("grid-row-v-n")).toHaveFocus())
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt/availability/v-n/review", expect.objectContaining({ method: "POST", body: JSON.stringify({ revision: 4 }) }))
    await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("Disponibilités de Nadia Rochat marquées comme vues."))
    expect(refresh).toHaveBeenCalled()
  })

  it("elides the person in the dialog's title", () => {
    const emma = row({ firstName: "Emma", lastName: "Johansson" })
    view(board({ rows: [emma] }))
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /^Voir le brouillon/ }))
    expect(screen.getByRole("dialog")).toHaveAccessibleName(/^Brouillon d'Emma Johansson\W+Bar, Nuit/)
  })

  it("shows short blocking markers in the cell and the Résumé, the sentences staying in the summary and the dialog", () => {
    const blocked: BoardItem = { ...draftItem, draft: { ...draftItem.draft!, problems: ["Nadia Rochat : Bar, Nuit chevauche Bar, déjà prévu."], markers: ["Bloque la publication : chevauchement"] } }
    view(board({ rows: [row({ markers: ["Bloque la publication : pauses et charge"], findings: ["Plus de 10 h de service sur la journée."], cells: [{ date: "2031-07-11", availability: "Libre", availabilityKind: "ranges", items: [blocked] }] })] }))
    const table = screen.getByRole("table", { name: /Affectations par personne et par jour/ })
    expect(within(table).getByText(/^Bloque la publication\W+chevauchement$/)).toBeInTheDocument()
    expect(within(table).getByText(/^Bloque la publication\W+pauses et charge$/)).toBeInTheDocument()
    expect(within(table).queryByText(/chevauche Bar, déjà prévu/)).not.toBeInTheDocument()
  })
})

