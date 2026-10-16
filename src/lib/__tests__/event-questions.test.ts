import { describe, it, expect } from "vitest"
import { answerText, checkAnswers, numberHint, numberRangeText, parseWholeNumber, questionChangeProblem, planAnswerWrites, NUMBER_ANSWER_MAX } from "../event-questions"
import { questionSchema } from "../event-questions-schema"

// Custom sign-up questions (#483).
const qs = [
  { id: "size", label: "Taille de t-shirt", type: "single", options: ["S", "M", "L"], required: true },
  { id: "licence", label: "Permis de conduire", type: "yesno", options: [], required: false },
  { id: "diet", label: "Régime", type: "multiple", options: ["Végétarien", "Sans gluten"], required: false },
  { id: "note", label: "Expérience", type: "text", options: [], required: false },
]

describe("questionSchema", () => {
  it("cleans options, keeps them only for choices, needs two choices", () => {
    expect(questionSchema.parse({ label: " Taille ", type: "single", options: ["S", "s", "M"] })).toEqual({ label: "Taille", type: "single", options: ["S", "M"], required: false, minValue: null, maxValue: null })
    expect(questionSchema.parse({ label: "Permis", type: "yesno", options: ["x"] }).options).toEqual([])
    expect(questionSchema.safeParse({ label: "Taille", type: "single", options: ["S"] }).success).toBe(false)
    expect(questionSchema.safeParse({ label: "X", type: "date" }).success).toBe(false)
  })

  it("number questions (#1015): minimum 0 by default, no maximum unless given, bounds dropped for other types", () => {
    expect(questionSchema.parse({ label: "Combien ?", type: "number" })).toEqual({ label: "Combien ?", type: "number", options: [], required: false, minValue: 0, maxValue: null })
    expect(questionSchema.parse({ label: "Combien ?", type: "number", minValue: 1, maxValue: 10, options: ["x"] })).toMatchObject({ minValue: 1, maxValue: 10, options: [] })
    expect(questionSchema.parse({ label: "Combien ?", type: "number", minValue: 4, maxValue: 4 })).toMatchObject({ minValue: 4, maxValue: 4 })
    expect(questionSchema.parse({ label: "Taille", type: "text", minValue: 3, maxValue: 9 })).toMatchObject({ minValue: null, maxValue: null })
  })

  it("refuses negative, decimal, too large or crossed bounds (#1015)", () => {
    const msg = (input: object) => { const r = questionSchema.safeParse({ label: "Combien ?", type: "number", ...input }); return r.success ? null : r.error.issues[0].message }
    expect(msg({ minValue: -1 })).toBe("Le minimum ne peut pas être négatif.")
    expect(msg({ maxValue: 2.5 })).toBe("Le maximum doit être un nombre entier.")
    expect(msg({ maxValue: NUMBER_ANSWER_MAX + 1 })).toBe(`Le maximum ne peut pas dépasser ${NUMBER_ANSWER_MAX}.`)
    expect(msg({ minValue: "3" })).toBe("Le minimum doit être un nombre entier.")
    expect(msg({ minValue: 5, maxValue: 2 })).toBe("Le maximum doit être au moins égal au minimum.")
    expect(msg({ maxValue: 0 })).toBeNull()
  })
})

describe("number questions (#1015)", () => {
  const count = { id: "n", label: "Combien de personnes ?", type: "number", options: [], required: false }
  const bounded = { ...count, id: "b", minValue: 1, maxValue: 10 }

  it("parses whole numbers, empty as none, anything else as NaN", () => {
    expect(parseWholeNumber("3")).toBe(3)
    expect(parseWholeNumber(" 03 ")).toBe(3)
    expect(parseWholeNumber("1 000")).toBe(1000)
    expect(parseWholeNumber("1\u202f000")).toBe(1000)
    expect(parseWholeNumber(7)).toBe(7)
    expect(parseWholeNumber("-2")).toBe(-2)
    expect(parseWholeNumber("")).toBeNull()
    expect(parseWholeNumber("  ")).toBeNull()
    expect(parseWholeNumber(undefined)).toBeNull()
    expect(parseWholeNumber(null)).toBeNull()
    for (const v of ["2,5", "2.5", 2.5, "trois", "3a", "1e3", "+3", true, ["3"], {}]) expect(parseWholeNumber(v)).toBeNaN()
  })

  it("stores one spelling of the number", () => {
    expect(checkAnswers([count], { n: " 03 " })).toEqual({ ok: true, values: new Map([["n", ["3"]]]), hidden: [] })
    expect(checkAnswers([count], { n: 0 })).toEqual({ ok: true, values: new Map([["n", ["0"]]]), hidden: [] })
  })

  it("an empty optional answer is no answer; an empty required one is refused", () => {
    expect(checkAnswers([count], { n: "" })).toEqual({ ok: true, values: new Map(), hidden: [] })
    expect(checkAnswers([count], {})).toEqual({ ok: true, values: new Map(), hidden: [] })
    expect(checkAnswers([{ ...count, required: true }], { n: "" })).toEqual({ ok: false, errors: [{ questionId: "n", message: "« Combien de personnes ? » est obligatoire." }] })
  })

  it("refuses a non-integer", () => {
    for (const v of ["2,5", "deux", 1.5]) expect(checkAnswers([count], { n: v })).toEqual({ ok: false, errors: [{ questionId: "n", message: "« Combien de personnes ? » : indique un nombre entier, sans virgule." }] })
  })

  it("refuses a negative number with the default minimum 0", () => {
    expect(checkAnswers([count], { n: "-1" })).toEqual({ ok: false, errors: [{ questionId: "n", message: "« Combien de personnes ? » : au moins 0." }] })
  })

  it("checks the bounds", () => {
    expect(checkAnswers([bounded], { b: "1" }).ok).toBe(true)
    expect(checkAnswers([bounded], { b: "10" }).ok).toBe(true)
    expect(checkAnswers([bounded], { b: "0" })).toEqual({ ok: false, errors: [{ questionId: "b", message: "« Combien de personnes ? » : entre 1 et 10." }] })
    expect(checkAnswers([bounded], { b: "11" })).toEqual({ ok: false, errors: [{ questionId: "b", message: "« Combien de personnes ? » : entre 1 et 10." }] })
    expect(checkAnswers([{ ...count, maxValue: 4 }], { n: "5" })).toEqual({ ok: false, errors: [{ questionId: "n", message: "« Combien de personnes ? » : au plus 4." }] })
    expect(checkAnswers([{ ...count, minValue: 2 }], { n: "1" })).toEqual({ ok: false, errors: [{ questionId: "n", message: "« Combien de personnes ? » : au moins 2." }] })
    expect(checkAnswers([count], { n: String(NUMBER_ANSWER_MAX + 1) })).toEqual({ ok: false, errors: [{ questionId: "n", message: `« Combien de personnes ? » : au plus ${NUMBER_ANSWER_MAX}.` }] })
  })

  it("says the range for people", () => {
    expect(numberRangeText({})).toBe("0 ou plus")
    expect(numberRangeText({ minValue: 2 })).toBe("2 ou plus")
    expect(numberRangeText({ minValue: 0, maxValue: 5 })).toBe("5 au plus")
    expect(numberRangeText({ minValue: 1, maxValue: 10 })).toBe("de 1 à 10")
    expect(numberHint({ minValue: 1, maxValue: 10 })).toBe("Un nombre entier, de 1 à 10.")
  })

  it("bounds can't leave out an answer already given", () => {
    const before = { type: "number", options: [] }
    expect(questionChangeProblem(before, { ...before, minValue: 0, maxValue: 5 }, ["2", "5"], 2)).toBeNull()
    expect(questionChangeProblem(before, { ...before, minValue: 3, maxValue: null }, ["2", "5"], 2)).toBe("Un bénévole a répondu 2 : le minimum ne peut pas dépasser 2.")
    expect(questionChangeProblem(before, { ...before, minValue: 0, maxValue: 4 }, ["2", "5"], 2)).toBe("Un bénévole a répondu 5 : le maximum ne peut pas être inférieur à 5.")
    expect(questionChangeProblem(before, { ...before, minValue: 9, maxValue: 9 }, [], 0)).toBeNull()
    expect(questionChangeProblem(before, { type: "text", options: [] }, ["2"], 1)).toMatch(/son type ne peut plus changer/)
  })
})

describe("checkAnswers", () => {
  it("accepts valid answers and keeps multiple choices in the question's order", () => {
    const r = checkAnswers(qs, { size: "M", licence: "Oui", diet: ["Sans gluten", "Végétarien"], note: "  Deux festivals  " })
    expect(r).toEqual({ ok: true, values: new Map([["size", ["M"]], ["licence", ["Oui"]], ["diet", ["Végétarien", "Sans gluten"]], ["note", ["Deux festivals"]]]), hidden: [] })
  })

  it("refuses a missing required answer, an unknown choice, a too long text", () => {
    const r = checkAnswers(qs, { size: "XXL", licence: "peut-être", diet: ["Carnivore"], note: "x".repeat(201) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.map((e) => e.questionId)).toEqual(["size", "licence", "diet", "note"])
    const missing = checkAnswers(qs, {})
    expect(missing).toEqual({ ok: false, errors: [{ questionId: "size", message: "« Taille de t-shirt » est obligatoire." }] })
  })

  it("stores nothing for unanswered optional questions and ignores unknown ids", () => {
    expect(checkAnswers(qs, { size: "S", other: "x" })).toEqual({ ok: true, values: new Map([["size", ["S"]]]), hidden: [] })
  })
})

describe("questionChangeProblem and answerText", () => {
  it("protects existing answers", () => {
    expect(questionChangeProblem({ type: "single", options: ["S", "M"] }, { type: "text", options: [] }, [], 0)).toBeNull()
    expect(questionChangeProblem({ type: "single", options: ["S", "M"] }, { type: "multiple", options: ["S", "M"] }, ["S"], 3)).toMatch(/type ne peut plus changer/)
    expect(questionChangeProblem({ type: "single", options: ["S", "M"] }, { type: "single", options: ["M", "L"] }, ["S", "M"], 3)).toMatch(/« S »/)
    expect(questionChangeProblem({ type: "single", options: ["S", "M"] }, { type: "single", options: ["S", "M", "L"] }, ["S"], 3)).toBeNull()
    expect(answerText(["Végétarien", "Sans gluten"])).toBe("Végétarien, Sans gluten")
    expect(answerText(undefined)).toBe("")
  })
})

describe("exports and lists (#483)", () => {
  it("adds one CSV column per question, empty when not answered", async () => {
    const { attendanceCsv } = await import("../attendance")
    const row = { firstName: "Léa", lastName: "M", email: "l@x.ch", phone: null, roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", checkedInAt: null }
    const csv = attendanceCsv([{ ...row, answers: ["M", ""] }], "Europe/Zurich", ["Taille", "Régime (question retirée)"])
    const [header, line] = csv.replace(/^﻿/, "").trim().split("\r\n")
    expect(header.endsWith(";Taille;Régime (question retirée)")).toBe(true)
    expect(line.endsWith(";M;")).toBe(true)
  })

  it("groups a volunteer's answers for the registrations list, retired questions marked", async () => {
    const { answersByVolunteer } = await import("../event-questions")
    const map = answersByVolunteer([
      { label: "Taille", archivedAt: null, answers: [{ volunteerId: "v1", values: ["M"] }] },
      { label: "Régime", archivedAt: new Date(), answers: [{ volunteerId: "v1", values: ["Végétarien", "Sans gluten"] }, { volunteerId: "v2", values: [] }] },
    ])
    expect(map).toEqual({ v1: [{ label: "Taille", text: "M" }, { label: "Régime (question retirée)", text: "Végétarien, Sans gluten" }] })
  })
})

describe("planAnswerWrites", () => {
  const values = new Map([["size", ["M"]]])
  it("with proof of the address: replaces the answers and clears optional ones left empty", () => {
    expect(planAnswerWrites(["size", "diet"], values, true)).toEqual({ replace: [["size", ["M"]]], addMissing: [], clear: ["diet"] })
  })
  it("without proof: only adds what's missing, never replaces or clears", () => {
    expect(planAnswerWrites(["size", "diet"], values, false)).toEqual({ replace: [], addMissing: [["size", ["M"]]], clear: [] })
  })
})
