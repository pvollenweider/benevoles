import { describe, it, expect } from "vitest"
import {
  SCOPE_ROLES_EMPTY, SCOPE_ROLE_UNKNOWN, askedQuestions, detachedScope, duplicatedScope, effectiveScope, inheritedScopeText, isAsked,
  normalisedScope, removeRoleFromScope, renameRoleInScope, scopeLogText, scopeProblem, scopeRoleChoices, scopeText, splitByScope,
} from "../question-scope"
import { checkAnswers, planAnswerWrites, type Question } from "../event-questions"
import { questionSchema } from "../event-questions-schema"

// Questions shown only for the roles a volunteer picks (#1140).

const all: Question = { id: "size", label: "Taille", type: "single", options: ["S", "M"], required: true }
const bar: Question = { id: "bar", label: "Service au bar ?", type: "yesno", options: [], required: true, displayScope: "roles", displayRoleNames: ["Bar"] }
const barFollowUp: Question = { id: "bar-hours", label: "Combien d'heures ?", type: "number", options: [], required: true, parentId: "bar", showIfValues: ["Oui"] }
const kitchen: Question = { id: "kitchen", label: "Allergies ?", type: "text", options: [], required: true, displayScope: "roles", displayRoleNames: ["Cuisine", "Plonge"] }
const nobody: Question = { id: "gone", label: "Ancien poste", type: "text", options: [], required: true, displayScope: "roles", displayRoleNames: [] }
const questions: Question[] = [all, bar, barFollowUp, kitchen, nobody]

describe("visibility of a question (#1140)", () => {
  const byId = new Map(questions.map((q) => [q.id, q]))

  it("a whole-event question (the default, and every older question) is asked to everyone, even without a shift", () => {
    expect(isAsked(all, byId, new Set())).toBe(true)
    expect(isAsked({ id: "x", displayScope: "event", displayRoleNames: ["Bar"] }, new Map(), new Set())).toBe(true)
  })

  it("a scoped question is asked when one of the chosen postes is in its scope", () => {
    expect(isAsked(kitchen, byId, new Set(["Parking"]))).toBe(false)
    expect(isAsked(kitchen, byId, new Set(["Parking", "Plonge"]))).toBe(true)
  })

  it("a follow-up follows its parent's scope, whatever it stores itself", () => {
    expect(effectiveScope(barFollowUp, byId)).toEqual(["Bar"])
    expect(isAsked({ ...barFollowUp, displayScope: "roles", displayRoleNames: ["Parking"] }, byId, new Set(["Bar"]))).toBe(true)
    expect(isAsked(barFollowUp, byId, new Set(["Parking"]))).toBe(false)
  })

  it("a scope whose postes are all gone is asked to nobody, never widened to everyone", () => {
    expect(isAsked(nobody, byId, new Set(["Bar", "Cuisine", "Parking"]))).toBe(false)
  })

  it("splitByScope keeps the order and separates the out-of-scope questions", () => {
    const { asked, outOfScope } = splitByScope(questions, ["Bar"])
    expect(asked.map((q) => q.id)).toEqual(["size", "bar", "bar-hours"])
    expect(outOfScope.map((q) => q.id)).toEqual(["kitchen", "gone"])
    expect(askedQuestions(questions, []).map((q) => q.id)).toEqual(["size"])
  })
})

describe("required-ness and answers once scoped (#1140)", () => {
  it("a required question of a poste not chosen never blocks the sign-up, and its posted answer is ignored", () => {
    const check = checkAnswers(askedQuestions(questions, ["Parking"]), { size: "M", bar: "Oui", kitchen: "Noix" })
    expect(check.ok).toBe(true)
    if (!check.ok) return
    expect([...check.values.keys()]).toEqual(["size"])
  })

  it("a scoped question is required once one of its postes is chosen", () => {
    const check = checkAnswers(askedQuestions(questions, ["Cuisine"]), { size: "M" })
    expect(check.ok).toBe(false)
    if (check.ok) return
    expect(check.errors.map((e) => e.questionId)).toEqual(["kitchen"])
  })

  it("conditional questions keep working inside a scope: the follow-up is asked only for « Oui »", () => {
    const asked = askedQuestions(questions, ["Bar"])
    const yes = checkAnswers(asked, { size: "M", bar: "Oui" })
    expect(yes.ok).toBe(false)
    const no = checkAnswers(asked, { size: "M", bar: "Non" })
    expect(no.ok && no.hidden).toEqual(["bar-hours"])
  })

  it("a follow-up of an out-of-scope parent is out of scope too, not hidden: its stored answer is never cleared", () => {
    const asked = askedQuestions(questions, ["Parking"])
    const check = checkAnswers(asked, { size: "S" })
    expect(check.ok && check.hidden).toEqual([])
    // With proof of the address, only the asked questions left empty are cleared.
    const writes = planAnswerWrites(asked.map((q) => q.id), check.ok ? check.values : new Map(), true)
    expect(writes.clear).toEqual([])
  })
})

describe("scope as stored and checked (#1140)", () => {
  it("normalisedScope: no names for the whole event, trimmed and each once for postes", () => {
    expect(normalisedScope({ displayScope: "event", displayRoleNames: ["Bar"] })).toEqual({ displayScope: "event", displayRoleNames: [] })
    expect(normalisedScope({ displayScope: "roles", displayRoleNames: [" Bar", "Bar", "Cuisine "] })).toEqual({ displayScope: "roles", displayRoleNames: ["Bar", "Cuisine"] })
  })

  it("the admin schema keeps the scope absent on an edit that doesn't send it, normalised otherwise", () => {
    const base = { label: "Taille", type: "text" }
    const kept = questionSchema.parse(base)
    expect(kept.displayScope).toBeUndefined()
    expect(kept.displayRoleNames).toBeUndefined()
    expect(questionSchema.parse({ ...base, displayScope: "roles", displayRoleNames: ["Bar", "Bar"] })).toMatchObject({ displayScope: "roles", displayRoleNames: ["Bar"] })
    expect(questionSchema.safeParse({ ...base, displayScope: "everyone" }).success).toBe(false)
  })

  it("scopeProblem: postes of the event only, at least one", () => {
    expect(scopeProblem({ displayScope: "event", displayRoleNames: [] }, [])).toBeNull()
    expect(scopeProblem({ displayScope: "roles", displayRoleNames: ["Bar"] }, ["Bar", "Cuisine"])).toBeNull()
    expect(scopeProblem({ displayScope: "roles", displayRoleNames: [] }, ["Bar"])).toBe(SCOPE_ROLES_EMPTY)
    expect(scopeProblem({ displayScope: "roles", displayRoleNames: ["Autre événement"] }, ["Bar"])).toBe(SCOPE_ROLE_UNKNOWN)
  })

  it("scopeProblem: a poste the question already had stays allowed, and a question already asked to nobody can be saved unchanged", () => {
    expect(scopeProblem({ displayScope: "roles", displayRoleNames: ["Ancien"] }, ["Bar"], { displayScope: "roles", displayRoleNames: ["Ancien"] })).toBeNull()
    expect(scopeProblem({ displayScope: "roles", displayRoleNames: [] }, ["Bar"], { displayScope: "roles", displayRoleNames: [] })).toBeNull()
    expect(scopeProblem({ displayScope: "roles", displayRoleNames: [] }, ["Bar"], { displayScope: "event", displayRoleNames: [] })).toBe(SCOPE_ROLES_EMPTY)
  })

  it("rename and deletion of a poste keep the scope in step; the last one gone leaves it asked to nobody", () => {
    expect(renameRoleInScope(["Bar", "Cuisine"], "Bar", "Buvette")).toEqual(["Buvette", "Cuisine"])
    expect(renameRoleInScope(["Bar", "Buvette"], "Bar", "Buvette")).toEqual(["Buvette"])
    expect(removeRoleFromScope(["Bar", "Cuisine"], "Bar")).toEqual(["Cuisine"])
    expect(removeRoleFromScope(["Bar"], "Bar")).toEqual([])
  })

  it("a detached follow-up starts from its former parent's scope; a duplicated question copies its own", () => {
    expect(detachedScope({ displayScope: "roles", displayRoleNames: ["Bar"] })).toEqual({ displayScope: "roles", displayRoleNames: ["Bar"] })
    expect(detachedScope(undefined)).toEqual({ displayScope: "event", displayRoleNames: [] })
    expect(duplicatedScope(bar)).toEqual({ displayScope: "roles", displayRoleNames: ["Bar"] })
    expect(duplicatedScope(all)).toEqual({ displayScope: "event", displayRoleNames: [] })
    expect(duplicatedScope({ ...barFollowUp, displayScope: "roles", displayRoleNames: ["X"] })).toEqual({ displayScope: "event", displayRoleNames: [] })
  })
})

describe("texts of the scope (#1140)", () => {
  it("in the list, the event log and for a follow-up", () => {
    expect(scopeText(all)).toBeNull()
    expect(scopeText(kitchen)).toBe("Posée seulement pour : Cuisine, Plonge")
    expect(scopeText(nobody)).toBe("Posée à personne (plus aucun de ses postes)")
    expect(scopeLogText(all)).toBe("tous les bénévoles")
    expect(scopeLogText(kitchen)).toBe("Cuisine, Plonge")
    expect(scopeLogText(nobody)).toBe("aucun poste")
    expect(inheritedScopeText(bar)).toBe("Une question de suivi est posée aux mêmes bénévoles que « Service au bar ? » : aux bénévoles des postes Bar.")
    expect(inheritedScopeText(all)).toContain("à tous les bénévoles")
  })

  it("the editor's checkboxes: live postes by name, then a ticked poste without shifts, saying so", () => {
    expect(scopeRoleChoices(["Parking", "Bar", "Bar"], ["Ancien", "Bar"])).toEqual([
      { value: "Bar", label: "Bar" },
      { value: "Parking", label: "Parking" },
      { value: "Ancien", label: "Ancien (plus aucun créneau)" },
    ])
  })
})
