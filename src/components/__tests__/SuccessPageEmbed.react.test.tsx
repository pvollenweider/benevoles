/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"

let search = ""
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useParams: () => ({ eventSlug: "fete" }),
}))

import SuccessPage from "@/app/[eventSlug]/success/page"
import { PERSONAL_LINK_EMAIL_NOTE } from "@/lib/personal-link"
import { UNPROVEN_HEADING, UNPROVEN_TEXT } from "@/lib/signup-outcome"

// The confirmation of the embedded sign-up (#948): the personal link in a new tab and in the
// email, no push button (a third-party frame may not ask for notifications), back to the schedule.

const registration = {
  volunteer: { firstName: "Aline", email: "aline@example.org" },
  registrations: [{ shift: { label: "Bar", date: "2030-06-01T00:00:00.000Z", startTime: "10:00" } }],
  confirmationMessage: null,
}

describe("success page — embedded (#948)", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    search = ""
  })

  it("says the email has the personal link, opens it in a new tab, offers no push, goes back to the schedule", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(registration))))
    search = "token=tok-1&org=club&groupe=abcd2345&embed=1"
    render(<SuccessPage />)

    expect(await screen.findByText(PERSONAL_LINK_EMAIL_NOTE)).toBeInTheDocument()
    const personal = screen.getByRole("link", { name: "Accéder à mon inscription (ouvre dans un nouvel onglet)" })
    expect(personal).toHaveAttribute("href", "/my/tok-1")
    expect(personal).toHaveAttribute("target", "_blank")
    await waitFor(() => expect(screen.queryByText("Chargement des détails")).not.toBeInTheDocument())
    expect(screen.queryByRole("button", { name: /rappels/i })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Revenir au planning" })).toHaveAttribute("href", "/fete?org=club&groupe=abcd2345&embed=1")
    expect(screen.queryByRole("link", { name: /Retour à l.accueil/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Espace organisateur" })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus()
  })

  it("outside the frame, links the personal page itself and goes back to the event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(registration))))
    search = "token=tok-1"
    render(<SuccessPage />)
    expect(await screen.findByRole("link", { name: "Accéder à mon inscription" })).not.toHaveAttribute("target")
    expect(screen.queryByText(PERSONAL_LINK_EMAIL_NOTE)).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Revenir à l'événement" })).toHaveAttribute("href", "/fete")
    expect(screen.queryByRole("link", { name: /Retour à l.accueil/ })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Espace organisateur" })).toBeInTheDocument()
  })
})

// A public sign-up without proof of the address (AUTHZ-01, #285): the server answers the same
// whatever happened, so the page claims nothing (no place, waitlist or request) and sends to the
// emails; no dead end (#1097): the guide on the personal link, and back to the event.
describe("success page — public sign-up without a link", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    search = ""
  })

  it("says the request was received and the emails tell the rest, links the guide, goes back to the event", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    search = "org=club"
    render(<SuccessPage />)
    expect(screen.getByRole("heading", { level: 1, name: UNPROVEN_HEADING })).toBeInTheDocument()
    expect(screen.getByText(UNPROVEN_TEXT.replace(/\s+/g, " "))).toBeInTheDocument()
    expect(screen.queryByText(/Inscription confirmée|liste d'attente|Demande envoyée/)).not.toBeInTheDocument()
    expect(screen.queryByText(PERSONAL_LINK_EMAIL_NOTE)).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /^En savoir plus sur ton lien personnel/ })).toHaveAttribute("href", "/doc/lien-personnel")
    expect(screen.queryByRole("link", { name: /Accéder à mon inscription/ })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Revenir à l'événement" })).toHaveAttribute("href", "/fete?org=club")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("claims no outcome even when the address carries one", () => {
    vi.stubGlobal("fetch", vi.fn())
    search = "waitlist=1&requested=1&active=0"
    render(<SuccessPage />)
    expect(screen.getByRole("heading", { level: 1, name: UNPROVEN_HEADING })).toBeInTheDocument()
    expect(screen.queryByText(/Comment ça marche|sur validation/)).not.toBeInTheDocument()
  })

  it("embedded, the heading takes the focus", () => {
    vi.stubGlobal("fetch", vi.fn())
    search = "embed=1"
    render(<SuccessPage />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus()
  })
})
