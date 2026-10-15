import { describe, it, expect } from "vitest"
import { myAnswerRows, myAnswersQuery, NO_ANSWER_TEXT, type MyAnswerQuestion } from "../my-answers"

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
    expect(myAnswerRows([q("a", 0)])).toEqual([{ id: "a", label: "Question a ?", answer: null }])
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
    ])
    expect(rows.map((r) => r.answer)).toEqual(["Végétarien", "Non", "M", "Voiture, Vélo"])
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
