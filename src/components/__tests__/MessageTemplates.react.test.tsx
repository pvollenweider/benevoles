/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import MessageTemplatesManager from "../admin/messages/MessageTemplatesManager"
import TargetedMessageForm from "../admin/TargetedMessageForm"

// Message templates (#482).
const templates = [{ id: "t1", name: "Merci", subject: "Merci {prénom}", body: "Merci pour {événement} !" }]

describe("MessageTemplatesManager", () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("asks before deleting, and deletes only on confirmation", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    render(<MessageTemplatesManager initialTemplates={templates} />)
    fireEvent.click(screen.getByRole("button", { name: "Supprimer le modèle « Merci »" }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Supprimer le modèle « Merci » ?")
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/message-templates/t1", { method: "DELETE" }))
    expect(await screen.findByText("Modèle « Merci » supprimé.")).toBeInTheDocument()
  })

  it("flags an unknown variable on its field before saving", () => {
    render(<MessageTemplatesManager initialTemplates={[]} />)
    fireEvent.click(screen.getByRole("button", { name: "Nouveau modèle" }))
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Bonjour {nom}" } })
    expect(screen.getByLabelText("Objet *")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Objet *")).toHaveAccessibleDescription(/Variable inconnue : \{nom\}/)
  })
})

describe("TargetedMessageForm — templates", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ recipients: 3, audience: "tous", preview: null }) })
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("applies a template only on « Utiliser ce modèle », and can restore the previous text", () => {
    render(<TargetedMessageForm eventId="e1" roles={["Bar"]} shifts={[]} initialAudience={{ kind: "event" }} templates={templates} />)
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Mon objet" } })
    fireEvent.change(screen.getByLabelText("Partir d'un modèle"), { target: { value: "t1" } })
    expect(screen.getByLabelText("Objet *")).toHaveValue("Mon objet")
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce modèle" }))
    expect(screen.getByLabelText("Objet *")).toHaveValue("Merci {prénom}")
    fireEvent.click(screen.getByRole("button", { name: "Rétablir le texte précédent" }))
    expect(screen.getByLabelText("Objet *")).toHaveValue("Mon objet")
  })

  it("puts a variable problem on the field that has it", () => {
    render(<TargetedMessageForm eventId="e1" roles={["Bar"]} shifts={[]} initialAudience={{ kind: "event" }} templates={[]} />)
    fireEvent.change(screen.getByLabelText("Objet *"), { target: { value: "Au {poste}" } })
    expect(screen.getByLabelText("Objet *")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Message *")).not.toHaveAttribute("aria-invalid")
  })
})
