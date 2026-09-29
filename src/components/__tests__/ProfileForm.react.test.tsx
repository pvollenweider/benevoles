/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

const push = vi.hoisted(() => vi.fn())
const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
const signIn = vi.hoisted(() => vi.fn())
vi.mock("next-auth/react", () => ({ signIn }))

import ProfileForm from "@/app/super-admin/profile/ProfileForm"

// Super-admin profile form: fields labelled, a network failure doesn't leave the form stuck, and an
// email change re-renders the page so the new address shows.

describe("ProfileForm", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

  it("labels every field", () => {
    render(<ProfileForm currentEmail="sa@x.ch" />)
    expect(screen.getByLabelText("Email")).toHaveValue("sa@x.ch")
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveAttribute("autocomplete", "new-password")
    expect(screen.getByLabelText(/Mot de passe actuel/)).toHaveAttribute("autocomplete", "current-password")
  })

  it("reports a network failure and gives the form back", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    render(<ProfileForm currentEmail="sa@x.ch" />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@x.ch" } })
    fireEvent.change(screen.getByLabelText(/Mot de passe actuel/), { target: { value: "secret" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Impossible d'enregistrer"))
    expect(screen.getByRole("button", { name: "Enregistrer les modifications" })).not.toHaveAttribute("aria-disabled")
  })

  it("re-renders the page after an email change", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
    render(<ProfileForm currentEmail="sa@x.ch" />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@x.ch" } })
    fireEvent.change(screen.getByLabelText(/Mot de passe actuel/), { target: { value: "secret" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Profil mis à jour"))
    expect(refresh).toHaveBeenCalledOnce()
    expect(signIn).not.toHaveBeenCalled() // email only: no new password, no sign-in again
  })

  it("keeps the submit button focusable and points the error at the field at fault", async () => {
    render(<ProfileForm currentEmail="sa@x.ch" />)
    const submit = screen.getByRole("button", { name: "Enregistrer les modifications" })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Le mot de passe actuel est obligatoire."))
    const current = screen.getByLabelText(/Mot de passe actuel/)
    expect(current).toHaveAttribute("aria-invalid", "true")
    expect(current).toHaveFocus()

    fireEvent.change(current, { target: { value: "secret" } })
    fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), { target: { value: "Nouveau-mot2passe" } })
    fireEvent.change(screen.getByLabelText(/Confirmer le nouveau mot de passe/), { target: { value: "autre" } })
    fireEvent.click(submit)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Les mots de passe ne correspondent pas."))
    expect(screen.getByLabelText(/Confirmer le nouveau mot de passe/)).toHaveAttribute("aria-invalid", "true")
    expect(current).not.toHaveAttribute("aria-invalid")
  })
})
