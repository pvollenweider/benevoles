/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import SignupEmailConfirmation, { type SignupConfirmationDetails } from "../public/SignupEmailConfirmation"

const details: SignupConfirmationDetails = {
  eventTitle: "Fête du village",
  eventSlug: "fete",
  organizationName: "Asso",
  firstShifts: [
    { label: "Bar", roleName: "Bar", date: "2026-11-14", startTime: "10:00", endTime: "12:00", waitlist: false, requiresApproval: false },
    { label: "Accueil", roleName: "Accueil", date: "2026-11-15", startTime: "14:00", endTime: "16:00", waitlist: true, requiresApproval: false },
  ],
  deadline: "2026-11-11T10:00:00.000Z",
  deadlineLabel: "mercredi 11 novembre à 11:00",
  counts: null,
}

describe("confirmation page (#1253)", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it("shows the shifts and the deadline, and confirms only on the button", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, already: false, counts: { active: 1, requested: 0, waiting: 1 } }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<SignupEmailConfirmation token="tok" state="pending" details={details} />)
    expect(screen.getByRole("heading", { name: "Confirme ton inscription" })).toBeInTheDocument()
    expect(screen.getByText(/Bar/)).toBeInTheDocument()
    expect(screen.getByText(/mercredi 11 novembre à 11:00/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Confirmer mon inscription" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/public/confirmations/tok/confirm", { method: "POST" }))
    expect(await screen.findByRole("heading", { name: "Inscription confirmée" })).toBeInTheDocument()
    expect(screen.getByText(/1 place confirmée/)).toBeInTheDocument()
    expect(screen.getByText(/1 créneau en liste d'attente/)).toBeInTheDocument()
  })

  it("an expired link explains how to ask again and links back to the event", () => {
    render(<SignupEmailConfirmation token="tok" state="expired" details={details} />)
    expect(screen.getByRole("heading", { name: "Ce lien a expiré" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Revenir à l'événement" })).toHaveAttribute("href", "/fete")
    expect(screen.queryByRole("button", { name: "Confirmer mon inscription" })).not.toBeInTheDocument()
  })

  it("a repeated click shows the recorded result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, already: true, counts: { active: 2, requested: 0, waiting: 0 } }) }))
    render(<SignupEmailConfirmation token="tok" state="pending" details={details} />)
    fireEvent.click(screen.getByRole("button", { name: "Confirmer mon inscription" }))
    expect(await screen.findByRole("heading", { name: "Inscription confirmée" })).toBeInTheDocument()
    expect(screen.getByText(/2 places confirmées/)).toBeInTheDocument()
  })

  it("a failed request says nothing was confirmed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "Erreur" }) }))
    render(<SignupEmailConfirmation token="tok" state="pending" details={details} />)
    fireEvent.click(screen.getByRole("button", { name: "Confirmer mon inscription" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Erreur")
    expect(screen.getByRole("button", { name: "Confirmer mon inscription" })).toBeInTheDocument()
  })
})
