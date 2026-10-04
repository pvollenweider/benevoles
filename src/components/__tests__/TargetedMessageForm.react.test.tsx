/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import TargetedMessageForm from "../admin/TargetedMessageForm"

// « Écrire aux bénévoles » (#396): audience, live count, preview, confirmation, one send.

const fetchMock = vi.fn()
const json = (body: unknown, ok = true) => ({ ok, json: async () => body })

function lastBody() {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
  return JSON.parse(init.body)
}

describe("TargetedMessageForm", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      if (body.dryRun) {
        const n = body.audience.kind === "waitlist" ? 0 : body.audience.kind === "role" ? 3 : 12
        return json({ recipients: n, audience: `aud:${body.audience.kind}`, preview: n ? { subject: `${body.subject} — Fête`, html: "<p>hi</p>" } : null })
      }
      return json({ sent: 3, audience: "aud:role" })
    })
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const setup = (initialAudience: Parameters<typeof TargetedMessageForm>[0]["initialAudience"] = { kind: "event" }) =>
    render(<TargetedMessageForm eventId="evt-1" roles={["Bar", "Accueil"]} shifts={[{ id: "s1", roleName: "Bar", name: "Bar — sam. 4 juil., 10:00–12:00" }]} initialAudience={initialAudience} />)

  it("counts the recipients of the chosen audience and disables sending when nobody matches", async () => {
    setup()
    expect(await screen.findByText("12 personnes recevront ce message.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: "Les personnes en liste d'attente" }))
    expect(await screen.findByText("Personne à qui écrire dans cette sélection.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" })).toHaveAccessibleDescription("Personne à qui écrire dans cette sélection.")
  })

  it("starts on the prefilled audience and its dependent select", async () => {
    setup({ kind: "role", roleName: "Accueil" })
    expect(screen.getByRole("radio", { name: "Les bénévoles d'un poste" })).toBeChecked()
    expect(screen.getByRole("combobox", { name: "Poste" })).toHaveValue("Accueil")
    await waitFor(() => expect(lastBody().audience).toEqual({ kind: "role", roleName: "Accueil" }))
  })

  it("names the missing fields instead of previewing", async () => {
    setup()
    await screen.findByText(/12 personnes/)
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Champs obligatoires manquants : objet, message.")
    expect(screen.getByLabelText("Objet *")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Objet *")).toHaveFocus()
  })

  it("previews, asks for confirmation with the count, sends once, then announces the result", async () => {
    setup({ kind: "role", roleName: "Bar" })
    await screen.findByText("3 personnes recevront ce message.")
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Parking" } })
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Entrée par la rue Basse." } })
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))

    const preview = await screen.findByRole("dialog", { name: "Aperçu de l'email" })
    expect(preview).toHaveTextContent("Objet : Parking — Fête")
    expect(lastBody()).toMatchObject({ audience: { kind: "role", roleName: "Bar" }, subject: "Parking", message: "Entrée par la rue Basse.", dryRun: true })
    fireEvent.click(screen.getByRole("button", { name: "Envoyer à 3 personnes" }))

    const confirm = await screen.findByRole("dialog", { name: "Confirmer l'envoi" })
    expect(confirm).toHaveTextContent("« Parking » va partir à 3 personnes")
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'envoi" }))

    const done = await screen.findByRole("heading", { name: "Message envoyé à 3 personnes" })
    // The heading is in the DOM before React runs the passive effects (the dialog's cleanup, then
    // the focus move): under load the assertion used to land in between, with focus on <body>.
    await waitFor(() => expect(done).toHaveFocus())
    const sends = fetchMock.mock.calls.filter(([, init]) => !JSON.parse(init.body).dryRun)
    expect(sends).toHaveLength(1)
    expect(JSON.parse(sends[0][1].body)).toEqual({ audience: { kind: "role", roleName: "Bar" }, subject: "Parking", message: "Entrée par la rue Basse.", push: false })
  })

  it("warns, but never blocks, when some recipients have an address to verify (#599)", async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      if (body.dryRun) return json({ recipients: 3, audience: "aud:role", preview: { subject: `${body.subject} — Fête`, html: "<p>hi</p>" }, addressesToVerify: 2 })
      return json({ sent: 3, audience: "aud:role" })
    })
    setup({ kind: "role", roleName: "Bar" })
    await screen.findByText("3 personnes recevront ce message.")
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Parking" } })
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Entrée par la rue Basse." } })
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))

    const preview = await screen.findByRole("dialog", { name: "Aperçu de l'email" })
    expect(preview).toHaveTextContent("2 destinataires ont une adresse à vérifier")
    const sendButton = screen.getByRole("button", { name: "Envoyer à 3 personnes" })
    expect(sendButton).not.toHaveAttribute("aria-disabled", "true")
    fireEvent.click(sendButton)

    const confirm = await screen.findByRole("dialog", { name: "Confirmer l'envoi" })
    expect(confirm).toHaveTextContent("2 destinataires ont une adresse à vérifier")
    expect(screen.getByRole("button", { name: "Confirmer l'envoi" })).not.toHaveAttribute("aria-disabled", "true")
  })

  it("shows the server's refusal", async () => {
    setup()
    await screen.findByText(/12 personnes/)
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "x" } })
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "y" } })
    fetchMock.mockResolvedValueOnce(json({ error: "Trop de messages envoyés cette heure. Réessayez plus tard." }, false))
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu et envoyer" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop de messages envoyés cette heure.")
  })
})
