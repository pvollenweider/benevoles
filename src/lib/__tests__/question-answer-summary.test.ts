import { describe, it, expect } from "vitest"
import { answerSummary, answerSummaryCsv, countedPeople, numberNote, rowLabel, scopeLine, stateAt, textKey, type SummaryQuestion } from "../question-answer-summary"

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

  it("sums a number question (#1015): total, then how many answered, apart for the waiting people", () => {
    const guests: SummaryQuestion = {
      id: "q6", label: "Combien de personnes ?", type: "number", options: [],
      answers: [
        { volunteerId: "alice", values: ["3"] },
        { volunteerId: "bob", values: ["2"] },
        { volunteerId: "carla", values: ["9"] }, // cancelled: not counted
        { volunteerId: "dan", values: ["4"] }, // waitlist only
        { volunteerId: "eve", values: [""] }, // confirmed, no answer
      ],
    }
    const s = answerSummary([guests], registrations)
    expect(rows(s.questions[0])).toEqual(["Total:5/4", "Nombre de réponses:2/1", "Sans réponse:1/0"])
    expect(s.questions[0].rows.map((r) => r.kind)).toEqual(["total", "count", "none"])
  })

  it("a number question nobody answered totals 0; a zero answer counts as an answer (#1015)", () => {
    const q: SummaryQuestion = { id: "q7", label: "Combien ?", type: "number", options: [], answers: [{ volunteerId: "alice", values: ["0"] }] }
    expect(rows(answerSummary([{ ...q, answers: [] }], registrations).questions[0])).toEqual(["Total:0/0", "Nombre de réponses:0/0", "Sans réponse:3/1"])
    expect(rows(answerSummary([q], registrations).questions[0])).toEqual(["Total:0/0", "Nombre de réponses:1/0", "Sans réponse:2/1"])
  })

  it("exports the total of a number question in the CSV (#1015)", () => {
    const q: SummaryQuestion = { id: "q8", label: "Combien ?", type: "number", options: [], answers: [{ volunteerId: "alice", values: ["3"] }, { volunteerId: "bob", values: ["2"] }] }
    const lines = answerSummaryCsv(answerSummary([q], registrations)).replace(/^\uFEFF/, "").split("\r\n")
    expect(lines.slice(1, 4)).toEqual(["Combien ?;Total;5;0", "Combien ?;Nombre de réponses;2;0", "Combien ?;Sans réponse;1;1"])
    expect(numberNote(true)).toMatch(/séparément/)
    expect(numberNote(false)).toBe("Somme des nombres indiqués par les bénévoles confirmés.")
  })

  it("says when it was computed, in the organization's time zone", () => {
    expect(stateAt(new Date("2026-10-05T12:32:00Z"), "Europe/Zurich")).toBe("État au 5 octobre 2026 à 14h32")
    expect(stateAt(new Date("2026-01-05T08:05:00Z"), "UTC")).toBe("État au 5 janvier 2026 à 8h05")
  })
})

describe("questions asked to some postes (#1140)", () => {
  const regs = [
    { volunteerId: "alice", status: "active", shift: { roleName: "Bar" } },
    { volunteerId: "bob", status: "active", shift: { roleName: "Accueil" } },
    { volunteerId: "bob", status: "waiting", shift: { roleName: "Bar" } }, // confirmed elsewhere, waiting for the bar
    { volunteerId: "carla", status: "active", shift: { roleName: "Parking" } }, // left the bar, answer kept
  ]
  const cash: SummaryQuestion = {
    id: "cash", label: "Caisse ?", type: "yesno", options: [], displayScope: "roles", displayRoleNames: ["Bar"],
    answers: [{ volunteerId: "alice", values: ["Oui"] }, { volunteerId: "carla", values: ["Non"] }],
  }

  it("counts only the people on the postes, classified by those registrations; a kept answer of someone who left is not counted", () => {
    const s = answerSummary([cash], regs)
    expect(s.confirmedCount).toBe(3)
    expect(rows(s.questions[0])).toEqual(["Oui:1/0", "Non:0/0", "Sans réponse:0/1"])
    expect(s.questions[0].scope).toEqual({ roles: ["Bar"], confirmed: 1, waiting: 1 })
  })

  it("a follow-up counts within its parent's scope and condition; a whole-event question is unchanged", () => {
    const more: SummaryQuestion = { id: "more", label: "Combien d'heures ?", type: "number", options: [], parentId: "cash", showIfValues: ["Oui"], answers: [{ volunteerId: "alice", values: ["3"] }] }
    const all: SummaryQuestion = { id: "all", label: "Taille", type: "single", options: ["S"], answers: [] }
    const s = answerSummary([cash, more, all], regs)
    expect(s.questions[1].condition).toMatchObject({ confirmed: 1, waiting: 0 })
    expect(s.questions[1].scope).toBeUndefined()
    expect(s.questions[2].scope).toBeUndefined()
    expect(rows(s.questions[2])).toEqual(["S:0/0", "Sans réponse:3/0"])
  })

  it("says whom it was asked to, in the page and the CSV", () => {
    expect(scopeLine({ roles: ["Bar", "Cuisine"], confirmed: 3, waiting: 1 }, true)).toBe("Posée seulement pour Bar, Cuisine. 3 bénévoles confirmés concernés, 1 en attente.")
    expect(scopeLine({ roles: ["Bar"], confirmed: 1, waiting: 0 }, false)).toBe("Posée seulement pour Bar. 1 bénévole confirmé concerné.")
    expect(scopeLine({ roles: [], confirmed: 0, waiting: 0 }, false)).toMatch(/^Posée à personne/)
    expect(answerSummaryCsv(answerSummary([cash], regs))).toContain("Caisse ? (postes : Bar)")
  })
})

