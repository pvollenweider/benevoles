/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import ForgotPasswordPage from "../page"
import { FORGOT_PASSWORD_DONE } from "@/lib/forgot-password-copy"

// The « Mot de passe oublié » confirmation: one answer for every case (known address or not,
// inactive account, a request over the per-address cap), which never claims an email left.

async function submitWith(response: { ok: boolean; status: number; body: unknown }) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: response.ok, status: response.status, json: async () => response.body }))
  const { container } = render(<ForgotPasswordPage />)
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.org" } })
  fireEvent.click(screen.getByRole("button", { name: "Envoyer le lien" }))
  const heading = await screen.findByRole("heading", { level: 2, name: FORGOT_PASSWORD_DONE.title })
  return { heading, container }
}

describe("/admin/forgot-password confirmation", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it("says the request is recorded, not that an email was sent, and what to do when nothing arrives", async () => {
    const { heading } = await submitWith({ ok: true, status: 200, body: { ok: true } })
    expect(heading).toHaveTextContent("Demande enregistrée")
    // The heading is focused by an effect, which React may run just after the commit that shows it
    // (the update comes from the fetch, outside act): wait for the focus rather than read it at once.
    await waitFor(() => expect(heading).toHaveFocus())
    expect(heading).toHaveAttribute("tabindex", "-1")
    expect(screen.getByText("Si cette adresse est associée à un compte, vous recevrez un lien valable 1 heure.")).toBeInTheDocument()
    expect(screen.getByText("Rien reçu ? Regardez dans vos indésirables. Le dernier lien reçu reste valable. Après plusieurs demandes, attendez une heure avant de redemander.")).toBeInTheDocument()
    expect(screen.queryByText(/Email envoyé/)).toBeNull()
    expect(screen.getByRole("link", { name: "Retour à la connexion" })).toHaveAttribute("href", "/admin/login")
  })

  it("shows exactly the same confirmation whatever the server decided", async () => {
    const shown: string[] = []
    // The route answers { ok: true } for a known, unknown, inactive or capped address alike; a
    // rejected address (400) also ends on the confirmation, never on a different text.
    for (const response of [
      { ok: true, status: 200, body: { ok: true } },
      { ok: false, status: 400, body: { error: "Email invalide." } },
    ]) {
      const { container } = await submitWith(response)
      shown.push(container.textContent ?? "")
      cleanup()
    }
    expect(new Set(shown).size).toBe(1)
  })
})
