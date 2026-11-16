/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import WaitlistOfferConfirm, { type WaitlistOfferDetails } from "../public/WaitlistOfferConfirm"

// The waitlist offer page (#1044): opening the email's link changes nothing, only the button
// accepts the offer.
const details: WaitlistOfferDetails = {
  eventTitle: "Fête du village",
  shiftLabel: "Buvette",
  day: "Samedi 4 juillet",
  time: "de 14h à 18h",
  deadline: "Confirme avant vendredi 3 juillet à 12:30, sinon la place passe à la personne suivante.",
  requiresApproval: false,
}

describe("WaitlistOfferConfirm", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("shows the offer without sending anything on load", () => {
    render(<WaitlistOfferConfirm token="tok" state="offered" details={details} />)
    expect(screen.getByRole("heading", { level: 1, name: "Une place s'est libérée" })).toBeInTheDocument()
    expect(screen.getByText("Buvette")).toBeInTheDocument()
    expect(screen.getByText(details.deadline!)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Prendre la place" })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("accepts with a POST on the button, then focuses the outcome", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, editToken: "tok", requested: false }) })
    render(<WaitlistOfferConfirm token="tok" state="offered" details={details} />)
    fireEvent.click(screen.getByRole("button", { name: "Prendre la place" }))
    const heading = await screen.findByRole("heading", { level: 1, name: "Place confirmée !" })
    expect(fetchMock).toHaveBeenCalledWith("/api/public/waitlist/tok/confirm", { method: "POST" })
    expect(heading).toHaveFocus()
    expect(document.title).toBe("Place confirmée")
    expect(screen.getByRole("link", { name: "Accéder à mon inscription" })).toHaveAttribute("href", "/my/tok")
  })

  it("says a request was sent on a « Sur validation » shift", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, editToken: "tok", requested: true }) })
    render(<WaitlistOfferConfirm token="tok" state="offered" details={{ ...details, requiresApproval: true }} />)
    expect(screen.getByText(/en prenant la place, tu envoies une demande/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Prendre la place" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Demande envoyée" })).toHaveFocus()
  })

  it("drops the button when the offer is gone (404/410)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 410, json: async () => ({ error: "Ce lien a expiré. La place a été proposée à quelqu'un d'autre." }) })
    render(<WaitlistOfferConfirm token="tok" state="offered" details={details} />)
    fireEvent.click(screen.getByRole("button", { name: "Prendre la place" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Place plus disponible" })).toHaveFocus()
    expect(screen.getByText("Ce lien a expiré. La place a été proposée à quelqu'un d'autre.")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("keeps the button and shows an alert on a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("offline"))
    render(<WaitlistOfferConfirm token="tok" state="offered" details={details} />)
    const button = screen.getByRole("button", { name: "Prendre la place" })
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Vérifie ta connexion et réessaie."))
    expect(button).toHaveAttribute("aria-describedby")
  })

  it("renders the other states without a button", () => {
    render(<WaitlistOfferConfirm token="tok" state="expired" details={null} />)
    expect(screen.getByRole("heading", { level: 1, name: "Lien expiré" })).not.toHaveFocus()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    cleanup()
    render(<WaitlistOfferConfirm token="tok" state="invalid" details={null} />)
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/")
  })

  it("shows nothing of the offer when the organisation is closed, only where to ask", () => {
    render(<WaitlistOfferConfirm token="tok" state="unavailable" details={null} contact="aide@example.org" />)
    expect(screen.getByRole("heading", { level: 1, name: "Espace indisponible" })).not.toHaveFocus()
    expect(screen.getByRole("link", { name: "aide@example.org" })).toHaveAttribute("href", "mailto:aide@example.org")
    // No link out: the organisation's pages are closed too.
    expect(screen.getAllByRole("link")).toHaveLength(1)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("switches to the closed-space view when the organisation was closed since the page loaded", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Cet espace n'est pas disponible.", code: "org_unavailable", contact: "aide@example.org" }) })
    render(<WaitlistOfferConfirm token="tok" state="offered" details={details} />)
    fireEvent.click(screen.getByRole("button", { name: "Prendre la place" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Espace indisponible" })).toHaveFocus()
    expect(document.title).toBe("Espace indisponible")
    expect(screen.queryByText("Buvette")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "aide@example.org" })).toBeInTheDocument()
  })
})
