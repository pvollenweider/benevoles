/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

import ShiftSeriesForm from "../admin/ShiftSeriesForm"

// « Créer une série de créneaux » (#393): the preview shows the shifts the API will create.

const fetchMock = vi.fn()

describe("ShiftSeriesForm", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const setup = (dates = ["2026-07-04"]) => {
    const onCreated = vi.fn()
    const onClose = vi.fn()
    render(<ShiftSeriesForm eventId="evt-1" dates={dates} existingShifts={[]} onCreated={onCreated} onClose={onClose} />)
    return { onCreated, onClose }
  }

  const fill = () => {
    fireEvent.change(screen.getByRole("combobox", { name: "Poste" }), { target: { value: "Buvette" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Début" }), { target: { value: "10:00" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Fin" }), { target: { value: "22:00" } })
  }

  it("focuses its heading when opened and previews the series as fields are filled", () => {
    setup()
    expect(screen.getByRole("heading", { name: "Créer une série de créneaux" })).toHaveFocus()
    expect(screen.getByText(/Renseignez le poste/)).toBeInTheDocument()

    fill()
    expect(screen.getByText(/Aperçu : 6 créneaux de 2 h, 2 personnes par créneau\./)).toBeInTheDocument()
    const items = within(screen.getByRole("list")).getAllByRole("listitem")
    expect(items).toHaveLength(6)
    expect(items[0]).toHaveTextContent("10:00–12:00")
    expect(screen.getByRole("button", { name: "Créer 6 créneaux" })).toBeInTheDocument()
  })

  it("normalizes typed times on blur and flags an impossible series", () => {
    setup()
    fill()
    const start = screen.getByRole("textbox", { name: "Début" })
    fireEvent.change(start, { target: { value: "9" } })
    fireEvent.blur(start)
    expect(start).toHaveValue("09:00")

    fireEvent.change(screen.getByLabelText("Durée personnalisée (minutes)"), { target: { value: "900" } })
    expect(screen.getByText("La durée d'un créneau dépasse la plage horaire.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Créer les créneaux" })).toBeInTheDocument()
  })

  // #587: like the shift editor, a missing field says its error itself and gets focus; no alert.
  it("refuses to submit with missing fields: each says its error, focus on the first, no alert", () => {
    setup()
    const create = screen.getByRole("button", { name: "Créer les créneaux" })
    create.focus()
    fireEvent.click(create)
    expect(fetchMock).not.toHaveBeenCalled()
    const role = screen.getByRole("combobox", { name: "Poste" })
    expect(role).toHaveFocus()
    expect(role).toHaveAttribute("aria-invalid", "true")
    expect(role).toHaveAccessibleDescription("Indiquez le poste.")
    expect(screen.getByRole("textbox", { name: "Début" })).toHaveAccessibleDescription("Indiquez l'heure de début.")
    expect(screen.getByRole("textbox", { name: "Fin" })).toHaveAccessibleDescription(/Une fin plus petite que le début passe minuit.*Indiquez l'heure de fin\./)
    expect(screen.queryAllByRole("alert").filter((a) => a.textContent?.trim())).toHaveLength(0)
    expect(screen.getByText("À remplir : le poste, l'heure de début et l'heure de fin.")).toBeInTheDocument()

    fireEvent.change(role, { target: { value: "Buvette" } })
    expect(role).not.toHaveAttribute("aria-invalid")
    expect(role).not.toHaveAccessibleDescription()
  })

  it("on a multi-day event, an unchosen date is invalid and says so", () => {
    setup(["2026-07-04", "2026-07-05"])
    fireEvent.change(screen.getByRole("combobox", { name: "Poste" }), { target: { value: "Buvette" } })
    fireEvent.click(screen.getByRole("button", { name: "Créer les créneaux" }))
    const date = screen.getByRole("combobox", { name: "Date" })
    expect(date).toHaveFocus()
    expect(date).toHaveAccessibleDescription("Choisissez la date.")
  })

  it("names the required fields without their asterisk, which stays visible; none on a one-day date", () => {
    setup(["2026-07-04", "2026-07-05"])
    for (const [role, name] of [["combobox", "Poste"], ["combobox", "Date"], ["textbox", "Début"], ["textbox", "Fin"], ["combobox", "Durée d'un créneau"], ["spinbutton", "Personnes par créneau"]] as const) {
      const field = screen.getByRole(role, { name })
      expect(field).toBeRequired()
      expect(document.querySelector(`label[for="${field.id}"] [aria-hidden="true"]`)).toHaveTextContent("*")
    }
    cleanup()
    setup()
    expect(screen.getByRole("textbox", { name: "Date" })).toHaveAttribute("readonly")
    expect(document.querySelector(`label[for="${screen.getByRole("textbox", { name: "Date" }).id}"]`)).not.toHaveTextContent("*")
  })

  it("reads the previewed times in words", () => {
    setup()
    fill()
    const first = within(screen.getByRole("list", { name: "Créneaux qui seront créés" })).getAllByRole("listitem")[0]
    expect(within(first).getByText("10:00–12:00")).toHaveAttribute("aria-hidden", "true")
    expect(within(first).getByText("de 10h à 12h")).toHaveClass("sr-only")
  })

  it("posts the series and hands the created shifts back", async () => {
    const created = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, roleName: "Buvette", label: "Buvette", date: "2026-07-04T00:00:00.000Z", startTime: "10:00", endTime: "12:00", capacity: 3, status: "open", displayOrder: 0 }))
    fetchMock.mockResolvedValue({ ok: true, json: async () => created })
    const { onCreated } = setup()
    fill()
    fireEvent.change(screen.getByRole("spinbutton", { name: "Personnes par créneau" }), { target: { value: "3" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Activer la liste d'attente" }))
    fireEvent.click(screen.getByRole("button", { name: "Créer 6 créneaux" }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/shifts/series")
    expect(JSON.parse(init.body)).toMatchObject({ eventId: "evt-1", roleName: "Buvette", date: "2026-07-04", startTime: "10:00", endTime: "22:00", slotMinutes: 120, breakMinutes: 0, capacity: 3, waitlistEnabled: true })
    expect(onCreated.mock.calls[0][0][0]).toMatchObject({ id: "s0", date: "2026-07-04", registrationCount: 0 })
  })

  it("shows the server's error and keeps the form", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Événement introuvable" }) })
    const { onCreated } = setup()
    fill()
    fireEvent.click(screen.getByRole("button", { name: "Créer 6 créneaux" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Événement introuvable")
    expect(onCreated).not.toHaveBeenCalled()
  })

  it("« Annuler » asks to close", () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
