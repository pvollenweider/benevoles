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
})
