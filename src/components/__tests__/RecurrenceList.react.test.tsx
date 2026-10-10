/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import RecurrenceList from "../admin/RecurrenceList"
import type { AdminRecurrence, RawShift } from "../admin/shifts/types"

// The recurring permanences of an event (#866): change or stop from a date, never silently.

const fetchMock = vi.fn()
const rule: AdminRecurrence = {
  id: "r1", roleName: "Accueil", label: "Accueil", weekdays: [3], everyWeeks: 1, startTime: "14:00", endTime: "17:00", slotMinutes: 180, capacity: 2,
  fromDate: "2026-09-02", untilDate: "2026-09-30",
}
const shift = (id: string, date: string) => ({ id, date, startTime: "14:00", endTime: "17:00", roleName: "Accueil", label: "Accueil", capacity: 2, status: "open", displayOrder: 0, registrationCount: 0, recurrenceId: "r1" }) as unknown as RawShift
const shifts = [shift("a", "2026-09-02"), shift("b", "2026-09-09"), shift("c", "2026-09-16")]

describe("RecurrenceList", () => {
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  const setup = () => {
    const props = { onShiftsChanged: vi.fn(), onShiftsStopped: vi.fn(), onRuleChanged: vi.fn(), onAnnounce: vi.fn() }
    render(<RecurrenceList recurrences={[rule]} shifts={shifts} today="2026-09-05" {...props} />)
    return props
  }

  it("describes each permanence and its upcoming dates", () => {
    setup()
    expect(screen.getByRole("heading", { name: "Permanences récurrentes" })).toBeInTheDocument()
    expect(screen.getByText(/chaque mercredi, de 14:00 à 17:00/)).toBeInTheDocument()
    expect(screen.getByText("2 dates à venir.")).toBeInTheDocument()
  })

  it("lists the dates with people before stopping, then stops once confirmed", async () => {
    const props = setup()
    fireEvent.click(screen.getByRole("button", { name: /^Arrêter à partir d'une date\W+Accueil$/ }))
    expect(screen.getByLabelText("À partir du")).toHaveValue("2026-09-09")
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "1 date a déjà des inscrits.", withPeople: [{ date: "2026-09-16", startTime: "14:00", committed: 2 }] }), { status: 409 }))
    fireEvent.click(screen.getByRole("button", { name: "Arrêter la permanence" }))
    const confirm = await screen.findByRole("button", { name: "Annuler aussi cette date et prévenir les inscrits" })
    expect(screen.getByText(/2 inscrits/)).toBeInTheDocument()
    // Focus on the explanation and its dates, never on the destructive button.
    await waitFor(() => expect(screen.getByRole("group", { name: /1 date a déjà des inscrits/ })).toHaveFocus())
    expect(confirm).not.toHaveFocus()
    expect(props.onShiftsStopped).not.toHaveBeenCalled()

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ removed: ["b"], cancelled: ["c"], ruleDeleted: false, notified: 2 }), { status: 200 }))
    fireEvent.click(confirm)
    await waitFor(() => expect(props.onShiftsStopped).toHaveBeenCalledWith(["b"], ["c"]))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ from: "2026-09-09", confirm: true })
    expect(props.onRuleChanged.mock.calls[0][0]).toMatchObject({ untilDate: "2026-09-08" })
    expect(props.onAnnounce.mock.calls[0][0]).toMatch(/2 bénévoles ont été prévenus/)
  })

  it("changes the capacity from a date and shows the dates that refuse it", async () => {
    const props = setup()
    fireEvent.click(screen.getByRole("button", { name: /^Modifier à partir d'une date\W+Accueil$/ }))
    fireEvent.change(screen.getByLabelText("Personnes par créneau"), { target: { value: "1" } })
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Plus de 1 personne est déjà inscrite sur 1 date.", tooSmall: [{ date: "2026-09-16", startTime: "14:00", committed: 2 }] }), { status: 400 }))
    fireEvent.click(screen.getByRole("button", { name: "Modifier ces dates" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("2 inscrits")
    expect(props.onShiftsChanged).not.toHaveBeenCalled()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ from: "2026-09-09", capacity: 1 })
  })

  it("ties a wrong time to its field and focuses it, without posting", async () => {
    setup()
    fireEvent.click(screen.getByRole("button", { name: /^Modifier à partir d'une date\W+Accueil$/ }))
    const start = screen.getByLabelText("Début")
    fireEvent.change(start, { target: { value: "25:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Modifier ces dates" }))
    await waitFor(() => expect(start).toHaveFocus())
    expect(start).toHaveAttribute("aria-invalid", "true")
    expect(start).toHaveAccessibleDescription(/format HH:MM \(par exemple 14:00\)/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("says so when the network fails, and lets the organiser try again", async () => {
    setup()
    fireEvent.click(screen.getByRole("button", { name: /^Modifier à partir d'une date\W+Accueil$/ }))
    fireEvent.change(screen.getByLabelText("Personnes par créneau"), { target: { value: "3" } })
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    fireEvent.click(screen.getByRole("button", { name: "Modifier ces dates" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Connexion impossible")
    expect(screen.getByRole("button", { name: "Modifier ces dates" })).not.toHaveAttribute("aria-disabled")
  })
})
