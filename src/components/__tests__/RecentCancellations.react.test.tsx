/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import RecentCancellations from "../admin/registrations/RecentCancellations"
import type { RecentCancellation } from "@/lib/registration-restore"

// « Annulations récentes » (#809): restore a cancelled place, optionally with a new personal link.

const row: RecentCancellation = {
  id: "r1",
  volunteerName: "Chloé Roy",
  hasEmail: true,
  shift: "Bar, samedi 4 juillet, de 10h à 12h",
  previousStatus: "active",
  cancelled: "Annulée par la personne le 30 juin à 14:05",
  blocked: null,
}

describe("RecentCancellations", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "active" }), { status: 200 }))
  })
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

  it("names each button after the person and the shift, the visible word first", () => {
    render(<RecentCancellations rows={[row]} />)
    expect(screen.getByRole("button", { name: "Rétablir l'inscription de Chloé Roy, Bar, samedi 4 juillet, de 10h à 12h" })).toBeInTheDocument()
  })

  it("shows the reason instead of the button when the spot was taken", () => {
    render(<RecentCancellations rows={[{ ...row, blocked: "Complet : la place a été reprise." }]} />)
    expect(screen.queryByRole("button", { name: /Rétablir/ })).toBeNull()
    expect(screen.getByText("Complet : la place a été reprise.")).toBeInTheDocument()
  })

  it("says when there is nothing to restore", () => {
    render(<RecentCancellations rows={[]} />)
    expect(screen.getByText("Aucune annulation à rétablir sur un créneau à venir.")).toBeInTheDocument()
  })

  it("restores without a new link by default, then announces it and focuses the heading", async () => {
    render(<RecentCancellations rows={[row]} />)
    fireEvent.click(screen.getByRole("button", { name: /^Rétablir l'inscription/ }))
    const box = screen.getByRole("checkbox", { name: "Le lien a été utilisé par quelqu'un d'autre : envoyer un nouveau lien" })
    expect(box).not.toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: "Rétablir" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Inscription de Chloé Roy rétablie."))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ newLink: false })
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/registrations/r1/restore")
    expect(screen.getByRole("heading", { name: "Annulations récentes" })).toHaveFocus()
    expect(refresh).toHaveBeenCalled()
  })

  it("sends the new-link option when checked", async () => {
    render(<RecentCancellations rows={[row]} />)
    fireEvent.click(screen.getByRole("button", { name: /^Rétablir l'inscription/ }))
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.click(screen.getByRole("button", { name: "Rétablir" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Inscription de Chloé Roy rétablie, avec un nouveau lien personnel."))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ newLink: true })
  })

  it("keeps the dialog open with the server's reason on a refusal", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Ce créneau est complet : la place a été reprise." }), { status: 409 }))
    render(<RecentCancellations rows={[row]} />)
    fireEvent.click(screen.getByRole("button", { name: /^Rétablir l'inscription/ }))
    fireEvent.click(screen.getByRole("button", { name: "Rétablir" }))
    await waitFor(() => expect(screen.getByText("Ce créneau est complet : la place a été reprise.")).toBeInTheDocument())
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })
})
