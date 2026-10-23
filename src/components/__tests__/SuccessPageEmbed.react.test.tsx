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

// No dead end after a public sign-up (#1097): no link on screen without proof of the address
// (#285), so the page says where it is, and goes back to the event.
describe("success page — public sign-up without a link (#1097)", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    search = ""
  })

  it("says the personal link is in the email, links the guide, goes back to the event", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    search = "org=club"
    render(<SuccessPage />)
    expect(screen.getByText(PERSONAL_LINK_EMAIL_NOTE)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /^En savoir plus sur ton lien personnel/ })).toHaveAttribute("href", "/doc/lien-personnel")
    expect(screen.queryByRole("link", { name: /Accéder à mon inscription/ })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Revenir à l'événement" })).toHaveAttribute("href", "/fete?org=club")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("says nothing about a personal link for a waiting list only (its email has none)", () => {
    vi.stubGlobal("fetch", vi.fn())
    search = "waitlist=1"
    render(<SuccessPage />)
    expect(screen.queryByText(PERSONAL_LINK_EMAIL_NOTE)).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Revenir à l'événement" })).toHaveAttribute("href", "/fete")
  })
})
