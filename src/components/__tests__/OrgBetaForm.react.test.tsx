/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import OrgBetaForm from "../admin/OrgBetaForm"

// « Fonctions bêta » card of Paramètres (#1168): the switch, its description and the outcome.

const sectors = [{ id: "sectors", label: "Secteurs", description: "Regrouper plusieurs postes sous une même coordination." }]
const off = { optedIn: false, optedInAt: null, optedInByName: null }

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("OrgBetaForm", () => {
  it("is off by default, a named switch described by its hint, listing what it opens", () => {
    render(<OrgBetaForm initial={off} capabilities={sectors} timeZone="Europe/Zurich" contact="contact@example.org" />)
    const sw = screen.getByRole("switch", { name: "Essayer les fonctions avancées en bêta" })
    expect(sw).toHaveAttribute("aria-checked", "false")
    expect(sw).toHaveAccessibleDescription(/Vos événements existants ne changent pas/)
    expect(screen.getByRole("list", { name: /Ce que la bêta vous permet d'essayer/ })).toHaveTextContent("Secteurs : regrouper plusieurs postes")
    expect(screen.getByRole("link", { name: "contact@example.org" })).toHaveAttribute("href", "mailto:contact@example.org")
  })

  it("flips only after the server agreed, keeps the focus and announces the result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ optedIn: true, optedInAt: "2026-10-26T08:00:00Z", optedInByName: "Marie Dupont" }), { status: 200 })))
    render(<OrgBetaForm initial={off} capabilities={sectors} timeZone="Europe/Zurich" contact={null} />)
    const sw = screen.getByRole("switch")
    sw.focus()
    fireEvent.click(sw)
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"))
    expect(document.activeElement).toBe(sw)
    expect(sw).toHaveAccessibleDescription(/^Ne plus activer de nouvelles fonctions bêta/)
    expect(screen.getByText(/participe à la bêta depuis le 26 octobre 2026 \(activée par Marie Dupont\)/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Votre organisation participe à la bêta."))
    expect(fetch).toHaveBeenCalledWith("/api/admin/settings/organization/beta", expect.objectContaining({ method: "PUT", body: JSON.stringify({ optIn: true }) }))
  })

  it("stays off and says why when the server refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Aucune fonction bêta n'est ouverte à l'essai pour le moment." }), { status: 409 })))
    render(<OrgBetaForm initial={off} capabilities={sectors} timeZone="Europe/Zurich" contact={null} />)
    const sw = screen.getByRole("switch")
    fireEvent.click(sw)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Aucune fonction bêta n'est ouverte"))
    expect(sw).toHaveAttribute("aria-checked", "false")
  })

  it("lets an organisation leave when nothing is open any more, and then cannot rejoin", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ optedIn: false, optedInAt: null, optedInByName: null }), { status: 200 })))
    render(<OrgBetaForm initial={{ optedIn: true, optedInAt: "2026-10-01T08:00:00Z", optedInByName: null }} capabilities={[]} timeZone="Europe/Zurich" contact={null} />)
    expect(screen.getByText("Aucune fonction bêta n'est ouverte à l'essai pour le moment.")).toBeInTheDocument()
    const sw = screen.getByRole("switch")
    fireEvent.click(sw)
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "false"))
    expect(sw).toHaveAttribute("aria-disabled", "true")
    expect(sw).toHaveAccessibleDescription(/Vous pourrez participer de nouveau dès qu'une fonction sera ouverte/)
    fireEvent.click(sw)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
