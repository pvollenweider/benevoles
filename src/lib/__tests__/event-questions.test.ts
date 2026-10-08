import { describe, it, expect } from "vitest"
import { answerText, checkAnswers, questionChangeProblem, planAnswerWrites } from "../event-questions"
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
    expect(questionSchema.parse({ label: " Taille ", type: "single", options: ["S", "s", "M"] })).toEqual({ label: "Taille", type: "single", options: ["S", "M"], required: false })
    expect(questionSchema.parse({ label: "Permis", type: "yesno", options: ["x"] }).options).toEqual([])
    expect(questionSchema.safeParse({ label: "Taille", type: "single", options: ["S"] }).success).toBe(false)
    expect(questionSchema.safeParse({ label: "X", type: "date" }).success).toBe(false)
  })
})

describe("checkAnswers", () => {
  it("accepts valid answers and keeps multiple choices in the question's order", () => {
    const r = checkAnswers(qs, { size: "M", licence: "Oui", diet: ["Sans gluten", "Végétarien"], note: "  Deux festivals  " })
    expect(r).toEqual({ ok: true, values: new Map([["size", ["M"]], ["licence", ["Oui"]], ["diet", ["Végétarien", "Sans gluten"]], ["note", ["Deux festivals"]]]) })
  })

  it("refuses a missing required answer, an unknown choice, a too long text", () => {
    const r = checkAnswers(qs, { size: "XXL", licence: "peut-être", diet: ["Carnivore"], note: "x".repeat(201) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.map((e) => e.questionId)).toEqual(["size", "licence", "diet", "note"])
    const missing = checkAnswers(qs, {})
    expect(missing).toEqual({ ok: false, errors: [{ questionId: "size", message: "« Taille de t-shirt » est obligatoire." }] })
  })

  it("stores nothing for unanswered optional questions and ignores unknown ids", () => {
    expect(checkAnswers(qs, { size: "S", other: "x" })).toEqual({ ok: true, values: new Map([["size", ["S"]]]) })
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
