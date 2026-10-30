/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"

// The page « Mes disponibilités » (#1146, independent review): a dead link, too many attempts and a
// lost connection each say so in their own words and with a way out; after the deadline, whom to
// write to; a deadline passing mid-edit says the last changes were not kept, with focus on it.

vi.mock("next/navigation", () => ({ useParams: () => ({ token: "abcdefghijklmnopqrstuvwx" }) }))
vi.mock("@/components/PublicFooter", () => ({ default: () => <footer>pied</footer> }))

import MyAvailabilityPage from "@/app/disponibilites/[token]/page"
import { DEADLINE_PASSED_ERROR } from "@/lib/event-availability-text"

const res = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

const view = (over: Record<string, unknown> = {}) => ({
  event: { title: "Festival", organizationName: "Les Amis du Parc", datesLabel: "du vendredi 10 juillet au samedi 11 juillet" },
  timeZone: "Europe/Zurich",
  dates: ["2099-07-10", "2099-07-11"],
  deadline: "2099-07-01T21:59:00.000Z",
  open: true,
  state: "none",
  days: [],
  correction: { published: false, viaCorrection: false, until: null },
  contactEmail: "contact@example.org",
  ...over,
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("MyAvailabilityPage", () => {
  it("names the organisation of the site on a dead link, without any address", async () => {
    vi.stubGlobal("fetch", vi.fn(() => res({ error: "Lien introuvable ou plus valable.", organizationName: "Les Amis du Parc" }, 404)))
    render(<MyAvailabilityPage />)
    expect(await screen.findByRole("heading", { level: 1, name: "Lien introuvable" })).toBeInTheDocument()
    expect(screen.getByText("Pour une correction ou un nouveau lien, réponds à l'email de Les Amis du Parc qui contenait ce lien.")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /@/ })).toBeNull()
    expect(screen.getByText("pied")).toBeInTheDocument()
  })

  it("says « Trop de tentatives », not « Lien introuvable », on a 429", async () => {
    vi.stubGlobal("fetch", vi.fn(() => res({ error: "Trop de tentatives." }, 429)))
    render(<MyAvailabilityPage />)
    expect(await screen.findByRole("heading", { level: 1, name: "Trop de tentatives" })).toBeInTheDocument()
  })

  it("says the connection failed and retries, focusing the page once loaded", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockRejectedValueOnce(new TypeError("offline")).mockImplementation(() => res(view()))
    vi.stubGlobal("fetch", fetchMock)
    render(<MyAvailabilityPage />)
    expect(await screen.findByRole("heading", { level: 1, name: "Connexion impossible" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Toujours impossible de charger la page."))
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    const title = await screen.findByRole("heading", { level: 1, name: "Mes disponibilités pour Festival" })
    await waitFor(() => expect(title).toHaveFocus())
  })

  it("gives the organisation's address once the deadline has passed", async () => {
    vi.stubGlobal("fetch", vi.fn(() => res(view({ open: false, deadline: "2020-01-01T10:00:00.000Z" }))))
    render(<MyAvailabilityPage />)
    expect(await screen.findByRole("link", { name: "contact@example.org" })).toHaveAttribute("href", "mailto:contact@example.org")
    expect(screen.getByText(/Pour une correction ou un nouveau lien, écris à Les Amis du Parc/)).toBeInTheDocument()
  })

  it("says the last changes were lost when the deadline passed mid-edit, with focus there and the deadline said once", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => res(view()))
      .mockImplementationOnce(() => res({ error: DEADLINE_PASSED_ERROR }, 409))
      .mockImplementationOnce(() => res(view({ open: false, deadline: "2020-01-01T10:00:00.000Z" })))
    vi.stubGlobal("fetch", fetchMock)
    render(<MyAvailabilityPage />)
    fireEvent.click((await screen.findAllByLabelText("Pas disponible"))[0])
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer mes disponibilités" }))
    const sentence = await screen.findByText("La date limite vient de passer : tes derniers changements n'ont pas été enregistrés. Voici les réponses que l'organisation a reçues.")
    await waitFor(() => expect(sentence).toHaveFocus())
    expect(screen.queryByText(/La date limite est passée/)).toBeNull()
  })
})
