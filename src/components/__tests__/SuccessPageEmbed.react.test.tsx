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
import { EMBED_PERSONAL_LINK_NOTE } from "@/lib/embed"

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

    expect(await screen.findByText(EMBED_PERSONAL_LINK_NOTE)).toBeInTheDocument()
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

  it("is unchanged outside the frame", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(registration))))
    search = "token=tok-1"
    render(<SuccessPage />)
    expect(await screen.findByRole("link", { name: "Accéder à mon inscription" })).not.toHaveAttribute("target")
    expect(screen.queryByText(EMBED_PERSONAL_LINK_NOTE)).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Retour à l.accueil/ })).toHaveAttribute("href", "/")
    expect(screen.getByRole("link", { name: "Espace organisateur" })).toBeInTheDocument()
  })
})
