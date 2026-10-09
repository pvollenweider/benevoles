/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import SignupForm from "../public/signup/SignupForm"
import { DESCRIPTION_SHORT_MESSAGE } from "@/lib/signup"

describe("SignupForm, « Votre association et votre besoin » (#810)", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  function fill(description: string) {
    fireEvent.change(screen.getByLabelText("Nom de l'association"), { target: { value: "Fête du village" } })
    fireEvent.change(screen.getByLabelText("Votre association et votre besoin"), { target: { value: description } })
    fireEvent.change(screen.getByLabelText("Votre nom"), { target: { value: "Camille" } })
    fireEvent.change(screen.getByLabelText("Votre adresse email"), { target: { value: "camille@example.org" } })
  }

  it("asks for a few sentences: the field is marked, described by the error and focused, nothing is sent", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    render(<SignupForm open />)
    fill("Une fête.")
    fireEvent.click(screen.getByRole("button", { name: "Créer mon espace" }))

    const field = screen.getByLabelText("Votre association et votre besoin")
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field).toHaveAccessibleDescription(expect.stringContaining(DESCRIPTION_SHORT_MESSAGE))
    expect(field).toHaveAccessibleDescription(expect.stringContaining("Nous le lisons avant de valider votre espace."))
    expect(fetch).not.toHaveBeenCalled()
  })

  it("sends the description with the rest of the form", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal("fetch", fetch)
    render(<SignupForm open />)
    fill("Fête de village, une centaine de bénévoles sur deux jours.")
    fireEvent.click(screen.getByRole("button", { name: "Créer mon espace" }))

    await screen.findByRole("heading", { name: "Vérifiez votre boîte email" })
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ description: "Fête de village, une centaine de bénévoles sur deux jours." })
  })
})
