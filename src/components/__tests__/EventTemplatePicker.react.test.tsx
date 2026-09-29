/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))

import EventTemplatePicker from "../admin/EventTemplatePicker"

// Event templates (#395): blank form by default, a template needs a title and a date.
describe("EventTemplatePicker", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    push.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const setup = () => render(<EventTemplatePicker><p>formulaire vierge</p></EventTemplatePicker>)

  it("shows the blank form until a template is picked, then the template's details", () => {
    setup()
    expect(screen.getByRole("radio", { name: /Page blanche/ })).toBeChecked()
    expect(screen.getByText("formulaire vierge")).toBeInTheDocument()

    // A real click or arrow key focuses the radio; jsdom's fireEvent doesn't.
    screen.getByRole("radio", { name: /^Buvette/ }).focus()
    fireEvent.click(screen.getByRole("radio", { name: /^Buvette/ }))
    expect(screen.queryByText("formulaire vierge")).toBeNull()
    expect(screen.getByRole("heading", { name: "Buvette", level: 2 })).toBeInTheDocument()
    // Focus stays on the radio so arrow keys still browse the templates.
    expect(screen.getByRole("radio", { name: /^Buvette/ })).toHaveFocus()
    expect(screen.getByText("Modèle Buvette sélectionné.")).toBeInTheDocument()
    expect(screen.getByLabelText("Titre")).toHaveValue("Buvette")
    expect(screen.getByText("Bar").closest("li")).toHaveTextContent("Bar : 4 créneaux, 12 places")
    expect(screen.getByRole("button", { name: "Créer le brouillon (10 créneaux)" })).toBeInTheDocument()
  })

  it("keeps a title the organizer typed when switching templates", () => {
    setup()
    fireEvent.click(screen.getByRole("radio", { name: /^Buvette/ }))
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Ma fête" } })
    fireEvent.click(screen.getByRole("radio", { name: /Fête de village/ }))
    expect(screen.getByLabelText("Titre")).toHaveValue("Ma fête")
    expect(screen.getByLabelText("Premier jour (obligatoire)")).toBeInTheDocument()
  })

  it("requires the date, then creates the draft and goes to its shifts", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "evt-9", shiftCount: 10 }) })
    setup()
    fireEvent.click(screen.getByRole("radio", { name: /^Buvette/ }))
    fireEvent.click(screen.getByRole("button", { name: /Créer le brouillon/ }))
    expect(screen.getByRole("alert")).toHaveTextContent("Champ obligatoire manquant : date.")
    expect(screen.getByLabelText("Date (obligatoire)")).toHaveFocus()
    expect(screen.getByLabelText("Date (obligatoire)")).toHaveAccessibleDescription(/Champ obligatoire manquant : date\./)
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("Date (obligatoire)"), { target: { value: "2026-08-01" } })
    fireEvent.click(screen.getByRole("button", { name: /Créer le brouillon/ }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/events/evt-9/shifts?wizard=1"))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ templateId: "buvette", title: "Buvette", startDate: "2026-08-01" })
  })

  it("shows the server's error", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Modèle inconnu." }) })
    setup()
    fireEvent.click(screen.getByRole("radio", { name: /Manifestation sportive/ }))
    fireEvent.change(screen.getByLabelText("Date (obligatoire)"), { target: { value: "2026-08-01" } })
    fireEvent.click(screen.getByRole("button", { name: /Créer le brouillon/ }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Modèle inconnu.")
    expect(push).not.toHaveBeenCalled()
  })
})
