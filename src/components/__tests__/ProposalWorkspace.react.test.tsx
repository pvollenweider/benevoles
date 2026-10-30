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
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); refresh.mockReset(); vi.stubGlobal("crypto", { randomUUID: () => "uuid-12345678" }) })
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
  protection: "on", maxEventMinutes: 2880, lastConfiguration: null, runs: [], proposedByShift: {}, run: null,
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
    expect(within(postes).getByRole("textbox", { name: "Réserve à garder par créneau Renfort" })).toHaveAccessibleDescription(/^0 à 1 Réserve\s: /)
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
    expect(screen.getByRole("link", { name: /^Léa Favre\s: indiquez un objectif en heures/ })).toHaveAttribute("href", "#target-v1")
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
    await waitFor(() => expect(status()).toHaveTextContent("Proposition terminée : toutes les places couvertes. 3 places couvertes sur 3. 1 affectation écrite en brouillon."))
    expect(screen.getByRole("heading", { name: "Résultat de la proposition" })).toBeInTheDocument()
    expect(screen.getByText("Toutes les places couvertes")).toBeInTheDocument()
    expect(screen.getByText("3 places couvertes sur 3")).toBeInTheDocument()
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
    expect(screen.getByText(/tirage n° 7\./)).toBeInTheDocument()
  })

  it("shows a stored interrupted run without announcing it, and writes its partial result only after confirmation", async () => {
    const run = { ...baseRun, status: "interrupted", stopReason: "cancelled", outcome: "complete", report }
    fetchMock.mockResolvedValueOnce(ok({ replay: false, written: 1, dropped: 0 })).mockResolvedValueOnce(ok({ run: { ...run, writtenAt: new Date(), writtenCount: 1 } }))
    view(data({ run: run as never, runs: [{ id: "run-1", status: "interrupted", stopReason: "cancelled", outcome: "complete", seed: 42, createdAt: new Date("2031-06-01T10:00:00Z"), finishedAt: null, writtenAt: null, writtenCount: 0, droppedCount: 0, coverage: { filled: 3, seats: 3 } }] }))
    expect(status()).toHaveTextContent("")
    expect(screen.getByText("Calcul arrêté avant la fin")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /3 places couvertes sur 3, tirage 42, rien d'écrit/ })).toHaveAttribute("aria-current", "page")
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce résultat partiel" }))
    const dialog = screen.getByRole("dialog", { name: "Utiliser ce résultat partiel ?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Écrire dans les brouillons" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Résultat de la proposition" })).toHaveFocus())
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt/proposals/run-1/write", { method: "POST" })
    await waitFor(() => expect(status()).toHaveTextContent("1 affectation écrite en brouillon."))
  })

  // Independent review of #1172: findings 1, 2, 5, 6, 7, 8, 11, 13.
  const twoMissing = () => data({ people: [
    { volunteerId: "v1", firstName: "Léa", lastName: "Favre", answered: true, targetMinutes: null, targetRevision: null, suggestionMinutes: 720 },
    { volunteerId: "v3", firstName: "Noah", lastName: "De Jong", answered: true, targetMinutes: null, targetRevision: null, suggestionMinutes: 360 },
    { volunteerId: "v2", firstName: "Marco", lastName: "Rossi", answered: true, targetMinutes: null, targetRevision: null, suggestionMinutes: 0 },
  ], names: { v1: "Léa Favre", v2: "Marco Rossi", v3: "Noah De Jong" } })

  it("collapses the people without a target into one item whose button fills only the empty targets", async () => {
    view(twoMissing())
    const table = screen.getByRole("table", { name: /Personnes à inclure/ })
    fireEvent.change(within(table).getByRole("textbox", { name: "Objectif d'heures Marco Rossi" }), { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }))
    expect(screen.getByRole("heading", { name: "1 point à corriger" })).toHaveFocus()
    expect(screen.getByRole("link", { name: "2 personnes sans objectif d'heures" })).toHaveAttribute("href", "#target-v1")
    expect(within(table).getByRole("textbox", { name: "Objectif d'heures Léa Favre" })).toHaveAttribute("aria-invalid", "true")
    expect(within(table).getByRole("textbox", { name: "Objectif d'heures Léa Favre" })).toHaveAccessibleDescription(/Objectif à indiquer \(0 pour aucun\)\. Suggestion\s: 12 h\./)
    fireEvent.click(screen.getByRole("button", { name: "Appliquer la suggestion aux 2 personnes sans objectif" }))
    expect(within(table).getByRole("textbox", { name: "Objectif d'heures Léa Favre" })).toHaveValue("12")
    expect(within(table).getByRole("textbox", { name: "Objectif d'heures Noah De Jong" })).toHaveValue("6")
    expect(within(table).getByRole("textbox", { name: "Objectif d'heures Marco Rossi" })).toHaveValue("3") // typed, kept
    expect(screen.queryByRole("heading", { name: /point à corriger/ })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Personnes et objectifs d'heures" })).toHaveFocus()
    await waitFor(() => expect(status()).toHaveTextContent("Objectif suggéré appliqué à 2 personnes."))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("clears a field's problem as soon as it changes, without moving the focus", () => {
    view(twoMissing())
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }))
    const table = screen.getByRole("table", { name: /Personnes à inclure/ })
    fireEvent.change(within(table).getByRole("textbox", { name: "Objectif d'heures Léa Favre" }), { target: { value: "8" } })
    expect(within(table).getByRole("textbox", { name: "Objectif d'heures Léa Favre" })).not.toHaveAttribute("aria-invalid")
    expect(screen.getByRole("link", { name: "2 personnes sans objectif d'heures" })).toBeInTheDocument()
  })

  it("leads a rotation category error to its field, opening the folded settings (finding 2)", () => {
    const d = data({ people: [{ ...data().people[0], targetMinutes: 600 }] })
    view(d)
    const postes = screen.getByRole("table", { name: /Catégorie de rotation, ajout de nuit et réserve/ })
    fireEvent.change(within(postes).getByRole("textbox", { name: "Catégorie de rotation Camion 1" }), { target: { value: "x".repeat(81) } })
    const field = within(postes).getByRole("textbox", { name: "Catégorie de rotation Camion 1" })
    expect(field).toHaveAttribute("maxLength", "80")
    expect(field).toHaveAttribute("id", "category-0")
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }))
    const details = document.getElementById("proposal-rotation") as HTMLDetailsElement
    expect(details.open).toBe(true)
    details.open = false
    const link = screen.getByRole("link", { name: /Camion 1\s: un nom de catégorie tient en 80 caractères/ })
    fireEvent.click(link)
    expect(details.open).toBe(true)
    expect(field).toHaveFocus()
    expect(field).toHaveAttribute("aria-invalid", "true")
  })

  it("sums up the folded rotation settings and renames the rotation shortcut", () => {
    view()
    expect(screen.getByText("Rotation, nuit et réserve (facultatif)").closest("summary")).toHaveTextContent("Aucun réglage")
    fireEvent.click(screen.getByRole("button", { name: "Remplir avec 2 jours d'affilée et 2 ajouts de nuit au plus" }))
    expect(screen.getByText("Rotation, nuit et réserve (facultatif)").closest("summary")).toHaveTextContent("2 jours d'affilée au plus, 2 ajouts de nuit par personne au plus")
    expect(screen.getByRole("textbox", { name: "Numéro de tirage" })).toHaveAccessibleDescription(/Même numéro et mêmes données\s: même proposition\./)
  })

  it("asks before replacing proposed drafts of the scope, and launches only after confirmation (finding 6)", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ runId: "run-1", replay: false, notice: null }, 202))
      .mockResolvedValue(ok({ run: { ...baseRun, status: "queued" } }))
    view(data({ proposedByShift: { s1: 2, other: 4 }, people: [{ ...data().people[0], targetMinutes: 600 }] }))
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }))
    const dialog = screen.getByRole("alertdialog", { name: "Remplacer 2 brouillons proposés ?" })
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }))
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remplacer et générer" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Proposition en cours" })).toHaveFocus())
    expect(fetchMock.mock.calls.some((c) => c[0] === "/api/admin/events/evt/proposals")).toBe(true)
  })

  it("launches without asking when no proposed draft is in the scope", async () => {
    fetchMock.mockResolvedValueOnce(ok({ runId: "run-1", replay: false, notice: null }, 202)).mockResolvedValue(ok({ run: { ...baseRun, status: "queued" } }))
    view(data({ proposedByShift: { other: 4 }, people: [{ ...data().people[0], targetMinutes: 600 }] }))
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("heading", { name: "Proposition en cours" })).toHaveFocus())
  })

  it("says visibly when a launched run cannot be read back (finding 5)", async () => {
    fetchMock.mockResolvedValueOnce(ok({ runId: "run-9", replay: false, notice: null }, 202)).mockResolvedValueOnce(ok({ error: "x" }, 500))
    view(data({ people: [{ ...data().people[0], targetMinutes: 600 }] }))
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("La proposition est lancée, mais son suivi ne s'affiche pas"))
    expect(screen.getByRole("button", { name: "Recharger la page" })).toHaveFocus()
    expect(refresh).toHaveBeenCalled()
  })

  it("says visibly when following a run fails, once (finding 5)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock.mockRejectedValue(new Error("offline"))
    view(data({ run: { ...baseRun, status: "running" } as never }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3_200) })
    const alerts = screen.getAllByRole("alert").filter((a) => a.textContent?.includes("Le suivi du calcul est interrompu"))
    expect(alerts).toHaveLength(1)
    expect(status()).not.toHaveTextContent("interrompu")
  })

  it("after a stop, moves the focus to the result heading, not to the partial-result button (finding 11)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock
      .mockResolvedValueOnce(ok({ ok: true })) // cancel
      .mockResolvedValue(ok({ run: { ...baseRun, status: "interrupted", stopReason: "cancelled", outcome: "complete", report } }))
    view(data({ run: { ...baseRun, status: "running" } as never }))
    const stop = screen.getByRole("button", { name: "Arrêter la recherche" })
    stop.focus()
    fireEvent.click(stop)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_600) })
    await waitFor(() => expect(screen.getByRole("heading", { name: "Résultat de la proposition" })).toHaveFocus())
    expect(screen.getByRole("button", { name: "Utiliser ce résultat partiel" })).not.toHaveFocus()
  })

  it("shows the end, not a refusal, when a stop arrives after the computation ended", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ error: "Cette proposition est déjà écrite dans les brouillons." }, 409))
      .mockResolvedValue(ok({ run: { ...baseRun, status: "finished", outcome: "complete", writtenAt: new Date(), writtenCount: 1, report } }))
    view(data({ run: { ...baseRun, status: "running" } as never }))
    fireEvent.click(screen.getByRole("button", { name: "Arrêter la recherche" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Résultat de la proposition" })).toHaveFocus())
    expect(screen.queryByText("Cette proposition est déjà écrite dans les brouillons.")).not.toBeInTheDocument()
  })

  it("offers to relaunch first when the data changed since a partial result, and says when nothing was written (finding 7)", async () => {
    const run = { ...baseRun, status: "interrupted", stopReason: "cancelled", outcome: "complete", report, stale: ["availability"] }
    fetchMock.mockResolvedValueOnce(ok({ replay: false, written: 0, dropped: 1 })).mockResolvedValueOnce(ok({ run: { ...run, writtenAt: new Date(), writtenCount: 0 } }))
    view(data({ run: run as never }))
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce résultat partiel" }))
    const dialog = screen.getByRole("dialog", { name: "Les données ont changé depuis ce calcul" })
    const buttons = within(dialog).getAllByRole("button").map((b) => b.textContent)
    expect(buttons.slice(-3)).toEqual(["Annuler", "Écrire quand même", "Relancer la proposition"])
    fireEvent.click(within(dialog).getByRole("button", { name: "Écrire quand même" }))
    await waitFor(() => expect(screen.getByText(/Aucune affectation n'a été écrite\s: toutes ont été écartées/)).toBeInTheDocument())
    await waitFor(() => expect(status()).toHaveTextContent("Aucune affectation écrite"))
  })

  it("keeps « Relancer la proposition » as is when « Écrire quand même » fails", async () => {
    const run = { ...baseRun, status: "interrupted", stopReason: "cancelled", outcome: "complete", report, stale: ["availability"] }
    fetchMock.mockResolvedValueOnce(ok({ error: "L'écriture n'a pas abouti." }, 409))
    view(data({ run: run as never }))
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce résultat partiel" }))
    const dialog = screen.getByRole("dialog", { name: "Les données ont changé depuis ce calcul" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Écrire quand même" }))
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("L'écriture n'a pas abouti."))
    expect(within(dialog).getByRole("button", { name: "Relancer la proposition" })).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Écrire quand même : réessayer" })).toBeInTheDocument()
  })

  it("names each control of the phone layout with its person or poste, and lists the load without a table (findings 8, 13)", () => {
    view(data({ run: { ...baseRun, status: "finished", outcome: "complete", writtenAt: new Date(), writtenCount: 1, report } as never }))
    const cards = screen.getByRole("group", { name: "Léa Favre" })
    expect(within(cards).getByRole("checkbox", { name: "Inclure Léa Favre" })).toBeInTheDocument()
    expect(within(cards).getByRole("textbox", { name: "Objectif d'heures Léa Favre" })).toBeInTheDocument()
    expect(within(cards).getByRole("combobox", { name: "Poste souhaité Léa Favre" })).toBeInTheDocument()
    expect(screen.getAllByRole("checkbox", { name: "Ajout de nuit Renfort" }).length).toBe(2)
    const load = screen.getByRole("list", { name: "Charge par personne" })
    expect(within(load).getByText("Léa Favre")).toBeInTheDocument()
    expect(within(load).getByText(/6 h prévues pour un objectif de 12 h/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Passer le tableau de charge" })).toHaveAttribute("href", "#proposal-assignments")
  })

  it("shows the result before the form and leads with the coverage, in plain words (findings 3, 4)", () => {
    const proven = { ...report, outcome: "proven_impossible", coverage: { ...report.coverage, seats: 31, filled: 29 } }
    view(data({ run: { ...baseRun, status: "finished", outcome: "proven_impossible", writtenAt: new Date(), writtenCount: 29, report: proven } as never }))
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    expect(headings.slice(0, 2)).toEqual(["Résultat de la proposition", "Nouvelle proposition"])
    expect(screen.getByText("29 places couvertes sur 31")).toBeInTheDocument()
    const badge = screen.getByText("Couverture complète impossible")
    expect(badge.className).not.toMatch(/fee2e2|b91c1c/)
    expect(screen.queryByText(/Impossible démontré|graine|Aller au résultat/i)).not.toBeInTheDocument()
  })

  it("puts a no-break space before « : ; ? ! » and inside « » in every text the page shows (French typography)", async () => {
    const bad = /[ \t\n][:;?!]|« | »/
    const scan = () => {
      const texts = [document.body.textContent ?? "", ...[...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? "")]
      return texts.flatMap((t) => (t.match(new RegExp(`.{0,30}(${bad.source}).{0,10}`, "g")) ?? []))
    }
    const gapReport = {
      ...report, outcome: "proven_impossible",
      gaps: [{ shiftId: "s2", missing: 1, missingCritical: 1, reserveMissing: 0, eligible: 0, excluded: { no_answer: 1 }, blocked: {}, workloadRules: {}, proven: true }],
      coverage: { seats: 4, filled: 3, criticalSeats: 2, criticalFilled: 2, reserveSeats: 1, reserveFilled: 0 },
    }
    const finished = { ...baseRun, status: "finished", outcome: "proven_impossible", writtenAt: new Date(), writtenCount: 1, report: gapReport, stale: ["availability"], written: { created: [], dropped: [{ shiftId: "s1", volunteerId: "v1", reason: "capacity" }], replaced: ["d"] } }
    const runs = [{ id: "run-1", status: "finished", stopReason: null, outcome: "proven_impossible", seed: 42, createdAt: new Date("2031-06-01T10:00:00Z"), finishedAt: null, writtenAt: new Date(), writtenCount: 1, droppedCount: 0, coverage: { filled: 3, seats: 4 } }]
    const r = render(<ProposalWorkspace data={data({ run: finished as never, runs, proposedByShift: { s1: 1 }, protection: "incomplete" })} suggestedSeed={42} eventInfoHref="/e" draftsHref="/d" basePath="/b" />)
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }))
    expect(scan()).toEqual([])
    r.unmount()
    // The form's errors, with every kind of problem.
    view(twoMissing())
    fireEvent.change(screen.getAllByRole("textbox", { name: "Numéro de tirage" })[0], { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }))
    expect(scan()).toEqual([])
    cleanup()
    // The two confirmations, and a stopped run with changed data.
    view(data({ proposedByShift: { s1: 2 }, people: [{ ...data().people[0], targetMinutes: 600 }] }))
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }))
    expect(scan()).toEqual([])
    cleanup()
    view(data({ run: { ...baseRun, status: "interrupted", stopReason: "cancelled", outcome: "complete", report, stale: ["availability"] } as never }))
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce résultat partiel" }))
    expect(scan()).toEqual([])
  })
})
