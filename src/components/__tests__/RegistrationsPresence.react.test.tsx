/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import RegistrationsManager from "../admin/RegistrationsManager"

// Lightweight check-in (#399) in the registrations list.
const shift = { id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 3, registrationCount: 2 }
const reg = (id: string, over: Record<string, unknown> = {}) => ({
  id, status: "active", source: "public_form", comment: null, phone: null, createdAt: "2026-06-01T00:00:00.000Z", waitingPosition: null,
  volunteer: { id: `v-${id}`, firstName: id === "r1" ? "Alice" : "Bob", lastName: id === "r1" ? "Martin" : "Durand", email: `${id}@x.ch`, phone: null },
  shift, isLeader: false, checkedInAt: null, ...over,
})

describe("RegistrationsManager — presence", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("shows who is present and offers to mark the selected people", async () => {
    render(<RegistrationsManager eventId="evt-1" shifts={[shift]} initialRegistrations={[reg("r1", { checkedInAt: "2026-07-04T08:05:00.000Z" }), reg("r2")]} />)
    expect(screen.getByText(/1 présent/)).toBeInTheDocument()
    const aliceRow = screen.getByText("Alice Martin").closest("tr")!
    expect(within(aliceRow).getByText(/Présent/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText("Sélectionner l'inscription de Bob Durand"))
    expect(screen.getByRole("button", { name: "Marquer présent (1)" })).toHaveAttribute("aria-disabled", "false")
    expect(screen.queryByRole("button", { name: /Annuler la présence/ })).toBeNull()

    fireEvent.click(screen.getByLabelText("Sélectionner l'inscription de Alice Martin"))
    expect(screen.getByRole("button", { name: "Annuler la présence (1)" })).toBeInTheDocument()
  })

  it("marks the selection present through the bulk route and updates the rows", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ done: 1, changedIds: ["r2"], skipped: 0 }) })
    render(<RegistrationsManager eventId="evt-1" shifts={[shift]} initialRegistrations={[reg("r1"), reg("r2")]} />)
    fireEvent.click(screen.getByLabelText("Sélectionner l'inscription de Bob Durand"))
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent (1)" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/events/evt-1/registrations/bulk")
    expect(JSON.parse(init.body)).toEqual({ action: "check_in", registrationIds: ["r2"] })
    const bobRow = await screen.findByText("Bob Durand").then((el) => el.closest("tr")!)
    await waitFor(() => expect(within(bobRow).getByText(/Présent/)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 personne marquée présente."))
    const summary = screen.getByText("1 présent").closest("p")!
    expect(summary).toHaveTextContent("1 présent sur 2 inscrits.")
    expect(summary).toHaveFocus()
  })
})
