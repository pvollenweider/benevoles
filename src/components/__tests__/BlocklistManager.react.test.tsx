/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import BlocklistManager from "../super-admin/BlocklistManager"

const blocks = [
  { id: "b1", kind: "email", label: "spam@example.org", reason: "Spam", expiresAt: null, createdAt: "2026-10-09T10:00:00.000Z" },
  { id: "b2", kind: "domain", label: "evil.example", reason: "Spam", expiresAt: null, createdAt: "2026-10-09T09:00:00.000Z" },
]

describe("BlocklistManager (#810, part 5)", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("moves the focus to the next « Retirer » after a removal, then to the list heading", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
    render(<BlocklistManager initialBlocks={blocks} />)

    fireEvent.click(screen.getByRole("button", { name: "Retirer spam@example.org" }))
    fireEvent.click(await screen.findByRole("button", { name: "Retirer" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Retirer evil.example" })).toHaveFocus())
    expect(screen.queryByText("spam@example.org", { selector: "th" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Retirer evil.example" }))
    fireEvent.click(await screen.findByRole("button", { name: "Retirer" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Entrées" })).toHaveFocus())
    expect(screen.getByText("Aucune entrée.")).toBeInTheDocument()
  })

  it("marks and focuses the field the server names, and shows the confirmation box for a common provider", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Indiquez la raison du blocage (3 à 300 caractères).", field: "reason" }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "gmail.com est utilisé par beaucoup de personnes…", field: "value", needsConfirmation: true }) }))
    render(<BlocklistManager initialBlocks={[]} />)

    fireEvent.change(screen.getByLabelText("Adresse email à bloquer"), { target: { value: "a@b.ch" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à la liste" }))
    await waitFor(() => expect(screen.getByLabelText("Raison")).toHaveFocus())
    expect(screen.getByLabelText("Raison")).toHaveAttribute("aria-invalid", "true")

    fireEvent.click(screen.getByRole("radio", { name: "Domaine" }))
    fireEvent.change(screen.getByLabelText("Domaine à bloquer"), { target: { value: "gmail.com" } })
    fireEvent.change(screen.getByLabelText("Raison"), { target: { value: "Vague de spam" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à la liste" }))
    const box = await screen.findByRole("checkbox", { name: /Je confirme vouloir bloquer ce domaine/ })
    await waitFor(() => expect(box).toHaveFocus())
    // Editing the value hides the box again.
    fireEvent.change(screen.getByLabelText("Domaine à bloquer"), { target: { value: "gmail.co" } })
    expect(screen.queryByRole("checkbox")).toBeNull()
  })
})
