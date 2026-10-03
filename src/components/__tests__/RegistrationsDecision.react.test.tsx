/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import RequestDecisionModal from "../admin/registrations/RequestDecisionModal"
import type { Registration } from "../admin/registrations/types"

// Accepting or refusing a sign-up request (#484), the dialog on its own.
const shift = { id: "s1", roleName: "Bar", label: "Soir", date: "2026-07-04", startTime: "18:00", endTime: "20:00", capacity: 3, registrationCount: 1 }
const reg: Registration = {
  id: "r1", status: "requested", source: "public_form", comment: null, phone: null, createdAt: "2026-06-01T00:00:00.000Z", waitingPosition: null,
  volunteer: { id: "v1", firstName: "Alice", lastName: "Martin", email: "alice@x.ch", phone: null },
  shift, isLeader: false, checkedInAt: null,
}

describe("RequestDecisionModal", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("sends a refusal with its message and reports the decision", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    const onDecided = vi.fn()
    render(<RequestDecisionModal reg={reg} kind="refuse" waitlist={false} onCancel={() => {}} onDecided={onDecided} />)
    const note = screen.getByLabelText("Message à la personne (facultatif)")
    expect(note).toHaveAccessibleDescription(/Ajouté tel quel à l'email/)
    fireEvent.change(note, { target: { value: "Complet, désolé." } })
    fireEvent.submit(note.closest("form")!)

    await waitFor(() => expect(onDecided).toHaveBeenCalledWith(expect.any(Date)))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/registrations/r1/decision")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ decision: "refuse", note: "Complet, désolé." })
  })

  // #582: the dialog says which shift, with its day and hours, in words.
  it("names the shift with its day and hours in both dialogs", () => {
    const { unmount } = render(<RequestDecisionModal reg={reg} kind="accept" waitlist={false} onCancel={() => {}} onDecided={() => {}} />)
    expect(screen.getByText("La demande de Alice Martin sur « Bar, Soir, samedi 4 juillet, de 18h à 20h » devient une inscription confirmée.")).toBeInTheDocument()
    expect(screen.getByRole("dialog").textContent).not.toMatch(/[·–—]/)
    unmount()
    render(<RequestDecisionModal reg={reg} kind="refuse" waitlist={false} onCancel={() => {}} onDecided={() => {}} />)
    expect(screen.getByText("La demande sur « Bar, Soir, samedi 4 juillet, de 18h à 20h » est refusée et la place est libérée.")).toBeInTheDocument()
  })

  it("accepts without a message field", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    const onDecided = vi.fn()
    render(<RequestDecisionModal reg={reg} kind="accept" waitlist={false} onCancel={() => {}} onDecided={onDecided} />)
    expect(screen.queryByLabelText("Message à la personne (facultatif)")).toBeNull()
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    await waitFor(() => expect(onDecided).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ decision: "accept" })
  })

  it("keeps the dialog open with the server's reason when the decision fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Cette demande a déjà été traitée." }) })
    const onDecided = vi.fn()
    render(<RequestDecisionModal reg={reg} kind="accept" waitlist={false} onCancel={() => {}} onDecided={onDecided} />)
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    expect(await screen.findByText("Cette demande a déjà été traitée.")).toBeInTheDocument()
    expect(onDecided).not.toHaveBeenCalled()
  })

  it("says nothing was done when the connection fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"))
    render(<RequestDecisionModal reg={reg} kind="accept" waitlist={false} onCancel={() => {}} onDecided={() => {}} />)
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    expect(await screen.findByText("La connexion a échoué : rien n'a été fait. Réessayez.")).toBeInTheDocument()
  })
})
