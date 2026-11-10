// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import {
  answerConditionMention,
  answerConditionProblems,
  answerConditionQuestions,
  answerConditionRefusal,
  answerConditionSettingProblem,
  answerValuesMatch,
  questionAnswerConditionDeletionProblem,
  questionAnswerConditionProblem,
  reservedAnswerConditionOf,
  reservedAnswerConditions,
} from "../role-answer"

const permit = { id: "q-permis", label: "Permis de conduire", type: "yesno", options: [], parentId: null, displayScope: "event" }
const vehicles = { id: "q-vehicules", label: "Véhicules", type: "multiple", options: ["Voiture", "Vélo", "Camion"], parentId: null, displayScope: "event" }

const condition = { questionId: permit.id, answers: ["Oui"] }

describe("reservedAnswerConditions", () => {
  it("reads no condition from a poste without one", () => {
    expect(reservedAnswerConditions([{ roleName: "Bar", reservedQuestionId: null, reservedAnswers: [] }]).size).toBe(0)
    expect(reservedAnswerConditionOf([{ roleName: "Bar" }], "Bar")).toBeNull()
  })

  it("keeps the condition set on any shift of the role, answers once each", () => {
    const shifts = [
      { roleName: "Navette", reservedQuestionId: permit.id, reservedAnswers: ["Oui"] },
      { roleName: "Navette", reservedQuestionId: permit.id, reservedAnswers: ["Oui", "Non"] },
      { roleName: "Bar", reservedQuestionId: null, reservedAnswers: [] },
    ]
    expect(reservedAnswerConditionOf(shifts, "Navette")).toEqual({ questionId: permit.id, answers: ["Oui", "Non"] })
    expect(reservedAnswerConditionOf(shifts, "Bar")).toBeNull()
  })

  it("keeps a shift created without the condition from bypassing it", () => {
    const conditions = reservedAnswerConditions([
      { roleName: "Navette", reservedQuestionId: permit.id, reservedAnswers: ["Oui"] },
      { roleName: "Navette", reservedQuestionId: null, reservedAnswers: [] },
    ])
    expect(conditions.get("Navette")).toEqual(condition)
  })
})

describe("answerValuesMatch", () => {
  it("accepts the accepted answer of a single choice", () => {
    expect(answerValuesMatch(condition, ["Oui"])).toBe(true)
  })
  it("accepts at least one accepted answer of a multiple choice", () => {
    const c = { questionId: vehicles.id, answers: ["Voiture", "Vélo"] }
    expect(answerValuesMatch(c, ["Vélo", "Camion"])).toBe(true)
    expect(answerValuesMatch(c, ["Camion"])).toBe(false)
  })
  it("refuses another answer, an empty answer or no answer", () => {
    expect(answerValuesMatch(condition, ["Non"])).toBe(false)
    expect(answerValuesMatch(condition, [])).toBe(false)
    expect(answerValuesMatch(condition, undefined)).toBe(false)
  })
})

describe("answerConditionProblems", () => {
  const shifts = [
    { id: "s1", roleName: "Navette" },
    { id: "s2", roleName: "Bar" },
    { id: "s3", roleName: "Navette" },
  ]
  const conditions = new Map([["Navette", condition]])

  it("ignores a poste without condition", () => {
    expect(answerConditionProblems(shifts, conditions, new Map()).map((p) => p.shiftId)).toEqual(["s1", "s3"])
    expect(answerConditionProblems([{ id: "s2", roleName: "Bar" }], conditions, new Map())).toEqual([])
  })
  it("accepts a matching answer and refuses a differing or missing one", () => {
    expect(answerConditionProblems([shifts[0]], conditions, new Map([[permit.id, ["Oui"]]]))).toEqual([])
    expect(answerConditionProblems([shifts[0]], conditions, new Map([[permit.id, ["Non"]]]))).toHaveLength(1)
    expect(answerConditionProblems([shifts[0]], conditions, new Map())).toHaveLength(1)
  })
})

describe("texts", () => {
  it("says the mention and the refusal with the question and stored answers", () => {
    expect(answerConditionMention("Permis de conduire", ["Oui"])).toBe("Réservé : Permis de conduire, Oui")
    expect(answerConditionMention("Véhicules", ["Voiture", "Vélo"])).toBe("Réservé : Véhicules, Voiture ou Vélo")
    expect(answerConditionRefusal("Permis de conduire", ["Oui"])).toBe("Ce poste est réservé aux personnes qui répondent Oui à « Permis de conduire ».")
  })
})

describe("answerConditionQuestions", () => {
  it("offers choice questions asked to everyone, never text, number or a follow-up", () => {
    const questions = [
      permit,
      vehicles,
      { id: "t", label: "Texte", type: "text", options: [], parentId: null, displayScope: "event" },
      { id: "n", label: "Nombre", type: "number", options: [], parentId: null, displayScope: "event" },
      { id: "r", label: "Certains postes", type: "single", options: ["A"], parentId: null, displayScope: "roles" },
      { id: "f", label: "Suivi", type: "single", options: ["A"], parentId: permit.id, displayScope: "event" },
    ]
    expect(answerConditionQuestions(questions).map((q) => q.id)).toEqual(["q-permis", "q-vehicules"])
  })
})

describe("answerConditionSettingProblem", () => {
  const questions = [permit, vehicles]
  it("accepts an empty condition and a choice asked to everyone with at least one of its choices", () => {
    expect(answerConditionSettingProblem({ questionId: null, answers: [] }, questions)).toBeNull()
    expect(answerConditionSettingProblem({ questionId: permit.id, answers: ["Oui"] }, questions)).toBeNull()
    expect(answerConditionSettingProblem({ questionId: vehicles.id, answers: ["Vélo"] }, questions)).toBeNull()
  })
  it("refuses a question outside the event, not a choice, not asked to everyone, or an unknown answer", () => {
    expect(answerConditionSettingProblem({ questionId: "missing", answers: ["Oui"] }, questions)).toContain("n'existe pas")
    expect(answerConditionSettingProblem({ questionId: "t", answers: ["Oui"] }, [{ ...permit, id: "t", type: "text" }])).toContain("à choix")
    expect(answerConditionSettingProblem({ questionId: "r", answers: ["A"] }, [{ ...permit, id: "r", type: "single", options: ["A"], displayScope: "roles" }])).toContain("tous les bénévoles")
    expect(answerConditionSettingProblem({ questionId: permit.id, answers: [] }, questions)).toContain("au moins une réponse")
    expect(answerConditionSettingProblem({ questionId: vehicles.id, answers: ["Bateau"] }, questions)).toContain("Bateau")
  })
})

describe("question changes while a poste depends on it", () => {
  const dependent = [{ roleName: "Navette", reservedAnswers: ["Oui"] }]
  it("allows a label change and a safe choice change", () => {
    expect(questionAnswerConditionProblem({ ...permit, label: "Permis" }, dependent)).toBeNull()
    expect(questionAnswerConditionProblem({ ...permit, type: "single", options: ["Oui", "Non", "Peut-être"] }, dependent)).toBeNull()
  })
  it("refuses a free-text type, a follow-up, a narrowed scope or removing an accepted answer", () => {
    expect(questionAnswerConditionProblem({ ...permit, type: "text", options: [] }, dependent)).toContain("« Navette »")
    expect(questionAnswerConditionProblem({ ...permit, parentId: "parent" }, dependent)).toContain("question de suivi")
    expect(questionAnswerConditionProblem({ ...permit, displayScope: "roles", displayRoleNames: ["Bar"] }, dependent)).toContain("tous les bénévoles")
    expect(questionAnswerConditionProblem({ ...permit, type: "single", options: ["Non"] }, dependent)).toContain("« Oui »")
    expect(questionAnswerConditionProblem({ ...permit, type: "text" }, [{ roleName: "Navette", reservedAnswers: [] }])).toContain("à choix")
  })
  it("refuses deleting the question while a poste depends on it, naming the poste", () => {
    expect(questionAnswerConditionDeletionProblem(dependent)).toContain("« Navette »")
    expect(questionAnswerConditionDeletionProblem([])).toBeNull()
  })
})
