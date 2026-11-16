/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import FrontDeskAccessPanel from "../admin/FrontDeskAccessPanel"
import type { FrontDeskAccessView } from "@/lib/front-desk-access"

const json = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body })

const access = (over: Partial<FrontDeskAccessView> = {}): FrontDeskAccessView => ({
  id: "grant-1", name: "Léa Favre", email: "lea.favre@example.org", status: "active", endsOn: "2027-06-14", endsOnLabel: "14 juin 2027",
  ...over,
})

const renderPanel = (accesses: FrontDeskAccessView[] = [access()]) =>
  render(<FrontDeskAccessPanel eventId="evt-fete" initialAccesses={accesses} />)

describe("FrontDeskAccessPanel", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("is a disclosure: a section heading with the live count, a disclosure and the explanatory sentence", () => {
    renderPanel([access(), access({ id: "grant-2", name: "Sacha Bonvin", status: "revoked" }), access({ id: "grant-3", name: "Inès Morel", status: "expired" })])
    expect(screen.getByRole("heading", { level: 2, name: "Accès accueil (1)" })).toBeInTheDocument()
    const summary = screen.getByText("Gérer les accès accueil de cet événement")
    expect(summary.tagName).toBe("SUMMARY")
    expect(summary.closest("details")).not.toHaveAttribute("open")
    expect(screen.getByText(/^Ces personnes peuvent seulement marquer les présences sur cette page/)).toBeInTheDocument()
    // The form's title is a level-3 heading, under the section's h2.
    expect(screen.getByRole("heading", { level: 3, name: "Inviter une personne" })).toBeInTheDocument()
  })

  it("asks for name and email, both required, without autofilling the owner's own identity", () => {
    renderPanel([])
    const name = screen.getByRole("textbox", { name: /^Nom/ })
    const email = screen.getByRole("textbox", { name: /^Email/ })
    for (const field of [name, email]) {
      expect(field).toBeRequired()
      expect(field).toHaveAttribute("autocomplete", "off")
    }
    // The visible required mark is decorative: the field's own required state says it.
    expect(name.closest("div")?.querySelector("[aria-hidden='true']")).toHaveTextContent("*")
    expect(screen.getByRole("button", { name: "Inviter" })).toBeInTheDocument()
  })

  it("invites, clears the fields, keeps the focus on « Inviter » and says what happens next", async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (init.method === "POST") return json({ accepted: true }, 202)
      return json({ accesses: [access(), access({ id: "grant-2", name: "Sacha Bonvin", status: "invitation_sent" })] })
    })
    renderPanel([])
    fireEvent.change(screen.getByRole("textbox", { name: /^Nom/ }), { target: { value: "Sacha Bonvin" } })
    fireEvent.change(screen.getByRole("textbox", { name: /^Email/ }), { target: { value: "sacha.bonvin@example.org" } })
    const invite = screen.getByRole("button", { name: "Inviter" })
    invite.focus()
    fireEvent.click(invite)
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Accès accueil enregistré pour Sacha Bonvin."))
    expect(screen.getByRole("textbox", { name: /^Nom/ })).toHaveValue("")
    expect(screen.getByRole("textbox", { name: /^Email/ })).toHaveValue("")
    expect(invite).toHaveFocus()
    expect(screen.getByRole("heading", { level: 2, name: "Accès accueil (2)" })).toBeInTheDocument()
  })

  it("a refused address moves the focus to the email field, marked invalid, with the server's sentence", async () => {
    fetchMock.mockResolvedValue(json({ error: "Cette adresse ne peut pas recevoir d'accès accueil." }, 409))
    renderPanel([])
    fireEvent.change(screen.getByRole("textbox", { name: /^Nom/ }), { target: { value: "Sacha Bonvin" } })
    const email = screen.getByRole("textbox", { name: /^Email/ })
    fireEvent.change(email, { target: { value: "sacha.bonvin@example.org" } })
    fireEvent.click(screen.getByRole("button", { name: "Inviter" }))
    await waitFor(() => expect(email).toHaveFocus())
    expect(email).toHaveAttribute("aria-invalid", "true")
    expect(email).toHaveAccessibleDescription("Cette adresse ne peut pas recevoir d'accès accueil.")
    // A field error is announced by the focus move, not twice through the alert.
    expect(screen.getByRole("status")).toHaveTextContent("")
  })

  it("keeps an empty name in the name field and does not call the server", async () => {
    renderPanel([])
    fireEvent.change(screen.getByRole("textbox", { name: /^Email/ }), { target: { value: "lea.favre@example.org" } })
    fireEvent.click(screen.getByRole("button", { name: "Inviter" }))
    await waitFor(() => expect(screen.getByRole("textbox", { name: /^Nom/ })).toHaveFocus())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("words every status, never by colour alone, with the person in each row's action names", () => {
    renderPanel([
      access({ id: "a", name: "Léa Favre", status: "active" }),
      access({ id: "b", name: "Sacha Bonvin", status: "invitation_sent" }),
      access({ id: "c", name: "Inès Morel", status: "revoked" }),
      access({ id: "d", name: "Noé Rochat", status: "expired" }),
    ])
    expect(screen.getByText("Actif").closest("span")).toHaveClass("bg-green-100", "text-green-700")
    expect(screen.getByText("Actif").closest("span")?.querySelector("[aria-hidden='true']")).toHaveTextContent("✓")
    expect(screen.getByText("Invitation envoyée")).toHaveClass("bg-amber-100", "text-amber-900")
    expect(screen.getByText("Révoqué")).toHaveClass("bg-gray-100", "text-gray-700")
    expect(screen.getByText("Expiré")).toHaveClass("bg-gray-100", "text-gray-600")
    expect(screen.getAllByText("Jusqu'au 14 juin 2027 inclus")).toHaveLength(4)
    expect(screen.getByRole("button", { name: "Révoquer, Léa Favre" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Renvoyer l'invitation, Sacha Bonvin" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Révoquer, Inès Morel/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Noé Rochat/ })).toBeNull()
  })

  it("revokes through the confirmation dialog, keeps the row with « Révoqué », and returns the focus to its name", async () => {
    fetchMock.mockResolvedValue(json({ revoked: true }))
    renderPanel([access()])
    const opener = screen.getByRole("button", { name: "Révoquer, Léa Favre" })
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("Révoquer l'accès de Léa Favre ?")
    // Cancel is focused first.
    expect(screen.getByRole("button", { name: "Annuler" })).toHaveFocus()

    fireEvent.click(screen.getByRole("button", { name: "Révoquer" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Léa Favre : accès révoqué."))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(screen.getByText("Révoqué")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Révoquer, Léa Favre/ })).toBeNull()
    await waitFor(() => expect(screen.getByText("Léa Favre")).toHaveFocus())
    expect(screen.getByRole("heading", { level: 2, name: "Accès accueil (0)" })).toBeInTheDocument()
  })

  it("a failed revocation stays in the dialog with the error, and the row keeps its buttons", async () => {
    fetchMock.mockResolvedValue(json({ error: "Une erreur est survenue." }, 500))
    renderPanel([access()])
    fireEvent.click(screen.getByRole("button", { name: "Révoquer, Léa Favre" }))
    await screen.findByRole("alertdialog")
    fireEvent.click(screen.getByRole("button", { name: "Révoquer" }))
    await waitFor(() => expect(screen.getByRole("alertdialog")).toHaveTextContent("Une erreur est survenue."))
    expect(screen.getByRole("button", { name: "Révoquer, Léa Favre" })).toBeInTheDocument()
  })

  it("resends the invitation and says the previous link no longer works", async () => {
    fetchMock.mockResolvedValue(json({ sent: true }))
    renderPanel([access({ status: "invitation_sent" })])
    const button = screen.getByRole("button", { name: "Renvoyer l'invitation, Léa Favre" })
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Invitation renvoyée à Léa Favre. Le lien précédent ne fonctionne plus."))
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-fete/front-desk-access/grant-1/resend", { method: "POST" })
  })
})
