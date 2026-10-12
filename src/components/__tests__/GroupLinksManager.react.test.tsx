/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import GroupLinksManager from "../admin/GroupLinksManager"
import type { AdminGroupLink } from "@/lib/group-links"

// Share links per group (#947): the admin list and its inline form, focus and messages.

const LINK: AdminGroupLink = {
  id: "link-1", code: "abcd2345", name: "Amicale des pompiers", roleNames: ["Bar", "Parking"], missingRoles: [],
  hideFull: false, url: "https://club.benevol.app/fete?groupe=abcd2345", registrations: 3, people: 2,
}

function setup(links: AdminGroupLink[] = [LINK]) {
  return render(<GroupLinksManager eventId="evt-1" roles={["Bar", "Parking", "Accueil"]} initialLinks={links} published />)
}

describe("GroupLinksManager", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0 })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("lists a link with its roles, its sign-ups and named actions", () => {
    setup()
    expect(screen.getByText("Postes : Bar, Parking")).toBeInTheDocument()
    expect(screen.getByText(/2 personnes inscrites, 3 créneaux/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Copier le lien ?« Amicale des pompiers »$/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /^QR code PNG ?« Amicale des pompiers », fichier à télécharger$/ })).toHaveAttribute(
      "href", "/api/admin/events/evt-1/qr?link=link-1&format=png&download=1",
    )
    expect(screen.getByRole("link", { name: /^Voir ses inscriptions ?\(« Amicale des pompiers »\)$/ })).toHaveAttribute(
      "href", "/admin/events/evt-1/registrations?lien=link-1",
    )
  })

  it("cancelling the creation form gives the focus back to « Créer un lien pour un groupe » (regression)", async () => {
    setup()
    fireEvent.click(screen.getByRole("button", { name: "Créer un lien pour un groupe" }))
    expect(screen.getByLabelText(/Nom du groupe/)).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Créer un lien pour un groupe" })).toHaveFocus())
  })

  it("cancelling an edit gives the focus back to its « Modifier »", async () => {
    setup()
    fireEvent.click(screen.getByRole("button", { name: /^Modifier ?le lien « Amicale des pompiers »$/ }))
    expect(screen.getByLabelText(/Nom du groupe/)).toHaveValue("Amicale des pompiers")
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    await waitFor(() => expect(screen.getByRole("button", { name: /^Modifier ?le lien « Amicale des pompiers »$/ })).toHaveFocus())
  })

  it("refuses an empty name, then no role, focusing the field the message is about", async () => {
    setup([])
    fireEvent.click(screen.getByRole("button", { name: "Créer un lien pour un groupe" }))
    fireEvent.click(screen.getByRole("button", { name: "Créer le lien" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Donnez un nom au lien")
    expect(screen.getByLabelText(/Nom du groupe/)).toHaveFocus()
    fireEvent.change(screen.getByLabelText(/Nom du groupe/), { target: { value: "Fanfare" } })
    fireEvent.click(screen.getByRole("button", { name: "Créer le lien" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Choisissez au moins un poste.")
    const bar = screen.getByRole("checkbox", { name: "Bar" })
    expect(bar).toHaveFocus()
    expect(bar).toHaveAttribute("aria-invalid", "true")
    expect(bar).toHaveAccessibleDescription(/Choisissez au moins un poste/)
  })

  it("creates a link and moves the focus to its copy button, with a visible confirmation", async () => {
    const created = { ...LINK, id: "link-2", name: "Fanfare", roleNames: ["Bar"], registrations: 0, people: 0 }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)
    setup([])
    fireEvent.click(screen.getByRole("button", { name: "Créer un lien pour un groupe" }))
    fireEvent.change(screen.getByLabelText(/Nom du groupe/), { target: { value: "Fanfare" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Bar" }))
    fireEvent.click(screen.getByRole("button", { name: "Créer le lien" }))
    await waitFor(() => expect(screen.getByRole("button", { name: /^Copier le lien ?« Fanfare »$/ })).toHaveFocus())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Fanfare", roleNames: ["Bar"], hideFull: false })
    expect(screen.getByText("Lien « Fanfare » créé.")).toHaveAttribute("role", "status")
  })

  it("a server refusal of the name focuses the name field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Un autre lien de cet événement porte déjà ce nom : choisissez-en un autre.", field: "name" }), { status: 409 })))
    setup([])
    fireEvent.click(screen.getByRole("button", { name: "Créer un lien pour un groupe" }))
    fireEvent.change(screen.getByLabelText(/Nom du groupe/), { target: { value: "Fanfare" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Bar" }))
    fireEvent.click(screen.getByRole("button", { name: "Créer le lien" }))
    await waitFor(() => expect(screen.getByLabelText(/Nom du groupe/)).toHaveFocus())
    expect(screen.getByRole("alert")).toHaveTextContent("porte déjà ce nom")
  })
})
