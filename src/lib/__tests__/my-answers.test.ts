import { describe, it, expect } from "vitest"
import { myAnswerRows, myAnswersQuery, NO_ANSWER_TEXT, startingAnswers, type MyAnswerQuestion } from "../my-answers"

// « Mes réponses » on the personal page (#984): the volunteer's own answers, in form order.

const q = (id: string, position: number, values?: string[], extra: Partial<MyAnswerQuestion> = {}): MyAnswerQuestion => ({
  id, label: `Question ${id} ?`, position, answers: values ? [{ values }] : [], ...extra,
})

describe("myAnswerRows", () => {
  it("follows the order of the sign-up form, whatever the order read", () => {
    const rows = myAnswerRows([q("c", 2, ["x"]), q("a", 0, ["y"]), q("b", 1, ["z"])])
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"])
  })

  it("keeps the read order between questions at the same position", () => {
    expect(myAnswerRows([q("b", 0, ["1"]), q("a", 0, ["2"])]).map((r) => r.id)).toEqual(["b", "a"])
  })

  it("leaves out the questions removed from the form", () => {
    const rows = myAnswerRows([q("a", 0, ["Oui"]), q("b", 1, ["M"], { archivedAt: new Date("2026-10-01") }), q("c", 2, ["L"], { archivedAt: "2026-10-01T00:00:00Z" })])
    expect(rows.map((r) => r.id)).toEqual(["a"])
  })

  it("an unanswered question has no answer (the page says « Pas de réponse »)", () => {
    expect(myAnswerRows([q("a", 0)])).toEqual([{ id: "a", label: "Question a ?", answer: null, type: "text", options: [], required: false, minValue: null, maxValue: null, values: [] }])
    expect(myAnswerRows([q("a", 0, [])])[0].answer).toBeNull()
    expect(myAnswerRows([q("a", 0, ["  "])])[0].answer).toBeNull()
    expect(NO_ANSWER_TEXT).toBe("Pas de réponse")
  })

  it("shows each type of answer as people read it", () => {
    const rows = myAnswerRows([
      q("text", 0, ["Végétarien"]),
      q("yesno", 1, ["Non"]),
      q("single", 2, ["M"]),
      q("multiple", 3, ["Voiture", "Vélo"]),
      q("number", 4, ["3"], { type: "number", minValue: 1, maxValue: 8 }),
    ])
    expect(rows.map((r) => r.answer)).toEqual(["Végétarien", "Non", "M", "Voiture, Vélo", "3"])
    // A number question keeps its bounds for the edit form (#1015).
    expect(rows[4]).toMatchObject({ type: "number", minValue: 1, maxValue: 8, values: ["3"] })
  })

  it("no question, no row", () => {
    expect(myAnswerRows([])).toEqual([])
  })
})

describe("myAnswersQuery", () => {
  it("reads only this volunteer's answers, to the active questions of the event, in form order", () => {
    const args = myAnswersQuery("e1", "v1")
    expect(args.where).toEqual({ eventId: "e1", archivedAt: null })
    expect(args.select.answers).toEqual({ where: { volunteerId: "v1" }, select: { values: true } })
    expect(args.orderBy[0]).toEqual({ position: "asc" })
  })
})

describe("startingAnswers (#1013: the sign-up for more shifts starts from them)", () => {
  const row = (id: string, type: string, values: string[], options: string[] = []) => ({ id, type, values, options })

  it("one entry per question, as the form's fields hold them", () => {
    expect(startingAnswers([
      row("t", "text", ["Végétarien"]), row("y", "yesno", ["Oui"]), row("s", "single", ["M"], ["S", "M"]),
      row("m", "multiple", ["Vélo", "Train"], ["Voiture", "Vélo", "Train"]), row("n", "single", [], ["S", "M"]),
    ])).toEqual({ t: "Végétarien", y: "Oui", s: "M", m: ["Vélo", "Train"], n: "" })
  })

  it("leaves out an answer that is no longer a choice of its question (option renamed or removed)", () => {
    expect(startingAnswers([row("s", "single", ["XL"], ["S", "M"]), row("m", "multiple", ["Vélo", "Bus"], ["Vélo"]), row("y", "yesno", ["Peut-être"])])).toEqual({})
  })

  it("a number answer starts as its digits; an unreadable one is left out (#1015)", () => {
    expect(startingAnswers([row("n", "number", ["3"]), row("e", "number", [])])).toEqual({ n: "3", e: "" })
    expect(startingAnswers([row("x", "number", ["trois"])])).toEqual({})
  })

  it("from the personal page's rows: archived questions are not there", () => {
    const rows = myAnswerRows([q("a", 0, ["Oui"]), q("b", 1, ["M"], { archivedAt: new Date("2026-10-01") })])
    expect(Object.keys(startingAnswers(rows))).toEqual(["a"])
  })
})
