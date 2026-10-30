/**
 * @vitest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within, act } from "@testing-library/react"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import ProposalWorkspace from "../admin/ProposalWorkspace"
import type { ProposalPageData } from "@/lib/proposal-page-data"

// « Proposition d'affectations » (#1172): the form, the launch, the follow-up and the result.
const fetchMock = vi.fn()
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); refresh.mockReset(); vi.stubGlobal("crypto", { randomUUID: () => "uuid-12345678" }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

const data = (extra: Partial<ProposalPageData> = {}): ProposalPageData => ({
  eventId: "evt",
  dates: ["2031-07-10", "2031-07-11"],
  shifts: [
    { id: "s1", roleName: "Camion 1", label: "Camion 1", date: "2031-07-10", startTime: "09:00", endTime: "15:00", capacity: 2, held: 0, sector: null, open: true },
    { id: "s2", roleName: "Renfort", label: "Renfort", date: "2031-07-11", startTime: "12:00", endTime: "18:00", capacity: 1, held: 0, sector: null, open: true },
  ],
  postes: [{ roleName: "Camion 1", sector: null, capacity: 2 }, { roleName: "Renfort", sector: null, capacity: 1 }],
  people: [
    { volunteerId: "v1", firstName: "Léa", lastName: "Favre", answered: true, targetMinutes: null, targetRevision: null, suggestionMinutes: 720 },
    { volunteerId: "v2", firstName: "Marco", lastName: "Rossi", answered: false, targetMinutes: 360, targetRevision: 2, suggestionMinutes: 0 },
  ],
  protection: "on", maxEventMinutes: 2880, lastConfiguration: null, runs: [], run: null,
  names: { v1: "Léa Favre", v2: "Marco Rossi" }, shiftWords: { s1: "Camion 1, jeudi 10 juillet, de 9h à 15h", s2: "Renfort, vendredi 11 juillet, de 12h à 18h" },
  ...extra,
})
const view = (d = data()) => render(<ProposalWorkspace data={d} suggestedSeed={42} eventInfoHref="/admin/events/evt/edit" draftsHref="/admin/events/evt/availability/drafts" basePath="/admin/events/evt/availability/proposal" />)
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body })
const status = () => document.querySelector('p[role="status"]')!

const baseRun = {
  id: "run-1", seed: 42, createdAt: new Date("2031-06-01T10:00:00Z"), startedAt: null, finishedAt: null, writtenAt: null, writtenCount: 0, droppedCount: 0, progress: null,
  configuration: null, written: null, stale: [], cancelRequested: false, stopReason: null, outcome: null, report: null,
}
const report = {
  version: 1, outcome: "complete", execution: "finished", stopReason: "budget", certificates: [],
  assignments: [{ shiftId: "s1", volunteerId: "v1", seat: "critical", plannedMinutes: 360, targetMinutes: 720, otherCategoryThanDayBefore: false, preferred: false, avoided: false }],
  gaps: [], people: [{ volunteerId: "v1", targetMinutes: 720, plannedMinutes: 360, generatedMinutes: 360, generated: 1, gapMinutes: -360, categories: [{ category: "poste:Camion 1", days: 1 }], nightAddOns: 0 }],
  coverage: { seats: 3, filled: 3, criticalSeats: 3, criticalFilled: 3, reserveSeats: 0, reserveFilled: 0 },
}

describe("ProposalWorkspace", () => {
  it("labels every field of the people table by its column and row headers", () => {
    view()
    const table = screen.getByRole("table", { name: /Personnes à inclure/ })
    expect(within(table).getByRole("checkbox", { name: "Inclure Léa Favre" })).toBeChecked()
    expect(within(table).getByRole("checkbox", { name: "Inclure Marco Rossi" })).not.toBeChecked() // never answered
    expect(within(table).getByRole("textbox", { name: "Objectif d'heures Marco Rossi" })).toHaveValue("6")
    expect(within(table).getByRole("combobox", { name: "Poste à éviter Léa Favre" })).toBeInTheDocument()
    const postes = screen.getByRole("table", { name: /Catégorie de rotation, ajout de nuit et réserve/ })
    expect(within(postes).getByRole("textbox", { name: "Réserve à garder par créneau Renfort" })).toHaveAccessibleDescription("0 à 1")
    expect(within(postes).getByRole("textbox", { name: "Catégorie de rotation Camion 1" })).toBeInTheDocument() // a poste name with a space
    expect(within(postes).getByRole("checkbox", { name: "Ajout de nuit Camion 1" })).toBeInTheDocument()
  })

  it("fills the suggestion for the people included and says how many changed", async () => {
    view()
    fireEvent.click(screen.getByRole("button", { name: /^Appliquer la suggestion/ }))
    expect(within(screen.getByRole("table", { name: /Personnes à inclure/ })).getByRole("textbox", { name: "Objectif d'heures Léa Favre" })).toHaveValue("12")
    await waitFor(() => expect(status()).toHaveTextContent("Objectif rempli pour 1 personne ; 0 inchangé."))
  })

  it("keeps the launch button focusable with its reason when the protection is off", () => {
    view(data({ protection: "off" }))
    const launch = screen.getByRole("button", { name: "Générer une proposition" })
    expect(launch).toHaveAttribute("aria-disabled", "true")
    expect(launch).not.toBeDisabled()
    expect(launch).toHaveAccessibleDescription(/protection des pauses et de la charge n'est pas activée/)
    fireEvent.click(launch)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("link", { name: "Activer la protection dans les informations de l'événement" })).toHaveAttribute("href", "/admin/events/evt/edit")
  })

  it("lists the problems as links to the fields and focuses them, launching nothing", () => {
    view()
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }))
    const heading = screen.getByRole("heading", { name: "1 point à corriger" })
    expect(heading).toHaveFocus()
    expect(screen.getByRole("link", { name: /^Léa Favre : indiquez un objectif en heures/ })).toHaveAttribute("href", "#target-v1")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("saves the targets, launches, focuses the run heading, and announces each change of state once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock
      .mockResolvedValueOnce(ok({ saved: 1, removed: 0 })) // targets
      .mockResolvedValueOnce(ok({ runId: "run-1", replay: false, notice: null }, 202))
      .mockResolvedValueOnce(ok({ run: { ...baseRun, status: "queued" } }))
      .mockResolvedValueOnce(ok({ run: { ...baseRun, status: "running", progress: { evaluations: 1000 } } }))
      .mockResolvedValueOnce(ok({ run: { ...baseRun, status: "running", progress: { evaluations: 2000 } } }))
      .mockResolvedValue(ok({ run: { ...baseRun, status: "finished", outcome: "complete", writtenAt: new Date(), writtenCount: 1, report } }))
    view()
    fireEvent.change(within(screen.getByRole("table", { name: /Personnes à inclure/ })).getByRole("textbox", { name: "Objectif d'heures Léa Favre" }), { target: { value: "7,5" } })
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Proposition en cours" })).toHaveFocus())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ targets: [{ volunteerId: "v1", targetMinutes: 450, revision: null }] })
    const launched = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(launched).toMatchObject({ idempotencyKey: "uuid-12345678", configuration: { scope: { shiftIds: ["s1", "s2"], volunteerIds: ["v1"] }, seed: 42 } })
    expect(screen.getByRole("button", { name: "Arrêter la recherche" })).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_600) })
    await waitFor(() => expect(status()).toHaveTextContent("Proposition : calcul en cours."))
    await act(async () => { await vi.advanceTimersByTimeAsync(1_600) })
    expect(status()).toHaveTextContent("Proposition : calcul en cours.") // progress alone is not announced
    await act(async () => { await vi.advanceTimersByTimeAsync(1_600) })
    await waitFor(() => expect(status()).toHaveTextContent("Proposition terminée : complet. 3 places couvertes sur 3. 1 affectation écrite en brouillon."))
    expect(screen.getByRole("heading", { name: "Résultat de la proposition" })).toBeInTheDocument()
    expect(screen.getByText("Complet")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Voir les affectations en brouillon" })).toBeInTheDocument()
  })

  it("keeps its state when the server sends the same run again, and focuses the result when another run is shown", () => {
    const first = { ...baseRun, status: "finished", outcome: "complete", writtenAt: new Date(), writtenCount: 1, report }
    const r = render(<ProposalWorkspace data={data({ run: first as never })} suggestedSeed={42} eventInfoHref="/e" draftsHref="/d" basePath="/b" />)
    fireEvent.change(within(screen.getByRole("table", { name: /Personnes à inclure/ })).getByRole("textbox", { name: "Objectif d'heures Léa Favre" }), { target: { value: "9" } })
    r.rerender(<ProposalWorkspace data={data({ run: { ...first } as never })} suggestedSeed={42} eventInfoHref="/e" draftsHref="/d" basePath="/b" />)
    expect(within(screen.getByRole("table", { name: /Personnes à inclure/ })).getByRole("textbox", { name: "Objectif d'heures Léa Favre" })).toHaveValue("9")
    r.rerender(<ProposalWorkspace data={data({ run: { ...first, id: "run-2", seed: 7 } as never })} suggestedSeed={42} eventInfoHref="/e" draftsHref="/d" basePath="/b" />)
    expect(screen.getByRole("heading", { name: "Résultat de la proposition" })).toHaveFocus()
    expect(screen.getByText(/graine 7\./)).toBeInTheDocument()
  })

  it("shows a stored interrupted run without announcing it, and writes its partial result only after confirmation", async () => {
    const run = { ...baseRun, status: "interrupted", stopReason: "cancelled", outcome: "complete", report }
    fetchMock.mockResolvedValueOnce(ok({ replay: false, written: 1, dropped: 0 })).mockResolvedValueOnce(ok({ run: { ...run, writtenAt: new Date(), writtenCount: 1 } }))
    view(data({ run: run as never, runs: [{ id: "run-1", status: "interrupted", stopReason: "cancelled", outcome: "complete", seed: 42, createdAt: new Date("2031-06-01T10:00:00Z"), finishedAt: null, writtenAt: null, writtenCount: 0, droppedCount: 0 }] }))
    expect(status()).toHaveTextContent("")
    expect(screen.getByText("Recherche interrompue")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /rien d'écrit/ })).toHaveAttribute("aria-current", "page")
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce résultat partiel" }))
    const dialog = screen.getByRole("dialog", { name: "Utiliser ce résultat partiel ?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Écrire dans les brouillons" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Résultat de la proposition" })).toHaveFocus())
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt/proposals/run-1/write", { method: "POST" })
    await waitFor(() => expect(status()).toHaveTextContent("1 affectation écrite en brouillon."))
  })
})
