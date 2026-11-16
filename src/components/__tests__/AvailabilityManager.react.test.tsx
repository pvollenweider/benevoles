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

import AvailabilityManager from "../admin/AvailabilityManager"
import type { AvailabilityOverview, AvailabilityOverviewRow } from "@/lib/event-availability-server"

// « Disponibilités » after the independent review of the draft screens (#1146): the missions now
// outside a corrected answer are named, French elision, and the correction dialog holds while saving.
const fetchMock = vi.fn()
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); refresh.mockReset() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const row = (extra: Partial<AvailabilityOverviewRow> = {}): AvailabilityOverviewRow => ({
  volunteerId: "v-e", firstName: "Emma", lastName: "Johansson", email: "emma@example.org", state: "complete", answeredDates: 2, answeredAt: "2031-07-01T08:00:00Z", answeredBy: "volunteer",
  sentAt: "2031-06-01T08:00:00Z", lastRemindedAt: null, hasLink: true, reviewReason: "published", revision: 3, outsideMissions: ["Bar, samedi 12 juillet, de 18h à 23h"], ...extra,
})
const overview = (rows: AvailabilityOverviewRow[]): AvailabilityOverview => ({ dates: ["2031-07-11", "2031-07-12"], timeZone: "Europe/Zurich", counts: { none: 0, partial: 0, complete: rows.length, unavailable: 0 }, rows })
const view = (rows = [row()]) => render(<AvailabilityManager eventId="evt" enabled open deadlineSentence="Réponses jusqu'au 1er juillet." overview={overview(rows)} members={[]} allTags={[]} />)

describe("AvailabilityManager", () => {
  it("names the missions now outside a corrected answer, in the row's cells, never in its header", () => {
    view()
    const table = screen.getByRole("table", { name: "Personnes sollicitées et état de leur réponse" })
    const header = within(table).getByRole("rowheader")
    expect(header).not.toHaveTextContent(/Bar, samedi/)
    expect(within(table).getByText("Bar, samedi 12 juillet, de 18h à 23h")).toBeInTheDocument()
    expect(within(table).getByText(/^Mission actuellement en dehors de ses disponibilités\W+$/)).toBeInTheDocument()
    expect(within(screen.getByRole("list", { name: "Personnes sollicitées" })).getByText("Bar, samedi 12 juillet, de 18h à 23h")).toBeInTheDocument()
  })

  it("says nothing more without such a mission, and elides « de » before a vowel", () => {
    view([row({ outsideMissions: [], reviewReason: null })])
    expect(screen.queryByText(/actuellement en dehors/)).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /^Voir et corriger ?les disponibilités d'Emma Johansson$/ })).toHaveLength(2)
  })

  it("keeps the correction dialog open and its focus while a correction is saved", async () => {
    let resolveSave: (v: unknown) => void = () => {}
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return new Promise((r) => { resolveSave = r })
      return { ok: true, status: 200, json: async () => ({ volunteer: { firstName: "Emma", lastName: "Johansson" }, dates: ["2031-07-11"], days: [{ date: "2031-07-11", ranges: [] }] }) }
    })
    view([row({ outsideMissions: [], reviewReason: null })])
    fireEvent.click(screen.getAllByRole("button", { name: /^Voir et corriger ?les disponibilités d'Emma Johansson$/ })[1])
    const dialog = screen.getByRole("dialog", { name: "Disponibilités d'Emma Johansson" })
    const save = await within(dialog).findByRole("button", { name: "Enregistrer la correction" })
    fireEvent.click(save)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt/availability/v-e", expect.objectContaining({ method: "PUT" })))
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(screen.getByRole("dialog", { name: "Disponibilités d'Emma Johansson" })).toBeInTheDocument()
    resolveSave({ ok: true, status: 200, json: async () => ({ ok: true }) })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })
})
