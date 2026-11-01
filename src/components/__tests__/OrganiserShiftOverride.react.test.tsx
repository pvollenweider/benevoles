/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import RequestDecisionModal from "../admin/registrations/RequestDecisionModal"
import type { Registration } from "../admin/registrations/types"

// Accepting a request on a full or closed shift (AUTHZ-15): the dialog is already open when the
// server says so; it then warns (said once, focus back on Cancel) and the next confirm sends the key.

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const shift = { id: "s1", roleName: "Bar", label: "Soir", date: "2030-07-11", startTime: "14:00", endTime: "20:00", capacity: 3, registrationCount: 3 }
const reg: Registration = {
  id: "r1", status: "requested", source: "public_form", comment: null, phone: null, createdAt: "2030-06-01T00:00:00.000Z", waitingPosition: null,
  volunteer: { id: "v1", firstName: "Nadia", lastName: "Rochat", email: "nadia@example.org", phone: null },
  shift, isLeader: false, checkedInAt: null,
}
const need = { shiftId: "s1", key: "o1|accept|r1|s1|closed|2|3", closed: true, full: false, markedFull: false, occupied: 2, capacity: 3, roleName: "Bar", label: "Soir", date: "2030-07-11", startTime: "14:00", endTime: "20:00" }

describe("accepting a request on a closed shift", () => {
  it("warns in the open dialog, moves focus to Cancel, then sends the confirmation", async () => {
    const bodies: Record<string, unknown>[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")))
      return bodies.length === 1 ? json({ code: "shift_override", error: "x", shifts: [need] }, 409) : json({ status: "active" })
    })
    vi.stubGlobal("fetch", fetchMock)
    const onDecided = vi.fn()
    render(<RequestDecisionModal eventId="evt-1" reg={reg} kind="accept" waitlist={false} onCancel={() => {}} onDecided={onDecided} />)
    fireEvent.click(screen.getByRole("button", { name: "Accepter" }))
    const confirm = await screen.findByRole("button", { name: "Accepter quand même" })
    await waitFor(() => expect(screen.getByRole("button", { name: "Annuler" })).toHaveFocus())
    expect(screen.getByText(/Les inscriptions à ce créneau sont fermées/)).toBeInTheDocument()
    // No error: the warning says it, never the error paragraph too.
    expect(screen.getByRole("alert")).toHaveTextContent("")
    expect(onDecided).not.toHaveBeenCalled()
    fireEvent.click(confirm)
    await waitFor(() => expect(onDecided).toHaveBeenCalled())
    expect(bodies[1]).toEqual({ decision: "accept", shiftOverride: [need.key] })
  })

  it("a cancelled shift is a plain refusal in the dialog", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ code: "shift_cancelled", error: "Ce créneau est annulé : rien n'a été fait. Rouvrez d'abord le créneau." }, 409)))
    render(<RequestDecisionModal eventId="evt-1" reg={reg} kind="accept" waitlist={false} onCancel={() => {}} onDecided={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Accepter" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Rouvrez d'abord le créneau"))
    expect(screen.queryByRole("button", { name: "Accepter quand même" })).toBeNull()
  })
})
