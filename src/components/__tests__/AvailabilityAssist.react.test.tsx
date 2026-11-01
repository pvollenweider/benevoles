/**
 * @vitest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { useState } from "react"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import ShiftAssistPanel from "../admin/ShiftAssistPanel"
import ManualAddForm from "../admin/registrations/ManualAddForm"
import { EMPTY_ADD_FORM, type AddFormValues } from "../admin/registrations/types"
import type { CandidateRow } from "@/lib/availability-assist"

// Assisted manual assignment (#1146, lot B): the per-shift panel and the add form's acknowledgement.
const row = (lastName: string, extra: Partial<CandidateRow> = {}): CandidateRow => ({
  volunteerId: `v-${lastName}`, firstName: "Nadia", lastName, sameNameHint: null,
  fit: { state: "full", totalMinutes: 360, coveredMinutes: 360, outsideMinutes: 0, unknownMinutes: 0, needsAck: false, ranges: [{ date: "2031-07-11", startTime: "08:00", endTime: "22:00" }] },
  ackKey: null,
  minutes: { confirmed: 0, pending: 0, draft: 0, committed: 0, sameDay: 0 }, sameDayLabel: "le vendredi 11 juillet",
  backToBack: [], overlaps: [], eligible: true, workload: [], reviewNeeded: false, reviewTexts: [], draftOnShift: false,
  ...extra,
})
const outside = (lastName: string) => row(lastName, {
  fit: { state: "outside", totalMinutes: 360, coveredMinutes: 0, outsideMinutes: 360, unknownMinutes: 0, needsAck: true, ranges: [] },
  ackKey: `a1|evt|v-${lastName}|s1|1|2|req|3|Europe/Zurich`,
  minutes: { confirmed: 240, pending: 0, draft: 0, committed: 240, sameDay: 0 },
})

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); refresh.mockReset(); vi.stubGlobal("fetch", fetchMock) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const partial = (lastName: string) => row(lastName, {
  fit: { state: "partial", totalMinutes: 360, coveredMinutes: 120, outsideMinutes: 240, unknownMinutes: 0, needsAck: true, ranges: [] },
  ackKey: `a1|evt|v-${lastName}|s1|1|2|req|3|Europe/Zurich`,
})
const cardNames = () => screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)
const groupNames = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
/** Accessible names keep the no-break space before « : » (French typography). */
const NAME = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(" : ", "\\W+")}$`)

describe("ShiftAssistPanel", () => {
  const panel = (rows: CandidateRow[]) => render(<ShiftAssistPanel eventId="evt" shift={{ id: "s1", name: "Bar · Soir" }} rows={rows} />)

  it("groups people by availability, best first, says each fit in words, and names each button with the person", () => {
    panel([outside("Aebi"), row("Rochat"), partial("Blanc")])
    // Never « Pas disponible » first (independent review, P1 #2): h3 groups, h4 cards.
    expect(groupNames()).toEqual(["Disponibles sur tout le créneau (1)", "Disponibles sur une partie du créneau (1)", "Pas disponibles à ces heures (1)"])
    expect(cardNames()).toEqual(["Nadia Rochat", "Nadia Blanc", "Nadia Aebi"])
    expect(screen.getByText("Pas disponible à ces heures")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: NAME("Ajouter en brouillon : Nadia Rochat") })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: NAME("Inscrire maintenant : Nadia Rochat") })).toBeInTheDocument()
    expect(screen.getByText(/Déjà prévu sur l'événement\W+4 h confirmées/)).toBeInTheDocument()
  })

  it("offers the draft first, and says the immediate registration registers now and may email (independent review, P1 #3)", () => {
    panel([row("Rochat")])
    const [first, second] = screen.getAllByRole("button", { name: /Nadia Rochat$/ })
    expect(first).toHaveAccessibleName(NAME("Ajouter en brouillon : Nadia Rochat"))
    expect(second).toHaveAccessibleName(NAME("Inscrire maintenant : Nadia Rochat"))
    expect(second).toHaveAccessibleDescription(/Inscrire maintenant\W+inscrit la personne tout de suite\W+elle reçoit un email si elle a une adresse\./)
    // No filled blue button in the cards: one action colour, used sparingly.
    for (const b of [first, second]) expect(b.className).not.toMatch(/bg-blue-600/)
  })

  it("tells two people of the same name apart by their email, in the heading and the button (#1146, lot B)", () => {
    panel([
      row("Rochat", { volunteerId: "v-1", sameNameHint: "nadia.rochat@example.org" }),
      row("Rochat", { volunteerId: "v-2", sameNameHint: "sans email" }),
    ])
    expect(cardNames()).toEqual(["Nadia Rochat, nadia.rochat@example.org", "Nadia Rochat, sans email"])
    expect(screen.getByRole("button", { name: NAME("Inscrire maintenant : Nadia Rochat (nadia.rochat@example.org)") })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: NAME("Inscrire maintenant : Nadia Rochat (sans email)") })).toBeInTheDocument()
  })

  it("asks for the acknowledgement on click: the box is marked and focused, nothing is sent", () => {
    panel([outside("Bonvin")])
    fireEvent.click(screen.getByRole("button", { name: NAME("Inscrire maintenant : Nadia Bonvin") }))
    const box = screen.getByRole("checkbox", { name: /^Ajouter quand même\W+je sais que Nadia n'a pas indiqué être disponible/ })
    expect(box).toHaveAttribute("aria-invalid", "true")
    expect(box).toHaveFocus()
    expect(box).toHaveAccessibleDescription(/Cochez cette case/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends the acknowledgement key once ticked, announces the registration and refreshes", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ registrations: [] }) })
    const { rerender } = panel([outside("Bonvin"), row("Rochat")])
    fireEvent.click(screen.getByRole("checkbox", { name: /je sais que Nadia/ }))
    fireEvent.click(screen.getByRole("button", { name: NAME("Inscrire maintenant : Nadia Bonvin") }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ eventId: "evt", volunteerId: "v-Bonvin", shiftIds: ["s1"], availabilityAck: ["a1|evt|v-Bonvin|s1|1|2|req|3|Europe/Zurich"] })
    // Said once focus has moved, after the refresh (never cut by the focus move).
    expect(screen.getByRole("status")).toHaveTextContent("")
    rerender(<ShiftAssistPanel eventId="evt" shift={{ id: "s1", name: "Bar · Soir" }} rows={[row("Rochat")]} />)
    await waitFor(() => expect(screen.getByRole("heading", { level: 4, name: "Nadia Rochat" })).toHaveFocus())
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Nadia Bonvin est maintenant inscrit·e sur Bar, Soir."))
  })

  it("keeps a tick for the answer it was given for only: a refreshed answer brings an unticked box that says why (P1 #1, owner decision 6)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ code: "availability", error: "Les disponibilités de cette personne ont changé." }) })
    const first = outside("Bonvin")
    const { rerender } = panel([first])
    fireEvent.click(screen.getByRole("checkbox", { name: /je sais que Nadia/ }))
    fireEvent.click(screen.getByRole("button", { name: NAME("Ajouter en brouillon : Nadia Bonvin") }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    // The refresh brings the new answer, its new key: the box is no longer ticked.
    const changed = { ...first, ackKey: "a1|evt|v-Bonvin|s1|1|2|req|4|Europe/Zurich" }
    rerender(<ShiftAssistPanel eventId="evt" shift={{ id: "s1", name: "Bar · Soir" }} rows={[changed]} />)
    const box = screen.getByRole("checkbox", { name: /je sais que Nadia/ })
    expect(box).not.toBeChecked()
    await waitFor(() => expect(box).toHaveFocus())
    expect(box).toHaveAttribute("aria-invalid", "true")
    expect(box).toHaveAccessibleDescription(/ont changé entre-temps/)
    // Said by the box only, never also by the card's alert.
    expect(screen.getByRole("alert")).toHaveTextContent("")
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ draft: { id: "d1", revision: 1 } }) })
    fireEvent.click(screen.getByRole("button", { name: NAME("Ajouter en brouillon : Nadia Bonvin") }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(box)
    fireEvent.click(screen.getByRole("button", { name: NAME("Ajouter en brouillon : Nadia Bonvin") }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).ackKey).toBe(changed.ackKey)
  })

  it("adds a draft (#1146, lot C): the person stays listed, without an immediate registration, focus on the sentence that replaced the buttons", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ draft: { id: "d1", revision: 1 } }) })
    const { rerender } = panel([row("Aebi")])
    fireEvent.click(screen.getByRole("button", { name: NAME("Ajouter en brouillon : Nadia Aebi") }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/events/evt/drafts")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ shiftId: "s1", volunteerId: "v-Aebi", ackKey: null })
    rerender(<ShiftAssistPanel eventId="evt" shift={{ id: "s1", name: "Bar · Soir" }} rows={[row("Aebi", { draftOnShift: true })]} />)
    await waitFor(() => expect(screen.getByText(/Un brouillon existe déjà pour ce créneau/)).toHaveFocus())
    expect(screen.queryByRole("button", { name: /Ajouter en brouillon|Inscrire maintenant/ })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Affectations en brouillon" })).toHaveAttribute("href", "/admin/events/evt/availability/drafts")
    // Said by the focused sentence only, never also by the status.
    expect(screen.getByRole("status")).toHaveTextContent("")
  })

  it("after a draft for someone not available, focuses the sentence, never a box that no longer does anything", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ draft: { id: "d1", revision: 1 } }) })
    const first = outside("Bonvin")
    const { rerender } = panel([first])
    fireEvent.click(screen.getByRole("checkbox", { name: /je sais que Nadia/ }))
    fireEvent.click(screen.getByRole("button", { name: NAME("Ajouter en brouillon : Nadia Bonvin") }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    rerender(<ShiftAssistPanel eventId="evt" shift={{ id: "s1", name: "Bar · Soir" }} rows={[{ ...first, draftOnShift: true }]} />)
    await waitFor(() => expect(screen.getByText(/Un brouillon existe déjà pour ce créneau/)).toHaveFocus())
    expect(screen.queryByRole("checkbox", { name: /je sais que/ })).not.toBeInTheDocument()
  })

  it("says « missing », not « changed », when a person without a box comes back with one", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ code: "availability", error: "Les disponibilités ont changé." }) })
    const { rerender } = panel([row("Bonvin")])
    fireEvent.click(screen.getByRole("button", { name: NAME("Ajouter en brouillon : Nadia Bonvin") }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    rerender(<ShiftAssistPanel eventId="evt" shift={{ id: "s1", name: "Bar · Soir" }} rows={[outside("Bonvin")]} />)
    const box = screen.getByRole("checkbox", { name: /je sais que Nadia/ })
    await waitFor(() => expect(box).toHaveFocus())
    expect(box).toHaveAccessibleDescription(/^Cochez cette case/)
  })

  it("moves focus to the next card of the group once the registered person leaves the list", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ registrations: [] }) })
    const rows = [row("Aebi"), row("Blanc"), outside("Morel")]
    const { rerender } = panel(rows)
    fireEvent.click(screen.getByRole("button", { name: NAME("Inscrire maintenant : Nadia Aebi") }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    rerender(<ShiftAssistPanel eventId="evt" shift={{ id: "s1", name: "Bar · Soir" }} rows={[rows[1], rows[2]]} />)
    await waitFor(() => expect(screen.getByRole("heading", { level: 4, name: "Nadia Blanc" })).toHaveFocus())
  })

  it("moves focus to the previous card when the last of a group leaves it", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ registrations: [] }) })
    const rows = [row("Aebi"), partial("Blanc")]
    const { rerender } = panel(rows)
    fireEvent.click(screen.getByRole("checkbox", { name: /je sais que Nadia/ }))
    fireEvent.click(screen.getByRole("button", { name: NAME("Inscrire maintenant : Nadia Blanc") }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    rerender(<ShiftAssistPanel eventId="evt" shift={{ id: "s1", name: "Bar · Soir" }} rows={[rows[0]]} />)
    await waitFor(() => expect(screen.getByRole("heading", { level: 4, name: "Nadia Aebi" })).toHaveFocus())
  })

  it("shows why the protection refuses someone, without a button", () => {
    panel([row("Morel", { eligible: false, workload: ["Journée de service du vendredi 11 juillet : 10 h de missions d'affilée."] })])
    expect(screen.getByText(/Ajout impossible\W+$/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Inscrire maintenant|Ajouter en brouillon/ })).not.toBeInTheDocument()
  })

  it("shows the server's refusal under the card, in an alert mounted from the start", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Ajout impossible : limite de charge.", code: "workload" }) })
    panel([row("Rochat")])
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("")
    fireEvent.click(screen.getByRole("button", { name: NAME("Inscrire maintenant : Nadia Rochat") }))
    await waitFor(() => expect(alert).toHaveTextContent("Ajout impossible : limite de charge."))
    expect(screen.getByRole("button", { name: NAME("Inscrire maintenant : Nadia Rochat") })).toHaveAccessibleDescription(/limite de charge/)
    expect(refresh).not.toHaveBeenCalled()
  })

  // A full or closed shift (AUTHZ-15): « Inscrire maintenant » asks in a dialog, then sends the key.
  it("asks before registering on a full shift, then sends the confirmation's key", async () => {
    const need = { shiftId: "s1", key: "o1|manual_add|v-Rochat|s1|open|3|3", closed: false, full: true, markedFull: false, occupied: 3, capacity: 3, roleName: "Bar", label: "Soir", date: "2031-07-11", startTime: "14:00", endTime: "20:00" }
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: "shift_override", error: "x", shifts: [need] }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ registrations: [] }) })
    panel([row("Rochat")])
    const button = screen.getByRole("button", { name: NAME("Inscrire maintenant : Nadia Rochat") })
    fireEvent.click(button)
    const dialog = await screen.findByRole("dialog", { name: /^Ajouter Nadia Rochat à un créneau complet/ })
    // Asked, never said as an error.
    for (const alert of screen.getAllByRole("alert")) expect(alert).toHaveTextContent("")
    fireEvent.click(screen.getByRole("button", { name: "Ajouter quand même" }))
    expect(dialog).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ volunteerId: "v-Rochat", shiftIds: ["s1"], shiftOverride: [need.key] })
  })

  it("spreads the load inside each group by default and explains how, sorts by name on demand, and filters", () => {
    panel([outside("Aebi"), row("Zbinden", { minutes: { confirmed: 300, pending: 0, draft: 0, committed: 300, sameDay: 0 } }), row("Muller")])
    const spread = screen.getByRole("button", { name: "Pour répartir la charge" })
    expect(spread).toHaveAttribute("aria-pressed", "true")
    expect(spread).toHaveAccessibleDescription(/^Dans chaque groupe\W+d'abord les personnes qui peuvent être ajoutées/)
    expect(cardNames()).toEqual(["Nadia Muller", "Nadia Zbinden", "Nadia Aebi"])
    fireEvent.click(screen.getByRole("button", { name: "Par nom" }))
    expect(cardNames()).toEqual(["Nadia Muller", "Nadia Zbinden", "Nadia Aebi"].sort((a, b) => (a === "Nadia Aebi" ? 1 : b === "Nadia Aebi" ? -1 : a.localeCompare(b))))
    fireEvent.click(screen.getByRole("checkbox", { name: "Disponibles sur tout le créneau seulement" }))
    expect(cardNames()).toHaveLength(2)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Personnes à affecter (2)")
  })
})

describe("ManualAddForm with dated availability", () => {
  const shift = { id: "s1", roleName: "Bar", label: "Soir", date: "2031-07-11", startTime: "14:00", endTime: "20:00", capacity: 3, registrationCount: 0 }
  const member: AddFormValues = { ...EMPTY_ADD_FORM, volunteerId: "mem-1", firstName: "Nadia", lastName: "Rochat", shiftId: "s1" }
  function Harness({ availability = true }: { availability?: boolean }) {
    const [form, setForm] = useState(member)
    return <ManualAddForm eventId="evt-1" shifts={[shift]} registrations={[]} timeZone="Europe/Zurich" availability={availability} form={form} onFormChange={setForm} onAdded={() => {}} onCancel={() => {}} />
  }
  const KEY = "a1|evt-1|mem-1|s1|1|2|req|3|Europe/Zurich"
  const fitResponse = { ok: true, status: 200, json: async () => ({ inUse: true, fits: [{ shiftId: "s1", state: "outside", label: "Pas disponible à ces heures", detail: "", ackKey: KEY }] }) }

  it("reads the chosen member's fit, describes the shift with it and asks for the acknowledgement before sending", async () => {
    fetchMock.mockResolvedValueOnce(fitResponse)
    render(<Harness />)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/events/evt-1/availability/fit?volunteerId=mem-1&shiftId=s1")
    const box = await screen.findByRole("checkbox", { name: /^Ajouter quand même\W+je sais que Nadia n'a pas indiqué être disponible/ })
    expect(screen.getByRole("combobox", { name: "Créneau" })).toHaveAccessibleDescription(/Disponibilités indiquées\W+Pas disponible à ces heures/)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    expect(box).toHaveFocus()
    expect(box).toHaveAttribute("aria-invalid", "true")
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ registrations: [] }) })
    fireEvent.click(box)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).availabilityAck).toEqual([KEY])
  })

  it("shows the boxes the server asks for when the answer changed meanwhile", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ inUse: true, fits: [{ shiftId: "s1", state: "full", label: "Disponible sur tout le créneau", detail: "", ackKey: null }] }) })
    render(<Harness />)
    await screen.findByText(/Disponible sur tout le créneau/)
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: "availability", error: "Nadia Rochat a indiqué ne pas être disponible pendant une partie de ce créneau : cochez la confirmation pour l'ajouter quand même. Rien n'a été ajouté.", outside: [{ shiftId: "s1", key: KEY, state: "outside", label: "Pas disponible à ces heures", detail: "" }] }) })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    const box = await screen.findByRole("checkbox", { name: /je sais que Nadia/ })
    await waitFor(() => expect(box).toHaveFocus())
    // Said once, by the box's own error, never a second time by an alert.
    expect(box).toHaveAccessibleDescription(/rien n'a encore été ajouté/)
    // The form's alert stays mounted (so a later refusal is read), empty here.
    expect(screen.getByRole("alert")).toHaveTextContent("")
  })

  it("reads nothing for an event without the option", () => {
    render(<Harness availability={false} />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/Disponibilités indiquées/)).not.toBeInTheDocument()
  })
})
