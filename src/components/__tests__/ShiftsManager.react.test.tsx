/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within, waitFor, act } from "@testing-library/react"

import ShiftsManager from "../admin/ShiftsManager"
import type { RawShift } from "../admin/shifts/types"

// The timeline is a heavy drag-and-drop component that the view toggle does not depend on.
vi.mock("../admin/AdminDayTimeline", () => ({ default: () => null }))

// « Frise / Liste » view toggle (#554): two toggle buttons in a named group.

const shift: RawShift = {
  id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
  capacity: 2, status: "open", registrationCount: 0, displayOrder: 0,
}

function renderManager() {
  return render(
    <ShiftsManager eventId="evt-1" eventStartDate="2026-07-04" eventEndDate="2026-07-04" initialShifts={[shift]} />,
  )
}

describe("ShiftsManager view toggle", () => {
  afterEach(cleanup)

  it("groups Frise and Liste as toggle buttons, Frise pressed by default", () => {
    renderManager()
    const group = screen.getByRole("group", { name: "Affichage des créneaux" })
    const timeline = within(group).getByRole("button", { name: "Frise" })
    const list = within(group).getByRole("button", { name: "Liste" })
    expect(timeline).toHaveAttribute("aria-pressed", "true")
    expect(list).toHaveAttribute("aria-pressed", "false")
    expect(timeline).toHaveAttribute("type", "button")
    expect(list).toHaveAttribute("type", "button")
  })

  it("switches to the list: pressed states flip, Liste keeps focus, the table is shown", () => {
    renderManager()
    const timeline = screen.getByRole("button", { name: "Frise" })
    const list = screen.getByRole("button", { name: "Liste" })
    expect(screen.queryByRole("table")).not.toBeInTheDocument()

    list.focus()
    fireEvent.click(list)

    expect(list).toHaveAttribute("aria-pressed", "true")
    expect(timeline).toHaveAttribute("aria-pressed", "false")
    expect(list).toHaveFocus()
    expect(screen.getByRole("table")).toBeInTheDocument()
  })

  it("does not clip the focus outline with overflow-hidden on the group (regression)", () => {
    renderManager()
    const group = screen.getByRole("group", { name: "Affichage des créneaux" })
    expect(group).not.toHaveClass("overflow-hidden")
  })
})

// Shift editor (#554): focus moves into it on open, comes back to its opener on close, and the
// result of a save is announced once, by the outcome status.

const fetchMock = vi.fn()
const spoken = (role: "status" | "alert") => screen.queryAllByRole(role).filter((e) => e.textContent?.trim())

describe("ShiftsManager shift editor focus and announcements", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    // jsdom does not lay out: no scrolling.
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const addButton = () => screen.getByRole("button", { name: "+ Ajouter un créneau" })

  it("« + Ajouter un créneau » opens the editor on « Poste * »; « Annuler » returns to the button", async () => {
    renderManager()
    addButton().focus()
    fireEvent.click(addButton())
    expect(screen.getByRole("group", { name: "Nouveau créneau" })).toBeInTheDocument()
    expect(screen.getByLabelText("Poste *")).toHaveFocus()

    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("group", { name: "Nouveau créneau" })).toBeNull()
    await waitFor(() => expect(addButton()).toHaveFocus())
  })

  it("after adding a shift, focus is on the add button and the status says what was added, once", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...shift, id: "s2", startTime: "10:00", endTime: "11:00", date: "2026-07-04T00:00:00.000Z" }) })
    renderManager()
    fireEvent.click(addButton())
    fireEvent.change(screen.getByLabelText("Poste *"), { target: { value: "Bar" } })
    fireEvent.change(screen.getByLabelText("Début *"), { target: { value: "10:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))

    await waitFor(() => expect(addButton()).toHaveFocus())
    await waitFor(() => expect(spoken("status")).toHaveLength(1))
    expect(spoken("status")[0]).toHaveTextContent("Créneau ajouté : Bar, samedi 4 juillet, de 10h à 11h.")
    expect(spoken("alert")).toHaveLength(0)
  })

  it("after editing from the list, focus is back on that row's « Modifier » and the edit is announced", async () => {
    const other: RawShift = { ...shift, id: "s3", roleName: "Accueil", label: "Accueil", startTime: "14:00", endTime: "16:00" }
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...shift, endTime: "13:00", date: "2026-07-04T00:00:00.000Z" }) })
    render(<ShiftsManager eventId="evt-1" eventStartDate="2026-07-04" eventEndDate="2026-07-04" initialShifts={[shift, other]} />)
    fireEvent.click(screen.getByRole("button", { name: "Liste" }))
    const barRow = screen.getByRole("row", { name: /Bar/ })
    const edit = within(barRow).getByRole("button", { name: /^Modifier le créneau Bar/ })
    edit.focus()
    fireEvent.click(edit)
    expect(screen.getByRole("group", { name: "Modifier le créneau" })).toBeInTheDocument()
    expect(screen.getByLabelText("Poste *")).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))

    await waitFor(() => expect(within(screen.getByRole("row", { name: /Bar/ })).getByRole("button", { name: /^Modifier le créneau Bar/ })).toHaveFocus())
    await waitFor(() => expect(spoken("status")).toHaveLength(1))
    expect(spoken("status")[0]).toHaveTextContent("Créneau modifié : Bar, samedi 4 juillet, de 10h à 13h.")
  })

  it("after saving an edit whose « Modifier » is gone (list switched to timeline), focus falls back to the add button", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...shift, date: "2026-07-04T00:00:00.000Z" }) })
    renderManager()
    fireEvent.click(screen.getByRole("button", { name: "Liste" }))
    fireEvent.click(screen.getByRole("button", { name: /^Modifier le créneau / }))
    fireEvent.click(screen.getByRole("button", { name: "Frise" }))
    expect(screen.queryByRole("table")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))

    await waitFor(() => expect(addButton()).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
    await waitFor(() => expect(spoken("status")).toHaveLength(1))
    expect(spoken("status")[0]).toHaveTextContent("Créneau modifié : Bar, samedi 4 juillet, de 10h à 12h.")
  })

  it("when the opener is gone (list switched to timeline), focus falls back to the add button", async () => {
    renderManager()
    fireEvent.click(screen.getByRole("button", { name: "Liste" }))
    fireEvent.click(screen.getByRole("button", { name: /^Modifier le créneau / }))
    fireEvent.click(screen.getByRole("button", { name: "Frise" }))
    expect(screen.queryByRole("table")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))

    await waitFor(() => expect(addButton()).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
  })
})

// « Gérer les postes » (#554): a disclosure for the roles panel; focus comes back to it when the
// panel closes, and the panel's outcomes are announced once, by the outcome status.

describe("ShiftsManager roles panel disclosure and focus", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const manageRoles = () => screen.getByRole("button", { name: "Gérer les postes" })
  const panelHeading = () => screen.queryByRole("heading", { name: "Gérer les postes" })
  const everyControlsResolves = () => {
    for (const el of document.querySelectorAll("[aria-controls]")) {
      expect(document.getElementById(el.getAttribute("aria-controls")!), el.outerHTML).not.toBeNull()
    }
  }

  it("« aria-expanded » and « aria-controls » follow the panel; a second click closes it and keeps focus", async () => {
    renderManager()
    const button = manageRoles()
    expect(button).toHaveAttribute("type", "button")
    expect(button).toHaveAttribute("aria-expanded", "false")
    expect(button).not.toHaveAttribute("aria-controls")
    everyControlsResolves()

    button.focus()
    fireEvent.click(button)
    expect(button).toHaveAttribute("aria-expanded", "true")
    expect(document.getElementById(button.getAttribute("aria-controls")!)).toContainElement(panelHeading())
    everyControlsResolves()

    fireEvent.click(button)
    expect(panelHeading()).toBeNull()
    expect(button).toHaveAttribute("aria-expanded", "false")
    expect(button).not.toHaveAttribute("aria-controls")
    await waitFor(() => expect(button).toHaveFocus())
    everyControlsResolves()
  })

  it("« Fermer » returns the focus to « Gérer les postes »", async () => {
    renderManager()
    fireEvent.click(manageRoles())
    const close = screen.getByRole("button", { name: "Fermer" })
    close.focus()
    fireEvent.click(close)
    expect(panelHeading()).toBeNull()
    await waitFor(() => expect(manageRoles()).toHaveFocus())
  })

  it("reopening the panel with an editor still open keeps focus on « Gérer les postes »", async () => {
    renderManager()
    fireEvent.click(manageRoles())
    fireEvent.click(screen.getByRole("button", { name: /^Limite : .*Bar/ }))
    const toggle = manageRoles()
    toggle.focus()
    fireEvent.click(toggle)
    expect(panelHeading()).toBeNull()
    // Let the close's focus return (next frame) land first, so it cannot mask the reopen.
    await waitFor(() => expect(toggle).toHaveFocus())
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
    fireEvent.click(toggle)

    const limitInput = screen.getByLabelText("Nombre maximal de créneaux « Bar » par personne")
    expect(limitInput).toBeVisible()
    expect(toggle).toHaveFocus()
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
    expect(toggle).toHaveFocus()
  })

  it("« Enregistrer l'ordre » closes the panel, returns the focus to « Gérer les postes » and announces once", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    renderManager()
    fireEvent.click(manageRoles())
    const save = screen.getByRole("button", { name: "Enregistrer l'ordre" })
    save.focus()
    fireEvent.click(save)

    await waitFor(() => expect(manageRoles()).toHaveFocus())
    expect(panelHeading()).toBeNull()
    await waitFor(() => expect(spoken("status")).toHaveLength(1))
    expect(spoken("status")[0]).toHaveTextContent("Ordre des postes enregistré.")
    expect(spoken("alert")).toHaveLength(0)
  })

  it("a rename is announced once by the outcome status, in words", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    renderManager()
    fireEvent.click(manageRoles())
    fireEvent.click(screen.getByRole("button", { name: "Renommer le poste Bar" }))
    const input = screen.getByLabelText("Nouveau nom du poste « Bar »")
    fireEvent.change(input, { target: { value: "Buvette" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(screen.getByRole("button", { name: "Renommer le poste Buvette" })).toHaveFocus())
    await waitFor(() => expect(spoken("status")).toHaveLength(1))
    expect(spoken("status")[0]).toHaveTextContent(/^Poste « Bar » renommé en « Buvette »\.$/)
  })

  it("« Créer une série » sets « aria-controls » only while its form is shown, and it resolves", () => {
    renderManager()
    const series = screen.getByRole("button", { name: "Créer une série" })
    expect(series).not.toHaveAttribute("aria-controls")
    fireEvent.click(series)
    expect(series).toHaveAttribute("aria-expanded", "true")
    expect(document.getElementById(series.getAttribute("aria-controls")!)).not.toBeNull()
    everyControlsResolves()
  })
})

// List view (#587): readable contrast, actions named with their shift, cells read in words, and a
// deletion recap in words.

describe("ShiftsManager list view", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const rows: RawShift[] = [
    { ...shift, id: "a", capacity: 5, registrationCount: 3, minAge: 18 },
    { ...shift, id: "b", label: "Soir", startTime: "18:30", endTime: "23:00", capacity: 2, registrationCount: 2, status: "full" },
    { ...shift, id: "c", roleName: "Accueil", label: "Accueil", startTime: "14:00", endTime: "16:00", capacity: 3, registrationCount: 1, status: "closed" },
  ]
  const renderList = () => {
    const view = render(<ShiftsManager eventId="evt-1" eventStartDate="2026-07-04" eventEndDate="2026-07-04" initialShifts={rows} />)
    fireEvent.click(screen.getByRole("button", { name: "Liste" }))
    return view
  }

  it("names « Modifier » and « Supprimer » with the shift, starting with the visible word", () => {
    renderList()
    for (const verb of ["Modifier", "Supprimer"]) {
      expect(screen.getByRole("button", { name: `${verb} le créneau Bar, samedi 4 juillet, de 10h à 12h` })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: `${verb} le créneau Bar, Soir, samedi 4 juillet, de 18h30 à 23h` })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: `${verb} le créneau Accueil, samedi 4 juillet, de 14h à 16h` })).toBeInTheDocument()
    }
    for (const b of screen.getAllByRole("button", { name: /^(Modifier|Supprimer) le créneau / })) expect(b).toHaveAttribute("type", "button")
  })

  it("reads the time and places in words, with « Date et horaire » and « ans minimum »", () => {
    renderList()
    expect(screen.getByRole("columnheader", { name: "Date et horaire" })).toBeInTheDocument()
    const row = screen.getByRole("row", { name: /Modifier le créneau Bar, samedi 4 juillet, de 10h à 12h/ })
    expect(within(row).getByText("de 10h à 12h")).toHaveClass("sr-only")
    expect(within(row).getByText("10:00–12:00")).toHaveAttribute("aria-hidden", "true")
    expect(within(row).getByText("3 inscrits sur 5")).toHaveClass("sr-only")
    expect(within(row).getByText("3/5")).toHaveAttribute("aria-hidden", "true")
    expect(within(row).getByText("18 ans minimum")).toBeInTheDocument()
    expect(document.body.textContent).not.toContain("Date · Horaire")
    expect(document.body.textContent).not.toContain("ans min.")
  })

  it("uses no text colour under 4.5:1 on white or on its row (regression)", () => {
    const { container } = renderList()
    for (const cls of ["text-blue-500", "text-red-400", "text-orange-500", "text-emerald-600"]) {
      expect(container.querySelector(`.${cls}`), cls).toBeNull()
    }
    // gray-500 on the gray-100 of the « Fermé » badge is 4.4:1.
    expect(within(screen.getByRole("row", { name: /Accueil/ })).getByText("Fermé")).toHaveClass("text-gray-700")
    const fullRow = screen.getByRole("row", { name: /Modifier le créneau Bar, Soir/ })
    expect(within(fullRow).getByText("Complet", { selector: "p" })).toHaveClass("text-orange-800")
    expect(screen.getAllByText("2 libres")[0]).toHaveClass("text-green-800")
  })

  it("the deletion recap from the list says the shift in words", () => {
    renderList()
    fireEvent.click(screen.getByRole("button", { name: "Supprimer le créneau Bar, Soir, samedi 4 juillet, de 18h30 à 23h" }))
    const dialog = screen.getByRole("alertdialog", { name: "Supprimer le créneau « Bar, Soir » ?" })
    expect(dialog).toHaveTextContent("Samedi 4 juillet, de 18h30 à 23h.")
    expect(dialog.textContent).not.toMatch(/[–·]/)
  })
})

describe("ShiftsManager timeline hint", () => {
  afterEach(cleanup)

  it("says how to add and resize with the mouse and with the keyboard, in sentences, readable", () => {
    renderManager()
    const hint = screen.getByText(/^À la souris, faites glisser sur la ligne d'un poste/)
    expect(hint).toHaveTextContent("Au clavier, utilisez « + Ajouter un créneau » ou ouvrez un créneau pour le modifier.")
    expect(hint).toHaveClass("text-xs", "text-gray-600")
    expect(hint.textContent).not.toContain("·")
  })
})
