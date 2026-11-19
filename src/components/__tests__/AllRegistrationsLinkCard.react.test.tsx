/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

import AllRegistrationsLinkCard from "@/components/public/AllRegistrationsLinkCard"

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<unknown>) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

describe("AllRegistrationsLinkCard", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it("requests the organisation link for this event link and shows the neutral success answer", async () => {
    const message = "Demande enregistrée : si une adresse email est enregistrée pour cette inscription, tu recevras le lien de toutes tes inscriptions auprès de l'organisation. Rien reçu ? Regarde dans tes indésirables."
    const fetchMock = stubFetch(async () => response({ ok: true, message }))
    render(<AllRegistrationsLinkCard token="tok" />)
    fireEvent.click(screen.getByRole("button", { name: "Recevoir ce lien par email" }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/public/registrations/tok/org-link", { method: "POST" })
  })

  it("shows a 429 next step without losing the button", async () => {
    stubFetch(async () => response({ error: "Trop de tentatives. Réessaie dans une heure." }, 429))
    render(<AllRegistrationsLinkCard token="tok" />)
    fireEvent.click(screen.getByRole("button", { name: "Recevoir ce lien par email" }))
    expect(await screen.findByText("Trop de tentatives. Réessaie dans une heure.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Recevoir ce lien par email" })).toBeEnabled()
  })

  it("says the connection failed, without claiming anything was sent", async () => {
    stubFetch(async () => { throw new Error("offline") })
    render(<AllRegistrationsLinkCard token="tok" />)
    fireEvent.click(screen.getByRole("button", { name: "Recevoir ce lien par email" }))
    expect(await screen.findByText("Connexion impossible. Vérifie ton réseau et réessaie.")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("button", { name: "Recevoir ce lien par email" })).toHaveTextContent("Recevoir ce lien par email"))
  })
})
