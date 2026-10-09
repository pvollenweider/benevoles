/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import SignupSwitch from "../super-admin/SignupSwitch"

describe("SignupSwitch (#810)", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("closes, says so once, and offers to reopen on the same button", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ open: false, closedBy: "operator" }) })
    vi.stubGlobal("fetch", fetch)
    render(<SignupSwitch initial={{ open: true, closedBy: null }} />)

    const button = screen.getByRole("button", { name: "Fermer les inscriptions" })
    button.focus()
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByText("Inscriptions fermées.")).toHaveAttribute("role", "status"))
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ closed: true })
    expect(screen.getByRole("button", { name: "Rouvrir les inscriptions" })).toHaveFocus()
    expect(screen.getByText(/Les inscriptions sont fermées/)).toBeInTheDocument()
  })

  it("explains a closing by the server configuration, with no button that cannot work", () => {
    render(<SignupSwitch initial={{ open: false, closedBy: "config" }} />)
    expect(screen.getByText(/fermées par la configuration du serveur/)).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("keeps the state and shows the error when the change fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Non autorisé" }) }))
    render(<SignupSwitch initial={{ open: true, closedBy: null }} />)
    fireEvent.click(screen.getByRole("button", { name: "Fermer les inscriptions" }))
    await screen.findByText("Non autorisé")
    expect(screen.getByRole("button", { name: "Fermer les inscriptions" })).toHaveAccessibleDescription("Non autorisé")
  })
})
