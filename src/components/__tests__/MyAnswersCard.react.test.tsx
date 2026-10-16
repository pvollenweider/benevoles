/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

import MyAnswersCard from "../public/MyAnswersCard"
import type { MyAnswerRow } from "@/lib/my-answers"

// « Mes réponses » on the personal page, with the edit mode (#984, part 2).

const rows: MyAnswerRow[] = [
  { id: "meal", label: "Repas du soir ?", answer: "Oui", type: "yesno", options: [], required: false, values: ["Oui"] },
  { id: "size", label: "Taille ?", answer: "M", type: "single", options: ["S", "M", "L"], required: true, values: ["M"] },
  { id: "note", label: "Remarque ?", answer: null, type: "text", options: [], required: false, values: [] },
]

const card = (props: Partial<Parameters<typeof MyAnswersCard>[0]> = {}) =>
  render(<MyAnswersCard rows={rows} edit={{ allowed: true }} token="tok" contactEmail="org@x.ch" eventTitle="Fête" {...props} />)

const editButton = () => screen.getByRole("button", { name: "Modifier mes réponses" })
const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body })

describe("MyAnswersCard", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0 })
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("at rest: the answers, one edit button, no contact line", () => {
    card()
    const region = screen.getByRole("region", { name: "Mes réponses" })
    expect(within(region).getAllByRole("definition").map((d) => d.textContent)).toEqual(["Oui", "M", "Pas de réponse"])
    expect(within(region).getAllByRole("button")).toHaveLength(1)
    expect(editButton()).not.toHaveAttribute("aria-expanded")
    expect(screen.queryByText(/écris à l'organisation/)).toBeNull()
  })

  it("opens the sign-up form's fields, prefilled, focus on the first (the checked choice)", () => {
    card()
    fireEvent.click(editButton())
    const form = screen.getByRole("form", { name: "Modifier mes réponses" })
    expect(within(form).getByRole("radio", { name: "Oui" })).toBeChecked()
    expect(within(form).getByRole("radio", { name: "Oui" })).toHaveFocus()
    expect(within(form).getByRole("radio", { name: "M" })).toBeChecked()
    // An optional choice can be cleared; a required one can't.
    expect(within(form).getAllByRole("radio", { name: "Pas de réponse" })).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Modifier mes réponses" })).toBeNull()
  })

  it("Annuler drops the changes and gives focus back to the button", () => {
    card()
    fireEvent.click(editButton())
    fireEvent.click(screen.getByRole("radio", { name: "Non" }))
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("form")).toBeNull()
    expect(editButton()).toHaveFocus()
    expect(screen.getAllByRole("definition")[0]).toHaveTextContent("Oui")
  })

  it("saves: the new answers shown, focus on the button, the result announced", async () => {
    const fetchMock = reply(200, { changed: 1, answers: [{ ...rows[0], answer: "Non", values: ["Non"] }, rows[1], { ...rows[2], answer: "19h", values: ["19h"] }] })
    vi.stubGlobal("fetch", fetchMock)
    card()
    fireEvent.click(editButton())
    fireEvent.click(screen.getByRole("radio", { name: "Non" }))
    fireEvent.change(screen.getByRole("textbox", { name: /Remarque/ }), { target: { value: "19h" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Réponses enregistrées."))
    expect(fetchMock).toHaveBeenCalledWith("/api/public/registrations/tok/answers", expect.objectContaining({ method: "PATCH" }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ answers: { meal: "Non", size: "M", note: "19h" } })
    expect(screen.getAllByRole("definition").map((d) => d.textContent)).toEqual(["Non", "M", "19h"])
    expect(editButton()).toHaveFocus()
  })

  it("a number answer (#1015): prefilled, checked against its bounds before sending, sent as typed", async () => {
    const guests: MyAnswerRow = { id: "guests", label: "Combien ?", answer: "3", type: "number", options: [], required: false, minValue: 1, maxValue: 8, values: ["3"] }
    const fetchMock = reply(200, { changed: 1, answers: [{ ...guests, answer: "4", values: ["4"] }] })
    vi.stubGlobal("fetch", fetchMock)
    card({ rows: [guests] })
    expect(screen.getByRole("definition")).toHaveTextContent("3")
    fireEvent.click(editButton())
    const field = screen.getByRole("textbox", { name: "Combien ? (facultatif)" })
    expect(field).toHaveValue("3")
    expect(field).toHaveFocus()
    fireEvent.change(field, { target: { value: "12" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"))
    expect(field).toHaveAccessibleDescription("Un nombre entier, de 1 à 8. « Combien ? » : entre 1 et 8.")
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: "4" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Réponses enregistrées."))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ answers: { guests: "4" } })
    expect(screen.getByRole("definition")).toHaveTextContent("4")
  })

  it("nothing changed: says so", async () => {
    vi.stubGlobal("fetch", reply(200, { changed: 0, answers: rows }))
    card()
    fireEvent.click(editButton())
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Aucune modification à enregistrer."))
  })

  it("a refused field: its message under it, focus on it, the form stays", async () => {
    vi.stubGlobal("fetch", reply(400, { error: "x", questionErrors: [{ questionId: "note", message: "« Remarque ? » : 200 caractères au plus." }] }))
    card()
    fireEvent.click(editButton())
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    const field = await screen.findByRole("textbox", { name: /Remarque/ })
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field).toHaveAccessibleDescription("« Remarque ? » : 200 caractères au plus.")
  })

  it("Enter in the refused field itself: the message is voiced by the alert, focus stays", async () => {
    vi.stubGlobal("fetch", reply(400, { error: "x", questionErrors: [{ questionId: "note", message: "« Remarque ? » : 200 caractères au plus." }] }))
    card()
    fireEvent.click(editButton())
    const field = screen.getByRole("textbox", { name: /Remarque/ })
    field.focus()
    fireEvent.submit(screen.getByRole("form"))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("« Remarque ? » : 200 caractères au plus."))
    expect(field).toHaveFocus()
  })

  it("a failure keeps the typed answers and says what to do in an alert", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    card()
    fireEvent.click(editButton())
    fireEvent.click(screen.getByRole("radio", { name: "Non" }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Enregistrement impossible. Réessaie plus tard."))
    expect(screen.getByRole("radio", { name: "Non" })).toBeChecked()
  })

  it("closed meanwhile (409): the form goes, the note says nothing was saved and takes focus", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "x", code: "answers_closed", reason: "deadline" }))
    card()
    fireEvent.click(editButton())
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(screen.queryByRole("form")).toBeNull())
    const note = document.getElementById("my-answers-closed")!
    expect(note).toHaveFocus()
    expect(note).toHaveTextContent("Tes modifications n'ont pas été enregistrées. Tu ne peux plus modifier tes réponses en ligne : le délai")
    expect(within(note).getByRole("link")).toHaveAttribute("href", expect.stringContaining("mailto:org@x.ch"))
  })

  it("closed: no button, why, and whom to write to", () => {
    card({ edit: { allowed: false, reason: "started" } })
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText(/ta mission a commencé/)).toBeInTheDocument()
    expect(screen.getByText(/écris à l'organisation/)).toBeInTheDocument()
  })
})
