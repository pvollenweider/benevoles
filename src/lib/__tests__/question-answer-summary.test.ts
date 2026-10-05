import { describe, it, expect } from "vitest"
import { answerSummary, answerSummaryCsv, countedPeople, rowLabel, stateAt, textKey, type SummaryQuestion } from "../question-answer-summary"

const sizes: SummaryQuestion = {
  id: "q1", label: "Taille de t-shirt", type: "single", options: ["S", "M", "L"],
  answers: [
    { volunteerId: "alice", values: ["M"] },
    { volunteerId: "bob", values: ["L"] },
    { volunteerId: "carla", values: ["M"] }, // cancelled: not counted
    { volunteerId: "dan", values: ["S"] }, // waitlist only
  ],
}
const registrations = [
  { volunteerId: "alice", status: "active" },
  { volunteerId: "alice", status: "active" }, // two shifts, one t-shirt
  { volunteerId: "bob", status: "active" },
  { volunteerId: "bob", status: "waiting" },
  { volunteerId: "carla", status: "cancelled" },
  { volunteerId: "dan", status: "waiting" },
  { volunteerId: "eve", status: "active" }, // no answer
]
const rows = (q: { rows: { answer: string; kind: string; confirmed: number; waiting: number }[] }) =>
  q.rows.map((r) => `${rowLabel(r as never)}:${r.confirmed}/${r.waiting}`)

describe("answerSummary (#686)", () => {
  it("counts each confirmed volunteer once, waitlist apart, cancelled out", () => {
    const s = answerSummary([sizes], registrations)
    expect(s.confirmedCount).toBe(3)
    expect(s.waitingCount).toBe(1)
    expect(rows(s.questions[0])).toEqual(["S:0/1", "M:1/0", "L:1/0", "Sans réponse:1/0"])
  })

  it("a confirmed registration wins over a waitlist one, whatever the order", () => {
    const people = countedPeople([{ volunteerId: "a", status: "waiting" }, { volunteerId: "a", status: "active" }, { volunteerId: "b", status: "offered" }, { volunteerId: "c", status: "requested" }, { volunteerId: "d", status: "refused" }])
    expect([...people.entries()]).toEqual([["a", "confirmed"], ["b", "waiting"], ["c", "waiting"]])
  })

  it("keeps options in the question's order, with zero counts", () => {
    const s = answerSummary([{ ...sizes, options: ["L", "M", "S", "XL"] }], registrations)
    expect(rows(s.questions[0])).toEqual(["L:1/0", "M:1/0", "S:0/1", "XL:0/0", "Sans réponse:1/0"])
  })

  it("multiple choice counts every chosen option: totals can exceed the people", () => {
    const transport: SummaryQuestion = {
      id: "q2", label: "Transport", type: "multiple", options: ["Voiture", "Vélo", "Train"],
      answers: [{ volunteerId: "alice", values: ["Voiture", "Vélo"] }, { volunteerId: "bob", values: ["Vélo"] }],
    }
    const s = answerSummary([transport], registrations)
    expect(rows(s.questions[0])).toEqual(["Voiture:1/0", "Vélo:2/0", "Train:0/0", "Sans réponse:1/1"])
    // Three choices made by two people.
    expect(s.questions[0].rows.filter((r) => r.kind !== "none").reduce((n, r) => n + r.confirmed, 0)).toBe(3)
  })

  it("still counts an option removed after somebody chose it, after the current ones", () => {
    const s = answerSummary([{ ...sizes, options: ["S", "M"] }], registrations)
    expect(rows(s.questions[0])).toEqual(["S:0/1", "M:1/0", "L (choix retiré):1/0", "Sans réponse:1/0"])
    expect(s.questions[0].rows[2].kind).toBe("removed")
  })

  it("an option removed and chosen only by a cancelled volunteer does not appear", () => {
    const q: SummaryQuestion = { ...sizes, options: ["S", "L"], answers: [{ volunteerId: "carla", values: ["M"] }] }
    expect(rows(answerSummary([q], registrations).questions[0])).toEqual(["S:0/0", "L:0/0", "Sans réponse:3/1"])
  })

  it("empty values or no answer count as « Sans réponse »", () => {
    const q: SummaryQuestion = { id: "q3", label: "Permis", type: "yesno", options: [], answers: [{ volunteerId: "alice", values: ["Oui"] }, { volunteerId: "bob", values: [] }, { volunteerId: "eve", values: [" "] }] }
    expect(rows(answerSummary([q], registrations).questions[0])).toEqual(["Oui:1/0", "Non:0/0", "Sans réponse:2/1"])
  })

  it("with no registration at all, nobody is counted", () => {
    const s = answerSummary([sizes], [])
    expect(s.confirmedCount).toBe(0)
    expect(rows(s.questions[0])).toEqual(["S:0/0", "M:0/0", "L:0/0", "Sans réponse:0/0"])
  })

  it("groups short texts without case nor accents, most frequent first, the most typed spelling shown", () => {
    const diet: SummaryQuestion = {
      id: "q4", label: "Régime", type: "text", options: [],
      answers: [
        { volunteerId: "a", values: ["Végétarien"] },
        { volunteerId: "b", values: ["vegetarien "] },
        { volunteerId: "c", values: ["  Végétarien"] },
        { volunteerId: "d", values: ["Sans gluten"] },
        { volunteerId: "e", values: ["VÉGÉTARIEN"] },
        { volunteerId: "f", values: ["sans  gluten"] },
        { volunteerId: "g", values: ["Halal"] },
      ],
    }
    const regs = ["a", "b", "c", "d", "e", "g", "h"].map((v) => ({ volunteerId: v, status: "active" })).concat({ volunteerId: "f", status: "waiting" })
    expect(rows(answerSummary([diet], regs).questions[0])).toEqual(["Végétarien:4/0", "Sans gluten:1/1", "Halal:1/0", "Sans réponse:1/0"])
    // The same, whatever order the database returns the registrations in.
    expect(rows(answerSummary([diet], [...regs].reverse()).questions[0])).toEqual(["Végétarien:4/0", "Sans gluten:1/1", "Halal:1/0", "Sans réponse:1/0"])
    expect(textKey(" Crème  Brûlée ")).toBe("creme brulee")
  })

  it("leaves archived questions out", () => {
    const s = answerSummary([sizes, { ...sizes, id: "old", label: "Ancienne", archivedAt: new Date("2026-06-01") }], registrations)
    expect(s.questions.map((q) => q.id)).toEqual(["q1"])
  })

  it("exports one CSV line per answer, formulas neutralised", () => {
    const q: SummaryQuestion = { id: "q5", label: "Remarque", type: "text", options: [], answers: [{ volunteerId: "alice", values: ["=1+1"] }] }
    const lines = answerSummaryCsv(answerSummary([sizes, q], registrations)).replace(/^﻿/, "").split("\r\n")
    expect(lines[0]).toBe("Question;Réponse;Confirmés;En attente")
    expect(lines.slice(1, 5)).toEqual(["Taille de t-shirt;S;0;1", "Taille de t-shirt;M;1;0", "Taille de t-shirt;L;1;0", "Taille de t-shirt;Sans réponse;1;0"])
    expect(lines[5]).toBe("Remarque;'=1+1;1;0")
  })

  it("says when it was computed, in the organization's time zone", () => {
    expect(stateAt(new Date("2026-10-05T12:32:00Z"), "Europe/Zurich")).toBe("État au 5 octobre 2026 à 14h32")
    expect(stateAt(new Date("2026-01-05T08:05:00Z"), "UTC")).toBe("État au 5 janvier 2026 à 8h05")
  })
})
