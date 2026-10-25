/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import QuestionsEditor from "../admin/QuestionsEditor"
import { QUESTION_ROLE_PROBLEM } from "@/lib/question-role"

// « Poste concerné » in the questions editor (#984, part 3).

const meal = { id: "q1", label: "Repas ?", type: "yesno", options: [], required: false, roleName: "Cuisine", answers: 2 }
const size = { id: "q2", label: "Taille ?", type: "text", options: [], required: false, roleName: null, answers: 0 }
const roles = [{ roleName: "Cuisine", leaders: 1 }, { roleName: "Bar", leaders: 0 }]
const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body })

describe("QuestionsEditor: poste of a question", () => {
  beforeEach(() => vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0 }))
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("shows the poste next to an attached question only", () => {
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[meal, size]} roles={roles} />)
    expect(screen.getByText(/2 réponses · Poste : Cuisine/)).toBeInTheDocument()
    expect(screen.getByText(/0 réponse$/)).toBeInTheDocument()
  })

  it("an optional select, « Aucun » by default, described by its hint, saying which postes have no leader", () => {
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[size]} roles={roles} />)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une question" }))
    const select = screen.getByRole("combobox", { name: "Poste concerné" })
    expect(select).toHaveValue("")
    expect(select).not.toBeRequired()
    expect(select).toHaveAccessibleDescription(/aux responsables de ce poste/)
    expect([...(select as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Aucun", "Bar (aucun responsable)", "Cuisine"])
  })

  it("prefilled with the question's poste on edit, sent on save", async () => {
    const fetchMock = reply(200, { ...meal, roleName: "Bar", position: 0, _count: { answers: 2 } })
    vi.stubGlobal("fetch", fetchMock)
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[meal]} roles={roles} />)
    fireEvent.click(screen.getByRole("button", { name: "Modifier la question « Repas ? »" }))
    const select = screen.getByRole("combobox", { name: "Poste concerné" })
    expect(select).toHaveValue("Cuisine")
    fireEvent.change(select, { target: { value: "Bar" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByText(/Poste : Bar/)).toBeInTheDocument())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ roleName: "Bar" })
  })

  it("a refused poste marks the select, describes and focuses it", async () => {
    vi.stubGlobal("fetch", reply(400, { error: QUESTION_ROLE_PROBLEM, field: "roleName" }))
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[meal]} roles={roles} />)
    fireEvent.click(screen.getByRole("button", { name: "Modifier la question « Repas ? »" }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    const select = screen.getByRole("combobox", { name: "Poste concerné" })
    await waitFor(() => expect(select).toHaveAttribute("aria-invalid", "true"))
    expect(select).toHaveFocus()
    expect(select).toHaveAccessibleDescription(new RegExp(QUESTION_ROLE_PROBLEM.slice(0, 20)))
  })

  it("any other refusal is shown without marking the select", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "Cette question a déjà des réponses : son type ne peut plus changer. Créez-en une nouvelle." }))
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[meal]} roles={roles} />)
    fireEvent.click(screen.getByRole("button", { name: "Modifier la question « Repas ? »" }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByText(/son type ne peut plus changer/)).toBeInTheDocument())
    expect(screen.getByRole("combobox", { name: "Poste concerné" })).not.toHaveAttribute("aria-invalid")
  })

  it("an event without postes: a hint instead of the select", () => {
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[]} />)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une question" }))
    expect(screen.queryByRole("combobox", { name: "Poste concerné" })).toBeNull()
    expect(screen.getByText("Ajoutez des créneaux à l'événement pour rattacher cette question à un poste.")).toBeInTheDocument()
  })

  // #1003: « * » was read « étoile » before the field's own « obligatoire ».
  it("keeps the asterisk of required fields out of their names; the fields say « obligatoire » by their state", () => {
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[]} roles={roles} />)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une question" }))
    const label = screen.getByRole("textbox", { name: "Question posée aux bénévoles" })
    expect(label).toBeRequired()
    fireEvent.change(screen.getByRole("combobox", { name: "Type de réponse" }), { target: { value: "single" } })
    const options = screen.getByRole("textbox", { name: "Choix proposés" })
    expect(options).toBeRequired()
    expect(screen.getByText("Choix proposés").textContent).toBe("Choix proposés *")
  })
})

describe("QuestionsEditor: number questions (#1015)", () => {
  beforeEach(() => vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0 }))
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  const guests = { id: "q3", label: "Combien ?", type: "number", options: [], required: false, minValue: 1, maxValue: 8, roleName: null, answers: 2 }

  it("shows the range in the list", () => {
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[guests, { ...guests, id: "q4", label: "Enfants ?", minValue: 0, maxValue: null }]} />)
    expect(screen.getByText("Nombre : de 1 à 8 · 2 réponses")).toBeInTheDocument()
    expect(screen.getByText("Nombre : 0 ou plus · 2 réponses")).toBeInTheDocument()
  })

  it("offers « Nombre » with optional minimum and maximum, sent as numbers", async () => {
    const fetchMock = reply(201, { ...guests, id: "new", minValue: 0, maxValue: 6, position: 0, _count: { answers: 0 } })
    vi.stubGlobal("fetch", fetchMock)
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[]} />)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une question" }))
    fireEvent.change(screen.getByRole("textbox", { name: /Question posée/ }), { target: { value: "Combien ?" } })
    fireEvent.change(screen.getByRole("combobox", { name: "Type de réponse" }), { target: { value: "number" } })
    expect(screen.getByRole("group", { name: "Valeurs acceptées" })).toBeInTheDocument()
    const min = screen.getByRole("textbox", { name: "Minimum (facultatif)" })
    const max = screen.getByRole("textbox", { name: "Maximum (facultatif)" })
    expect(min).toHaveAttribute("inputmode", "numeric")
    expect(max).toHaveAccessibleDescription(/Nombres entiers, 0 ou plus/)
    fireEvent.change(max, { target: { value: "6" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ type: "number", minValue: null, maxValue: 6 })
  })

  it("a maximum under the minimum marks and focuses the maximum, nothing sent", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[guests]} />)
    fireEvent.click(screen.getByRole("button", { name: "Modifier la question « Combien ? »" }))
    const min = screen.getByRole("textbox", { name: "Minimum (facultatif)" })
    const max = screen.getByRole("textbox", { name: "Maximum (facultatif)" })
    expect(min).toHaveValue("1")
    expect(max).toHaveValue("8")
    fireEvent.change(min, { target: { value: "5" } })
    fireEvent.change(max, { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    expect(max).toHaveAttribute("aria-invalid", "true")
    expect(max).toHaveFocus()
    expect(max).toHaveAccessibleDescription(/Le maximum doit être égal ou supérieur au minimum \(5\)/)
    expect(min).not.toHaveAttribute("aria-invalid")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("a decimal minimum is refused on its field", () => {
    vi.stubGlobal("fetch", vi.fn())
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[guests]} />)
    fireEvent.click(screen.getByRole("button", { name: "Modifier la question « Combien ? »" }))
    const min = screen.getByRole("textbox", { name: "Minimum (facultatif)" })
    fireEvent.change(min, { target: { value: "1,5" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    expect(min).toHaveFocus()
    expect(min).toHaveAttribute("aria-invalid", "true")
  })

  it("a bound refused for an answer already given marks and focuses that bound", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "Un bénévole a répondu 7 : le maximum ne peut pas être inférieur à 7." }))
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[guests]} />)
    fireEvent.click(screen.getByRole("button", { name: "Modifier la question « Combien ? »" }))
    const max = screen.getByRole("textbox", { name: "Maximum (facultatif)" })
    expect(max).toHaveAccessibleDescription(/doivent rester acceptés/)
    fireEvent.change(max, { target: { value: "5" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(max).toHaveAttribute("aria-invalid", "true"))
    expect(max).toHaveFocus()
  })
})

// Who a question is asked to (#1140).
describe("QuestionsEditor: scope of a question", () => {
  beforeEach(() => vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0 }))
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("everyone by default; « Certains postes seulement » reveals the postes, sent on save and shown in the list", async () => {
    const fetchMock = reply(201, { ...size, id: "q9", label: "Caisse ?", displayScope: "roles", displayRoleNames: ["Bar"], position: 1, _count: { answers: 0 } })
    vi.stubGlobal("fetch", fetchMock)
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[size]} roles={roles} />)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une question" }))
    expect(screen.getByRole("radio", { name: "Tous les bénévoles" })).toBeChecked()
    expect(screen.queryByRole("group", { name: /Postes à qui la poser/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Question posée aux bénévoles/), { target: { value: "Caisse ?" } })
    fireEvent.click(screen.getByRole("radio", { name: "Certains postes seulement" }))
    expect(screen.getByRole("radio", { name: "Certains postes seulement" })).toHaveAccessibleDescription(/créneau de ces postes/)
    const group = screen.getByRole("group", { name: /Postes à qui la poser/ })
    expect([...group.querySelectorAll("label")].map((l) => l.textContent)).toEqual(["Bar", "Cuisine"])
    fireEvent.click(screen.getByRole("checkbox", { name: "Bar" }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByText("Posée seulement pour : Bar")).toBeInTheDocument())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ displayScope: "roles", displayRoleNames: ["Bar"] })
  })

  it("no poste ticked: the first box is marked and focused, nothing sent", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[size]} roles={roles} />)
    fireEvent.click(screen.getByRole("button", { name: "Modifier la question « Taille ? »" }))
    fireEvent.click(screen.getByRole("radio", { name: "Certains postes seulement" }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    const first = screen.getByRole("checkbox", { name: "Bar" })
    expect(first).toHaveAttribute("aria-invalid", "true")
    expect(first).toHaveFocus()
    expect(first).toHaveAccessibleDescription(/Cochez au moins un poste/)
    expect(fetchMock).not.toHaveBeenCalled()
    // Back to everyone: the error goes with the boxes.
    fireEvent.click(screen.getByRole("radio", { name: "Tous les bénévoles" }))
    expect(screen.queryByText(/Cochez au moins un poste/)).not.toBeInTheDocument()
  })

  it("a question whose postes are all gone says it is asked to nobody, and keeps a ticked poste without shifts", () => {
    const gone = { ...size, displayScope: "roles", displayRoleNames: [] }
    const stale = { ...size, id: "q3", label: "Ancien ?", displayScope: "roles", displayRoleNames: ["Buvette"] }
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[gone, stale]} roles={roles} />)
    expect(screen.getByText("Posée à personne (plus aucun de ses postes)")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Modifier la question « Taille ? »" }))
    expect(screen.getByRole("radio", { name: "Certains postes seulement" })).toHaveAccessibleDescription(/posée à personne/)
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    fireEvent.click(screen.getByRole("button", { name: "Modifier la question « Ancien ? »" }))
    expect(screen.getByRole("checkbox", { name: "Buvette (plus aucun créneau)" })).toBeChecked()
  })

  it("a follow-up follows its parent's scope: no control, the select says so; back to « Toujours », it starts from the parent's", () => {
    const parent = { ...meal, displayScope: "roles", displayRoleNames: ["Cuisine"] }
    const child = { ...size, id: "q5", label: "Combien ?", parentId: "q1", showIfValues: ["Oui"] }
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[parent, child]} roles={roles} />)
    fireEvent.click(screen.getByRole("button", { name: "Modifier la question « Combien ? »" }))
    expect(screen.queryByRole("radio", { name: "Tous les bénévoles" })).not.toBeInTheDocument()
    const select = screen.getByRole("combobox", { name: "Afficher seulement si…" })
    expect(select).toHaveAccessibleDescription(/mêmes bénévoles que « Repas \? » : aux bénévoles des postes Cuisine/)
    fireEvent.change(select, { target: { value: "" } })
    expect(screen.getByRole("radio", { name: "Certains postes seulement" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Cuisine" })).toBeChecked()
  })
})
