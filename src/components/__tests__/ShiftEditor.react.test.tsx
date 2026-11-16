/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import ShiftEditor from "../admin/shifts/ShiftEditor"

// The quick-add / edit form of the admin shifts page.

const fetchMock = vi.fn()

// CoordinatesField keeps an empty alert region mounted: only alerts that say something count.
const spokenAlerts = () => screen.queryAllByRole("alert").filter((a) => a.textContent?.trim())

describe("ShiftEditor", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const setup = (props: Partial<React.ComponentProps<typeof ShiftEditor>> = {}) => {
    const onSaved = vi.fn()
    const onCancel = vi.fn()
    render(
      <ShiftEditor
        eventId="evt-1"
        dates={["2026-07-04"]}
        editingId={null}
        initial={{ date: "2026-07-04" }}
        existingShifts={[]}
        onSaved={onSaved}
        onCancel={onCancel}
        {...props}
      />,
    )
    return { onSaved, onCancel }
  }

  // #1171 lot 2: « Repas sur le pouce possible » and « Lieu de la mission », only where the protection can be used.
  it("offers the place of the mission (active places, its own archived one) and sends it; nothing otherwise", async () => {
    setup()
    expect(screen.queryByLabelText("Lieu de la mission")).toBeNull()
    expect(screen.queryByLabelText("Repas sur le pouce possible")).toBeNull()
    cleanup()
    const places = [
      { id: "p1", name: "Grande Scène", displayOrder: 0, archivedAt: null },
      { id: "p2", name: "Le Dôme", displayOrder: 1, archivedAt: "2026-10-29T10:00:00Z" },
      { id: "p3", name: "Chapiteau", displayOrder: 2, archivedAt: null },
    ]
    setup({ places, mealOnTheGoShown: true, editingId: "s9", initial: { roleName: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "11:00", placeId: "p2" } })
    const select = screen.getByLabelText("Lieu de la mission")
    expect(select).toHaveAccessibleDescription(/Les bénévoles lisent toujours le champ « Lieu de rendez-vous »/)
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual(["Aucun lieu (trajet non vérifié)", "Grande Scène", "Chapiteau", "Le Dôme (archivé)"])
    expect(screen.getByLabelText("Repas sur le pouce possible")).toHaveAccessibleDescription(/reste comptée comme du travail/)
    fireEvent.change(select, { target: { value: "" } })
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "s9", roleName: "Bar" }) })
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ placeId: null })
  })

  it("is a group named by its title, with focus on « Poste * » when it opens (#554)", () => {
    setup()
    expect(screen.getByRole("group", { name: "Nouveau créneau" })).toBeInTheDocument()
    expect(screen.getByLabelText("Poste *")).toHaveFocus()
    cleanup()
    setup({ editingId: "s9", initial: { roleName: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "11:00" } })
    expect(screen.getByRole("group", { name: "Modifier le créneau" })).toBeInTheDocument()
    expect(screen.getByLabelText("Poste *")).toHaveFocus()
  })

  it("refuses to save with missing fields: each field says its error, focus goes to the first one (#554)", async () => {
    setup()
    expect(screen.getByRole("heading", { name: "Nouveau créneau" })).toBeInTheDocument()
    const submit = screen.getByRole("button", { name: "Ajouter" })
    submit.focus()
    fireEvent.click(submit)
    expect(fetchMock).not.toHaveBeenCalled()

    const role = screen.getByLabelText("Poste *")
    await waitFor(() => expect(role).toHaveFocus())
    expect(role).toHaveAttribute("aria-invalid", "true")
    expect(role).toHaveAccessibleDescription(/Indiquez le poste\./)
    expect(screen.getByLabelText("Début *")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Début *")).toHaveAccessibleDescription("Indiquez l'heure de début.")
    expect(screen.getByLabelText("Fin *")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Libellé")).not.toHaveAttribute("aria-invalid")
    expect(screen.getByRole("spinbutton", { name: "Places" })).not.toHaveAttribute("aria-invalid")
    // A visible reminder, not live: the field errors are reached by focus, so no alert at all.
    expect(screen.getByText("À remplir : le poste, l'heure de début et l'heure de fin.")).toBeInTheDocument()
    expect(spokenAlerts()).toHaveLength(0)
    expect(screen.queryByText(/en rouge/)).toBeNull()
  })

  it("on a multi-day event, an unchosen date is the first invalid field and says so", async () => {
    setup({ dates: ["2026-07-04", "2026-07-05"], initial: { roleName: "Bar", startTime: "10:00", endTime: "11:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    expect(fetchMock).not.toHaveBeenCalled()
    const date = screen.getByLabelText("Date *")
    await waitFor(() => expect(date).toHaveFocus())
    expect(date).toHaveAttribute("aria-invalid", "true")
    expect(date).toHaveAccessibleDescription("Choisissez la date.")
  })

  it("has no asterisk on the read-only date of a one-day event", () => {
    setup()
    expect(screen.getByLabelText("Date")).toHaveAttribute("readonly")
    expect(screen.queryByLabelText("Date *")).toBeNull()
  })

  // DESIGN.md « Champ obligatoire » (#587): the asterisk is shown, not read « étoile »; the field
  // itself says « obligatoire » (required).
  it("names the required fields without their asterisk, which stays visible", () => {
    setup({ dates: ["2026-07-04", "2026-07-05"], initial: {} })
    for (const [role, name] of [["combobox", "Poste"], ["combobox", "Date"], ["textbox", "Début"], ["textbox", "Fin"], ["spinbutton", "Places"]] as const) {
      const field = screen.getByRole(role, { name })
      expect(field).toBeRequired()
      const label = document.querySelector(`label[for="${field.id}"]`)!
      expect(label).toHaveTextContent(`${name} *`)
      expect(label.querySelector('[aria-hidden="true"]')).toHaveTextContent("*")
    }
  })

  it("clears a field's error as soon as it is filled", () => {
    setup()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    const role = screen.getByLabelText("Poste *")
    expect(role).toHaveAttribute("aria-invalid", "true")
    fireEvent.change(role, { target: { value: "Bar" } })
    expect(role).not.toHaveAttribute("aria-invalid")
    expect(role).not.toHaveAccessibleDescription()
    expect(screen.queryByText("Indiquez le poste.")).toBeNull()
    expect(screen.getByText("À remplir : l'heure de début et l'heure de fin.")).toBeInTheDocument()
  })

  it("refuses a blank role and an empty capacity", async () => {
    setup({ initial: { roleName: "   ", date: "2026-07-04", startTime: "10:00", endTime: "11:00" } })
    fireEvent.change(screen.getByRole("spinbutton", { name: "Places" }), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("spinbutton", { name: "Places" })).toHaveAccessibleDescription("Indiquez le nombre de places.")
    expect(screen.getByText("À remplir : le poste et le nombre de places.")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText("Poste *")).toHaveFocus())
  })

  it("posts a new shift, defaulting the label and the end time, and hands it back", async () => {
    const saved = { id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04T00:00:00.000Z", startTime: "10:00", endTime: "11:00", capacity: 2, status: "open", displayOrder: 0 }
    fetchMock.mockResolvedValue({ ok: true, json: async () => saved })
    const { onSaved } = setup()
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Bar" } })
    fireEvent.change(screen.getByLabelText("Début *"), { target: { value: "10:00" } })
    expect(screen.getByLabelText("Fin *")).toHaveValue("11:00")
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/shifts")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toMatchObject({ eventId: "evt-1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "11:00", capacity: 2, minAge: null })
    expect(onSaved).toHaveBeenCalledWith(saved, null)
  })

  it("edits a shift with PATCH, keeping its display order", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "s9" }) })
    const { onSaved } = setup({
      editingId: "s9",
      initial: { roleName: "Accueil", date: "2026-07-04", startTime: "08:00", endTime: "09:00", capacity: 3, displayOrder: 4 },
    })
    expect(screen.getByRole("heading", { name: "Modifier le créneau" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/shifts/s9")
    expect(init.method).toBe("PATCH")
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ roleName: "Accueil", capacity: 3, displayOrder: 4 })
    expect(body.eventId).toBeUndefined()
    expect(onSaved.mock.calls[0][1]).toBe("s9")
  })

  it("shows the server's error and keeps the form", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Créneau introuvable" }) })
    const { onSaved } = setup({ initial: { roleName: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "11:00" } })
    const submit = screen.getByRole("button", { name: "Ajouter" })
    submit.focus()
    fireEvent.click(submit)
    // One alert with the server's text, and focus stays on the button (#554).
    await waitFor(() => expect(spokenAlerts()).toHaveLength(1))
    expect(spokenAlerts()[0]).toHaveTextContent("Créneau introuvable")
    expect(submit).toHaveFocus()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Poste *")).toHaveValue("Bar")
  })

  it("keeps the submit button focusable while saving and ignores a second click (#554)", async () => {
    let resolve: (v: unknown) => void = () => {}
    fetchMock.mockReturnValue(new Promise((r) => { resolve = r }))
    const { onSaved } = setup({ initial: { roleName: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "11:00" } })
    const submit = screen.getByRole("button", { name: "Ajouter" })
    submit.focus()
    fireEvent.click(submit)
    expect(submit).toHaveAttribute("aria-disabled", "true")
    expect(submit).not.toHaveAttribute("disabled")
    expect(submit).toHaveAccessibleName("Ajout en cours…")
    expect(submit).toHaveFocus()
    fireEvent.click(submit)
    expect(fetchMock).toHaveBeenCalledOnce()
    resolve({ ok: true, json: async () => ({ id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "11:00" }) })
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  })

  it("« Annuler » asks to close", () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  // Typing a start keystroke by keystroke, as a person does.
  const typeStart = (value: string) => {
    const start = screen.getByLabelText("Début *")
    for (let i = 1; i <= value.length; i++) fireEvent.change(start, { target: { value: value.slice(0, i) } })
    fireEvent.blur(start)
  }

  it("keeps the next-morning end of an overnight shift when its start changes (#1024)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "s9" }) })
    setup({ editingId: "s9", initial: { roleName: "Bar", date: "2026-07-04", startTime: "22:00", endTime: "02:00", capacity: 2 } })
    typeStart("23:00")
    expect(screen.getByLabelText("Fin *")).toHaveValue("02:00")
    typeStart("21:30")
    expect(screen.getByLabelText("Fin *")).toHaveValue("02:00")
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ startTime: "21:30", endTime: "02:00" })
  })

  it("keeps an end at midnight, and still moves a daytime end the start passed", () => {
    setup({ editingId: "s9", initial: { roleName: "Bar", date: "2026-07-04", startTime: "22:00", endTime: "00:00", capacity: 2 } })
    typeStart("20:00")
    expect(screen.getByLabelText("Fin *")).toHaveValue("00:00")
    cleanup()
    setup({ editingId: "s9", initial: { roleName: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "11:00", capacity: 2 } })
    typeStart("14:00")
    expect(screen.getByLabelText("Fin *")).toHaveValue("15:00")
  })

  it("keeps an end the organiser typed past midnight", () => {
    setup()
    typeStart("22:00")
    expect(screen.getByLabelText("Fin *")).toHaveValue("23:00")
    fireEvent.change(screen.getByLabelText("Fin *"), { target: { value: "02:00" } })
    fireEvent.blur(screen.getByLabelText("Fin *"))
    typeStart("23:00")
    expect(screen.getByLabelText("Fin *")).toHaveValue("02:00")
  })
})
