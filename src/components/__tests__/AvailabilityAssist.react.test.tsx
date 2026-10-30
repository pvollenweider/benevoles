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
  volunteerId: `v-${lastName}`, firstName: "Nadia", lastName,
  fit: { state: "full", totalMinutes: 360, coveredMinutes: 360, outsideMinutes: 0, unknownMinutes: 0, needsAck: false, ranges: [{ date: "2031-07-11", startTime: "08:00", endTime: "22:00" }] },
  ackKey: null,
  minutes: { confirmed: 0, pending: 0, draft: 0, committed: 0, sameDay: 0 }, sameDayLabel: "le vendredi 11 juillet",
  backToBack: [], overlaps: [], eligible: true, workload: [], reviewNeeded: false,
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

describe("ShiftAssistPanel", () => {
  const panel = (rows: CandidateRow[]) => render(<ShiftAssistPanel eventId="evt" shift={{ id: "s1", name: "Bar · Soir" }} rows={rows} />)

  it("lists people by name, says each fit in words, and names each button with the person", () => {
    panel([row("Rochat"), outside("Bonvin")])
    const cards = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    expect(cards).toEqual(["Nadia Bonvin", "Nadia Rochat"])
    expect(screen.getByText("Pas disponible à ces heures")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ajouter à ce créneau : Nadia Rochat" })).toBeInTheDocument()
    expect(screen.getByText(/Déjà prévu sur l'événement : 4 h confirmées/)).toBeInTheDocument()
  })

  it("asks for the acknowledgement on click: the box is marked and focused, nothing is sent", () => {
    panel([outside("Bonvin")])
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à ce créneau : Nadia Bonvin" }))
    const box = screen.getByRole("checkbox", { name: /je sais que Nadia n'a pas indiqué être disponible/ })
    expect(box).toHaveAttribute("aria-invalid", "true")
    expect(box).toHaveFocus()
    expect(box).toHaveAccessibleDescription(/Cochez cette case/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends the acknowledgement key once ticked, announces the addition and refreshes", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ registrations: [] }) })
    panel([outside("Bonvin")])
    fireEvent.click(screen.getByRole("checkbox", { name: /je sais que Nadia/ }))
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à ce créneau : Nadia Bonvin" }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ eventId: "evt", volunteerId: "v-Bonvin", shiftIds: ["s1"], availabilityAck: ["a1|evt|v-Bonvin|s1|1|2|req|3|Europe/Zurich"] })
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Nadia Bonvin est maintenant sur Bar · Soir."))
  })

  it("moves focus to the card now in the added person's place once the list comes back", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ registrations: [] }) })
    const rows = [row("Aebi"), row("Blanc")]
    const { rerender } = panel(rows)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à ce créneau : Nadia Aebi" }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    rerender(<ShiftAssistPanel eventId="evt" shift={{ id: "s1", name: "Bar · Soir" }} rows={[rows[1]]} />)
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Nadia Blanc" })).toHaveFocus())
  })

  it("shows why the protection refuses someone, without a button", () => {
    panel([row("Morel", { eligible: false, workload: ["Journée de service du vendredi 11 juillet : 10 h de missions d'affilée."] })])
    expect(screen.getByText(/Ajout impossible :/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Ajouter à ce créneau/ })).not.toBeInTheDocument()
  })

  it("shows the server's refusal under the card", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Ajout impossible : limite de charge.", code: "workload" }) })
    panel([row("Rochat")])
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à ce créneau : Nadia Rochat" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ajout impossible : limite de charge.")
    expect(refresh).not.toHaveBeenCalled()
  })

  it("sorts to spread the load and explains how, and filters to people free for the whole shift", () => {
    panel([outside("Aebi"), row("Zbinden", { minutes: { confirmed: 300, pending: 0, draft: 0, committed: 300, sameDay: 0 } }), row("Muller")])
    const spread = screen.getByRole("button", { name: "Pour répartir la charge" })
    fireEvent.click(spread)
    expect(spread).toHaveAttribute("aria-pressed", "true")
    expect(spread).toHaveAccessibleDescription(/d'abord les personnes qui peuvent être ajoutées/)
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Nadia Muller", "Nadia Zbinden", "Nadia Aebi"])
    fireEvent.click(screen.getByRole("checkbox", { name: "Disponibles sur tout le créneau seulement" }))
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2)
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
    const box = await screen.findByRole("checkbox", { name: /je sais que Nadia n'a pas indiqué être disponible/ })
    expect(screen.getByRole("combobox", { name: "Créneau" })).toHaveAccessibleDescription(/Disponibilités indiquées : Pas disponible à ces heures/)
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
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("reads nothing for an event without the option", () => {
    render(<Harness availability={false} />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/Disponibilités indiquées/)).not.toBeInTheDocument()
  })
})
