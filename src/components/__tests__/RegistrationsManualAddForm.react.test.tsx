/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { useState } from "react"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"
import ManualAddForm from "../admin/registrations/ManualAddForm"
import { EMPTY_ADD_FORM, type AddFormValues, type Registration } from "../admin/registrations/types"

// Manual addition of a registration by the organizer, on its own (#402, #465, #466).
const shift = { id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 3, registrationCount: 1 }

function Harness({ initial = EMPTY_ADD_FORM, onAdded = () => {}, onCancel = () => {}, registrations = [] }: { initial?: AddFormValues; onAdded?: (r: Registration) => void; onCancel?: () => void; registrations?: Registration[] }) {
  const [form, setForm] = useState(initial)
  return <ManualAddForm eventId="evt-1" shifts={[shift]} registrations={registrations} timeZone="Europe/Zurich" form={form} onFormChange={setForm} onAdded={onAdded} onCancel={onCancel} />
}

const combo = () => screen.getByRole("combobox", { name: "Créneau" })

describe("ManualAddForm", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("posts the typed values and hands the created registration back", async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({
        id: "r9", status: "active", source: "admin_manual", comment: null, createdAt: "2026-06-01T00:00:00.000Z",
        volunteer: { id: "v9", firstName: "Chloé", lastName: "Roy", email: null, phone: null },
        shift: { ...shift, date: "2026-07-04T00:00:00.000Z" },
      }),
    })
    const onAdded = vi.fn()
    render(<Harness initial={{ ...EMPTY_ADD_FORM, shiftId: "s1" }} onAdded={onAdded} />)
    expect(screen.getByRole("heading", { name: "Inscription manuelle" })).toBeInTheDocument()
    fireEvent.change(screen.getByRole("textbox", { name: "Prénom" }), { target: { value: "Chloé" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Nom" }), { target: { value: "Roy" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))

    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/registrations")
    expect(JSON.parse(init.body)).toEqual({ eventId: "evt-1", volunteerId: "", firstName: "Chloé", lastName: "Roy", email: "", phone: "", shiftId: "s1", comment: "" })
    const reg = onAdded.mock.calls[0][0] as Registration
    expect(reg).toMatchObject({ id: "r9", isLeader: false, waitingPosition: null })
    expect(reg.shift).toMatchObject({ id: "s1", date: "2026-07-04", capacity: 3, registrationCount: 2 })
  })

  // #582: the asterisk is shown, not read (« étoile »); the fields say « obligatoire » themselves.
  it("names the required fields without their asterisk", () => {
    render(<Harness />)
    for (const label of ["Prénom", "Nom"]) {
      const field = screen.getByRole("textbox", { name: label })
      expect(field).toBeRequired()
      expect(document.querySelector(`label[for="${field.id}"]`)).toHaveTextContent(`${label} *`)
    }
    expect(combo()).toHaveAttribute("aria-required", "true")
    expect(document.getElementById("add-shift-label")).toHaveTextContent("Créneau *")
  })

  // #582: the busy submit keeps a name a screen reader can say, not « … ».
  it("names the submit button « Ajout en cours… » while adding", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<Harness initial={{ ...EMPTY_ADD_FORM, firstName: "Chloé", lastName: "Roy", shiftId: "s1" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    const busy = await screen.findByRole("button", { name: "Ajout en cours…" })
    expect(busy).toHaveAttribute("aria-disabled", "true")
  })

  // #574: the missing shift is an error of the field, read once with it, not an alert.
  it("marks the shift field required, and invalid only after a submit without a shift", async () => {
    render(<Harness />)
    expect(combo()).toHaveAttribute("aria-required", "true")
    expect(combo()).not.toHaveAttribute("aria-invalid")
    expect(combo()).not.toHaveAttribute("aria-describedby")

    fireEvent.submit(screen.getByRole("button", { name: "Ajouter" }).closest("form")!)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(combo()).toHaveAttribute("aria-invalid", "true")
    const error = screen.getByText("Sélectionnez un créneau.")
    expect(combo().getAttribute("aria-describedby")).toBe(error.id)
    expect(combo()).toHaveAccessibleDescription("Sélectionnez un créneau.")
    await waitFor(() => expect(combo()).toHaveFocus())
  })

  it("clears the error as soon as a shift is chosen", () => {
    render(<Harness />)
    fireEvent.submit(screen.getByRole("button", { name: "Ajouter" }).closest("form")!)
    expect(combo()).toHaveAttribute("aria-invalid", "true")
    fireEvent.keyDown(combo(), { key: "ArrowDown" })
    fireEvent.keyDown(combo(), { key: "Enter" })
    expect(combo()).not.toHaveAttribute("aria-invalid")
    expect(combo()).not.toHaveAttribute("aria-describedby")
    expect(screen.queryByText("Sélectionnez un créneau.")).toBeNull()
  })

  it("describes the field with a conflict, without making it invalid", () => {
    const held = {
      id: "r1", status: "active", source: "public_form", comment: null, createdAt: "2026-06-01T00:00:00.000Z", waitingPosition: null, isLeader: false,
      volunteer: { id: "v1", firstName: "Chloé", lastName: "Roy", email: "chloe@x.ch", phone: null },
      shift,
    } as Registration
    render(<Harness registrations={[held]} initial={{ ...EMPTY_ADD_FORM, email: "chloe@x.ch", shiftId: "s1" }} />)
    expect(combo().getAttribute("aria-describedby")).toBe("add-shift-conflict")
    expect(combo()).toHaveAccessibleDescription("Ce bénévole est déjà inscrit à ce créneau.")
    expect(combo()).not.toHaveAttribute("aria-invalid")
  })

  it("offers to go past the role limit, only for the form that was refused", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: "role_limit", error: "Limite atteinte pour ce poste." }) })
    render(<Harness initial={{ ...EMPTY_ADD_FORM, firstName: "A", lastName: "B", shiftId: "s1" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    const force = await screen.findByRole("button", { name: "Ajouter quand même" })
    expect(screen.getByRole("alert")).toHaveTextContent("Limite atteinte pour ce poste.")
    expect(force).toHaveAccessibleDescription("Limite atteinte pour ce poste.")

    fireEvent.change(screen.getByRole("textbox", { name: "Nom" }), { target: { value: "C" } })
    expect(screen.queryByRole("button", { name: "Ajouter quand même" })).toBeNull()
    expect(screen.getByRole("alert")).toHaveTextContent("Le formulaire a changé : validez à nouveau.")
  })

  // #914: a member already in the list is placed without retyping, email or not.
  it("places a member found in the list, sending its id", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ([
      { id: "mem-2", firstName: "René", lastName: "Meyer", email: null, phone: "079 000 02 00", active: true },
    ]) })
    render(<Harness initial={{ ...EMPTY_ADD_FORM, shiftId: "s1" }} />)
    fireEvent.change(screen.getByRole("searchbox", { name: "Membre existant" }), { target: { value: "Meyer" } })
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Membre existant" }), { key: "Enter" })
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/members?q=Meyer")
    const list = await screen.findByRole("list", { name: "Membres trouvés" })
    expect(list).toHaveTextContent("René Meyer")
    fireEvent.click(within(list).getByRole("button", { name: /^Choisir\s*René Meyer$/ }))

    const chosen = screen.getByRole("group", { name: "Membre choisi" })
    expect(chosen).toHaveTextContent("René Meyer, 079 000 02 00")
    expect(screen.queryByRole("textbox", { name: "Prénom" })).toBeNull()
    await waitFor(() => expect(combo()).toHaveFocus())

    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "Cette personne est déjà inscrite sur ce créneau." }) })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await screen.findByRole("alert")
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ volunteerId: "mem-2", firstName: "René", lastName: "Meyer", email: "", shiftId: "s1" })
  })

  it("goes back to the search through Changer de personne", async () => {
    render(<Harness initial={{ ...EMPTY_ADD_FORM, volunteerId: "mem-2", firstName: "René", lastName: "Meyer" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Changer de personne" }))
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "Membre existant" })).toHaveFocus())
    expect(screen.getByRole("textbox", { name: "Prénom" })).toHaveValue("")
  })

  it("recognizes a chosen member without email on the event, by id", () => {
    const held = {
      id: "r1", status: "active", source: "admin_manual", comment: null, createdAt: "2026-06-01T00:00:00.000Z", waitingPosition: null, isLeader: false,
      volunteer: { id: "mem-2", firstName: "René", lastName: "Meyer", email: null, phone: null },
      shift,
    } as Registration
    render(<Harness registrations={[held]} initial={{ ...EMPTY_ADD_FORM, volunteerId: "mem-2", firstName: "René", lastName: "Meyer", shiftId: "s1" }} />)
    expect(combo()).toHaveAccessibleDescription("Ce bénévole est déjà inscrit à ce créneau.")
  })

  // Seen in the REGISTRATIONS_MANAGEMENT recording: the refusal stayed after another shift was picked.
  it("hides a refusal once the form changes", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "Cette personne est déjà inscrite sur ce créneau." }) })
    render(<Harness initial={{ ...EMPTY_ADD_FORM, firstName: "A", lastName: "B", shiftId: "s1" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Cette personne est déjà inscrite sur ce créneau.")
    fireEvent.change(screen.getByRole("textbox", { name: "Nom" }), { target: { value: "C" } })
    expect(screen.queryByRole("alert")).toBeNull()
  })

  // #916: what the volunteer will receive is said before submitting, and describes the button.
  it("says whether a confirmation email will leave, once a shift is chosen", () => {
    render(<Harness initial={{ ...EMPTY_ADD_FORM, email: "chloe@x.ch" }} />)
    expect(document.getElementById("add-notice")).toBeNull()
    cleanup()
    render(<Harness initial={{ ...EMPTY_ADD_FORM, shiftId: "s1" }} />)
    expect(screen.getByRole("button", { name: "Ajouter" })).toHaveAccessibleDescription("Pas d'email de confirmation : cette personne n'a pas d'adresse email.")
  })

  it("closes through Annuler", () => {
    const onCancel = vi.fn()
    render(<Harness onCancel={onCancel} />)
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(onCancel).toHaveBeenCalled()
  })
})

// Regression (review of the RegistrationsManager split): the form remounted on every click of
// « + Ajouter manuellement », even when already open, which dropped its in-flight guard and let a
// second POST go out while the first was still running.
describe("RegistrationsManager — manual add while a submission is running", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("keeps the form, and its guard, when the open button is clicked again", async () => {
    vi.doMock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
    const { default: RegistrationsManager } = await import("../admin/RegistrationsManager")
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={[]} />)
    const open = screen.getByRole("button", { name: "+ Ajouter manuellement" })
    fireEvent.click(open)
    fireEvent.change(screen.getByRole("textbox", { name: "Prénom" }), { target: { value: "Chloé" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Nom" }), { target: { value: "Roy" } })
    const form = screen.getByRole("textbox", { name: "Prénom" }).closest("form")!
    const combo = within(form).getByRole("combobox", { name: "Créneau" })
    fireEvent.click(combo)
    // within the form: the role filter is a native select with its own « Bar » option.
    fireEvent.click(within(form).getByRole("option", { name: /Bar/ }))
    fireEvent.submit(form)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(open)
    fireEvent.submit(screen.getByRole("textbox", { name: "Prénom" }).closest("form")!)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// #555: the form unmounts on « Annuler » and after an add; the focus goes back to its open
// button instead of the page, and the addition is announced.
describe("RegistrationsManager — focus and announcement around the manual add", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  async function renderManager() {
    vi.doMock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
    const { default: RegistrationsManager } = await import("../admin/RegistrationsManager")
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={[]} />)
    return screen.getByRole("button", { name: "+ Ajouter manuellement" })
  }

  it("returns the focus to « + Ajouter manuellement » after « Annuler »", async () => {
    const open = await renderManager()
    fireEvent.click(open)
    const cancel = screen.getByRole("button", { name: "Annuler" })
    cancel.focus()
    fireEvent.click(cancel)
    expect(screen.queryByRole("heading", { name: "Inscription manuelle" })).toBeNull()
    expect(open).toHaveFocus()
  })

  it("returns the focus and announces the registration after a successful add, chosen with the keyboard", async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({
        id: "r9", status: "active", source: "admin_manual", comment: null, createdAt: "2026-06-01T00:00:00.000Z",
        volunteer: { id: "v9", firstName: "Chloé", lastName: "Roy", email: null, phone: null },
        shift: { ...shift, date: "2026-07-04T00:00:00.000Z" },
      }),
    })
    const open = await renderManager()
    fireEvent.click(open)
    fireEvent.change(screen.getByRole("textbox", { name: "Prénom" }), { target: { value: "Chloé" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Nom" }), { target: { value: "Roy" } })
    const combo = screen.getByRole("combobox", { name: "Créneau" })
    fireEvent.keyDown(combo, { key: "ArrowDown" })
    fireEvent.keyDown(combo, { key: "Enter" })
    expect(combo).toHaveTextContent("Bar")
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Inscription manuelle" })).toBeNull())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ shiftId: "s1" })
    expect(open).toHaveFocus()
    const result = "Inscription de Chloé Roy ajoutée : Bar, sam. 4 juil., de 10h à 12h."
    await waitFor(() => expect(screen.getByText(result)).toBeInTheDocument())
    const region = screen.getByText(result).closest("[role=status]")
    expect(region).toHaveAttribute("aria-live", "polite")
    // #574: only the result is spoken, not the new count; the hidden count still follows the list.
    expect(region?.textContent).toBe(result)
    expect(screen.getByText("1 inscription affichée")).not.toHaveAttribute("role")
    expect(document.querySelectorAll("[role=status], [aria-live]")).toHaveLength(1)
  })
})
