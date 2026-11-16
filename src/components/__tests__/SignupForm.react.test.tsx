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
    render(<SignupForm open siteName="exemple.org" />)
    fill("Une fête.")
    fireEvent.click(screen.getByRole("button", { name: "Créer mon espace" }))

    const field = screen.getByLabelText("Votre association et votre besoin")
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field).toHaveAccessibleDescription(expect.stringContaining(DESCRIPTION_SHORT_MESSAGE))
    // The length rule is said before any error (the field also stops at 1000 characters).
    expect(field).toHaveAccessibleDescription(expect.stringContaining("Nous le lisons avant de valider votre espace. Entre 20 et 1000 caractères."))
    expect(fetch).not.toHaveBeenCalled()
  })

  it("sends the description with the rest of the form", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal("fetch", fetch)
    render(<SignupForm open siteName="exemple.org" />)
    fill("Fête de village, une centaine de bénévoles sur deux jours.")
    fireEvent.click(screen.getByRole("button", { name: "Créer mon espace" }))

    await screen.findByRole("heading", { name: "Vérifiez votre boîte email" })
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ description: "Fête de village, une centaine de bénévoles sur deux jours." })
  })
})

describe("SignupForm, « Comment avez-vous connu … ? » (#1094)", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  function fillRequired() {
    fireEvent.change(screen.getByLabelText("Nom de l'association"), { target: { value: "Fête du village" } })
    fireEvent.change(screen.getByLabelText("Votre association et votre besoin"), { target: { value: "Fête de village, une centaine de bénévoles sur deux jours." } })
    fireEvent.change(screen.getByLabelText("Votre nom"), { target: { value: "Camille" } })
    fireEvent.change(screen.getByLabelText("Votre adresse email"), { target: { value: "camille@example.org" } })
  }
  const sent = (fetch: ReturnType<typeof vi.fn>) => JSON.parse(fetch.mock.calls[0][1].body)

  it("is optional and empty by default: the request goes without an answer", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal("fetch", fetch)
    render(<SignupForm open siteName="exemple.org" />)
    const select = screen.getByLabelText("Comment avez-vous connu exemple.org ? (facultatif)")
    expect(select).toHaveValue("")
    expect(select).not.toBeRequired()
    expect(select).toHaveAccessibleDescription("Pour savoir comment les associations nous trouvent. Sans réponse, rien ne change.")
    expect(screen.queryByLabelText(/Précisez/)).toBeNull()
    fillRequired()
    fireEvent.click(screen.getByRole("button", { name: "Créer mon espace" }))
    await screen.findByRole("heading", { name: "Vérifiez votre boîte email" })
    expect(sent(fetch)).toMatchObject({ source: "", sourceDetail: "" })
  })

  it("shows the precision with « Autre » only, keeps its text while the choice moves, sends it with « Autre » only", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal("fetch", fetch)
    render(<SignupForm open siteName="exemple.org" />)
    const select = screen.getByLabelText(/Comment avez-vous connu/)
    fireEvent.change(select, { target: { value: "other" } })
    fireEvent.change(screen.getByLabelText("Précisez comment vous nous avez connus (facultatif)"), { target: { value: "la commune" } })
    fireEvent.change(select, { target: { value: "event" } })
    expect(screen.queryByLabelText(/Précisez/)).toBeNull()
    fireEvent.change(select, { target: { value: "other" } })
    expect(screen.getByLabelText(/Précisez/)).toHaveValue("la commune")
    fireEvent.change(select, { target: { value: "social" } })
    fillRequired()
    fireEvent.click(screen.getByRole("button", { name: "Créer mon espace" }))
    await screen.findByRole("heading", { name: "Vérifiez votre boîte email" })
    expect(sent(fetch)).toMatchObject({ source: "social", sourceDetail: "" })
  })
})
