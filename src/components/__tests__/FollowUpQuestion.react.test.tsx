/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, within, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { useState } from "react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import SignupQuestions, { type Answers } from "../public/SignupQuestions"
import QuestionsEditor from "../admin/QuestionsEditor"
import MyAnswersCard from "../public/MyAnswersCard"
import { VALUES_EMPTY } from "@/lib/question-follow-up"

// Follow-up questions (#1016): « Tu manges avec nous ? » then, if « Oui », « Combien de personnes ? ».
const meal = { id: "meal", label: "Tu manges avec nous ?", type: "yesno", options: [], required: true }
const count = { id: "count", label: "Combien de personnes ?", type: "number", options: [], required: true, minValue: 1, parentId: "meal", showIfValues: ["Oui"] }
const note = { id: "note", label: "Remarque", type: "text", options: [], required: false }

function Form({ clearable = false, initial = {} }: { clearable?: boolean; initial?: Answers }) {
  const [answers, setAnswers] = useState<Answers>(initial)
  return <SignupQuestions questions={[meal, note, count]} answers={answers} onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))} errors={new Map()} clearable={clearable} />
}

describe("volunteer form: a follow-up question", () => {
  afterEach(cleanup)

  it("appears right after its parent only for « Oui », without moving the focus", () => {
    render(<Form />)
    expect(screen.queryByRole("textbox", { name: /Combien de personnes/ })).not.toBeInTheDocument()
    const oui = screen.getByRole("radio", { name: "Oui" })
    oui.focus()
    fireEvent.click(oui)
    const field = screen.getByRole("textbox", { name: /Combien de personnes/ })
    expect(field).toBeRequired()
    expect(document.activeElement).toBe(oui)
    // In the reading order: the parent's group, then the follow-up, then the next question.
    const order = [screen.getByRole("group", { name: /Tu manges avec nous/ }), field, screen.getByRole("textbox", { name: /Remarque/ })]
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // A sibling of the parent's fieldset, not inside it.
    expect(within(order[0]).queryByRole("textbox")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: "Non" }))
    expect(screen.queryByRole("textbox", { name: /Combien de personnes/ })).not.toBeInTheDocument()
  })

  it("is hidden again by « Pas de réponse » on the personal page", () => {
    const optional = { ...meal, required: false }
    function Clearable() {
      const [answers, setAnswers] = useState<Answers>({ meal: "Oui", count: "2" })
      return <SignupQuestions questions={[optional, count]} answers={answers} onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))} errors={new Map()} clearable />
    }
    render(<Clearable />)
    expect(screen.getByRole("textbox", { name: /Combien de personnes/ })).toHaveValue("2")
    fireEvent.click(screen.getByRole("radio", { name: "Pas de réponse" }))
    expect(screen.queryByRole("textbox", { name: /Combien de personnes/ })).not.toBeInTheDocument()
  })
})

describe("« Mes réponses »: a follow-up", () => {
  afterEach(cleanup)
  const row = (id: string, label: string, values: string[], extra: Record<string, unknown> = {}) => ({ id, label, answer: values.join(", ") || null, type: "yesno", options: [], required: false, values, ...extra })

  it("is listed under its parent only when the stored answer shows it", () => {
    const rows = [row("meal", "Tu manges avec nous ?", ["Non"]), row("count", "Combien de personnes ?", [], { type: "number", parentId: "meal", showIfValues: ["Oui"] })]
    render(<MyAnswersCard rows={rows} edit={{ allowed: true }} token="t" contactEmail={null} eventTitle="Fête" />)
    expect(screen.getByText("Tu manges avec nous ?")).toBeInTheDocument()
    expect(screen.queryByText("Combien de personnes ?")).not.toBeInTheDocument()
    cleanup()
    render(<MyAnswersCard rows={[row("meal", "Tu manges avec nous ?", ["Oui"]), row("count", "Combien de personnes ?", ["3"], { type: "number", parentId: "meal", showIfValues: ["Oui"] })]} edit={{ allowed: true }} token="t" contactEmail={null} eventTitle="Fête" />)
    expect(screen.getByText("Combien de personnes ?")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })
})

const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body })
const q = (over: Record<string, unknown>) => ({ id: "x", label: "X", type: "text", options: [], required: false, roleName: null, parentId: null, showIfValues: [], answers: 0, ...over })

describe("questions editor: « Afficher seulement si… »", () => {
  beforeEach(() => vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0 }))
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  const parent = q({ id: "meal", label: "Tu manges avec nous ?", type: "yesno" })
  const text = q({ id: "note", label: "Remarque" })

  it("offers the yes/no and choice questions, then the parent's answers to tick, and sends them", async () => {
    const fetchMock = reply(201, { ...q({ id: "count", label: "Combien ?", type: "number", parentId: "meal", showIfValues: ["Oui"] }), _count: { answers: 0 } })
    vi.stubGlobal("fetch", fetchMock)
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[parent, text]} />)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une question" }))
    const select = screen.getByRole("combobox", { name: "Afficher seulement si…" })
    expect(select).toHaveAccessibleDescription(/n'est pas obligatoire/)
    expect([...(select as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Toujours (sans condition)", "Tu manges avec nous ?"])
    fireEvent.change(screen.getByRole("textbox", { name: /Question posée aux bénévoles/ }), { target: { value: "Combien ?" } })
    fireEvent.change(select, { target: { value: "meal" } })
    const group = screen.getByRole("group", { name: /Réponses qui affichent cette question/ })
    // None ticked: refused here, the first box focused and described by the message.
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    const oui = within(group).getByRole("checkbox", { name: "Oui" })
    expect(document.activeElement).toBe(oui)
    expect(oui).toHaveAccessibleDescription(VALUES_EMPTY)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(oui)
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ parentId: "meal", showIfValues: ["Oui"] })
    // Listed under its parent, in a nested list, with its condition.
    await waitFor(() => expect(screen.getByText(/Question de suivi · Si « Oui » à « Tu manges avec nous \? »/)).toBeInTheDocument())
    const lists = screen.getAllByRole("list")
    expect(within(lists[1]).getByText("Combien ?")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Elle est placée après « Tu manges avec nous ? »")
  })

  it("says why a question with a follow-up can't depend on another one, and clears the answers when the parent changes", () => {
    const size = q({ id: "size", label: "Taille", type: "single", options: ["S", "M"] })
    const follow = q({ id: "count", label: "Combien ?", type: "number", parentId: "meal", showIfValues: ["Oui"] })
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[parent, follow, size]} />)
    fireEvent.click(screen.getByRole("button", { name: "Modifier la question « Tu manges avec nous ? »" }))
    expect(screen.queryByRole("combobox", { name: "Afficher seulement si…" })).not.toBeInTheDocument()
    expect(screen.getByText(/a une question de suivi : elle ne peut pas dépendre/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    fireEvent.click(screen.getByRole("button", { name: "Modifier la question « Combien ? »" }))
    const select = screen.getByRole("combobox", { name: "Afficher seulement si…" })
    expect(select).toHaveValue("meal")
    expect(screen.getByRole("checkbox", { name: "Oui" })).toBeChecked()
    fireEvent.change(select, { target: { value: "size" } })
    expect(screen.getByRole("checkbox", { name: "S" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "M" })).not.toBeChecked()
  })

  it("moves a follow-up only among its parent's follow-ups, and the parent with it", async () => {
    const fetchMock = reply(200, { ok: true })
    vi.stubGlobal("fetch", fetchMock)
    const follow = q({ id: "count", label: "Combien ?", type: "number", parentId: "meal", showIfValues: ["Oui"] })
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[text, parent, follow]} />)
    expect(screen.getByRole("button", { name: "Monter « Combien ? »" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "Descendre « Combien ? »" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("button", { name: "Monter « Tu manges avec nous ? »" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).ids).toEqual(["meal", "count", "note"])
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("« Tu manges avec nous ? » et sa question de suivi sont maintenant en position 1 sur 3."))
  })

  it("the removal of a parent says its follow-up goes too", () => {
    const follow = q({ id: "count", label: "Combien ?", type: "number", parentId: "meal", showIfValues: ["Oui"], answers: 2 })
    render(<QuestionsEditor eventId="evt-1" initialQuestions={[parent, follow]} />)
    fireEvent.click(screen.getByRole("button", { name: "Retirer la question « Tu manges avec nous ? »" }))
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Sa question de suivi « Combien ? » est retirée aussi ; ses 2 réponses restent dans les exports.")
  })
})
