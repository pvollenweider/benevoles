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
  kind: "draft", shiftId: "s2", name: "Bar · Nuit", time: "de 22h à 2h, jusqu'au lendemain", fit: "outside", fitLabel: "Pas disponible à ces heures", fitDetail: "",
  draft: { id: "d1", revision: 2, source: "manual", stale: false, staleText: null, ackKey: "a1|key", acked: false, problems: ["Nadia Rochat a indiqué ne pas être disponible : confirmez."] },
}
const row = (extra: Partial<BoardRow> = {}): BoardRow => ({
  volunteerId: "v-n", firstName: "Nadia", lastName: "Rochat", sameNameHint: null, reviewTexts: [], committedMinutes: 240, draftMinutes: 240, findings: [], problemCount: 1,
  cells: [
    { date: "2031-07-10", availability: "Pas disponible", availabilityKind: "unavailable", items: [] },
    { date: "2031-07-11", availability: "Libre de 9h à 16h", availabilityKind: "ranges", items: [{ kind: "confirmed", shiftId: "s1", name: "Bar", time: "de 10h à 14h", fit: "full", fitLabel: "Disponible sur tout le créneau", fitDetail: "" }, draftItem] },
  ],
  ...extra,
})
const board = (extra: Partial<DraftBoardData> = {}): DraftBoardData => ({
  dates: ["2031-07-10", "2031-07-11"],
  rows: [row()],
  summary: {
    drafts: 1, people: 1, stale: 0, ackMissing: 1,
    problems: [{ code: "ack_missing", draftId: "d1", volunteerId: "v-n", shiftId: "s2", message: "Nadia Rochat a indiqué ne pas être disponible : confirmez.", anchor: "cell-v-n-2031-07-11" }],
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
    expect(within(table).getByRole("rowheader")).toHaveTextContent(/^Nadia Rochat$/)
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

  it("publishes after a plain confirmation, then focuses the section and says what was published", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ published: 3, people: 2 }) })
    view(board({ summary: { drafts: 3, people: 2, stale: 0, ackMissing: 0, problems: [], selection: [{ id: "d1", revision: 2 }] } }))
    fireEvent.click(screen.getByRole("button", { name: "Publier les affectations" }))
    const dialog = screen.getByRole("dialog", { name: "Publier les affectations ?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Publier" }))
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Publier les affectations" })).toHaveFocus())
    await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("3 affectations publiées pour 2 personnes."))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.selection).toEqual([{ id: "d1", revision: 2 }])
    expect(body.idempotencyKey).toMatch(/.{8,}/)
    expect(refresh).toHaveBeenCalled()
  })

  it("shows a refusal as a focused block listing every problem, not a second live region", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Publication impossible : 1 point à corriger. Rien n'a été publié.", code: "refused", problems: [{ code: "capacity", message: "Bar : complet." }] }) })
    view(board({ summary: { drafts: 1, people: 1, stale: 0, ackMissing: 0, problems: [], selection: [{ id: "d1", revision: 2 }] } }))
    fireEvent.click(screen.getByRole("button", { name: "Publier les affectations" }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Publier" }))
    const heading = await screen.findByRole("heading", { level: 3, name: "La publication n'a pas eu lieu" })
    expect(heading).toHaveFocus()
    expect(screen.getByText("Bar : complet.")).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("adds a draft from a cell's choice of shifts, asking for the acknowledgement first", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ person: { firstName: "Nadia", lastName: "Rochat" }, options: [{ shiftId: "s3", name: "Accueil", time: "de 15h à 18h", occupied: 1, capacity: 3, fit: "outside", fitLabel: "Pas disponible à ces heures", fitDetail: "", ackKey: "a1|k3", taken: null, workload: [] }] }) })
    view()
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /^Ajouter une affectation pour Nadia Rochat le vendredi 11 juillet/ }))
    const dialog = await screen.findByRole("dialog", { name: "Ajouter une affectation pour Nadia Rochat, vendredi 11 juillet" })
    await within(dialog).findByRole("heading", { level: 3, name: "Accueil, de 15h à 18h" })
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("1 créneau le vendredi 11 juillet."))
    const add = within(dialog).getByRole("button", { name: "Ajouter en brouillon : Accueil, de 15h à 18h" })
    fireEvent.click(add)
    const box = within(dialog).getByRole("checkbox", { name: /je sais que Nadia Rochat n'a pas indiqué/ })
    expect(box).toHaveFocus()
    expect(box).toHaveAttribute("aria-invalid", "true")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ draft: { id: "d9", revision: 1 } }) })
    fireEvent.click(box)
    fireEvent.click(add)
    await waitFor(() => expect(within(dialog).getByText("Brouillon ajouté.")).toHaveFocus())
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ shiftId: "s3", volunteerId: "v-n", ackKey: "a1|k3" })
  })

  it("asks for the acknowledgement before recording a review, and sends its key once ticked", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ draft: { id: "d1", revision: 3 } }) })
    view()
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /^Voir le brouillon/ }))
    const dialog = screen.getByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer la relecture" }))
    const box = within(dialog).getByRole("checkbox", { name: /Publier quand même : je sais que Nadia Rochat/ })
    expect(box).toHaveFocus()
    expect(box).toHaveAttribute("aria-invalid", "true")
    expect(box).toHaveAccessibleDescription(/Cochez cette case/)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(box)
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer la relecture" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ revision: 2, ackKey: "a1|key" })
  })

  it("removes a draft and puts focus back on the cell's « Ajouter »", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    view()
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /^Voir le brouillon/ }))
    const dialog = screen.getByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Retirer ce brouillon" }))
    await waitFor(() => expect(document.getElementById("grid-add-v-n-2031-07-11")).toHaveFocus())
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/events/evt/drafts/d1?revision=2")
    await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("Brouillon retiré : Nadia Rochat, Bar, Nuit, vendredi 11 juillet."))
  })

  it("offers the day view, with headings for the day and each person", () => {
    view(board(), "day")
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Vendredi 11 juillet" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 4, name: "Nadia Rochat" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Par jour" })).toHaveAttribute("aria-pressed", "true")
  })
})
