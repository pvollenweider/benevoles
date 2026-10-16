import { describe, it, expect } from "vitest"
import { checkAnswers, conditionText, consistentAdditions, followUpApplies, formOrder, visibleQuestions, type Question } from "@/lib/event-questions"
import {
  HAS_FOLLOW_UPS, PARENT_LOCKED, PARENT_NESTED, PARENT_SELF, PARENT_TYPE, PARENT_UNKNOWN, VALUES_EMPTY, VALUES_LOCKED, VALUES_UNKNOWN,
  canMove, duplicatedParent, followUpErrorField, followUpProblem, followUpText, moveInGroups, moveStatus, normalisedOrder, normalisedShowIf,
  parentCandidates, parentEditProblem, removalLines,
} from "@/lib/question-follow-up"
import { answerSummary, answerSummaryCsv, conditionLine } from "@/lib/question-answer-summary"
import { myAnswerRows, shownRows, storedAnswers } from "@/lib/my-answers"
import { duplicatePlan } from "@/lib/event-duplicate"

// Follow-up questions (#1016): « Tu manges avec nous vendredi soir ? » then, if « Oui », « Combien de personnes ? ».
const meal: Question = { id: "meal", label: "Tu manges avec nous vendredi soir ?", type: "yesno", options: [], required: true }
const count: Question = { id: "count", label: "Combien de personnes ?", type: "number", options: [], required: true, minValue: 1, maxValue: 10, parentId: "meal", showIfValues: ["Oui"] }
const size: Question = { id: "size", label: "Taille", type: "single", options: ["S", "M"], required: false }

describe("which follow-up is asked", () => {
  it("applies when the parent's answer is one of the accepted ones, any of them for a multiple choice", () => {
    expect(followUpApplies(count, ["Oui"])).toBe(true)
    expect(followUpApplies(count, ["Non"])).toBe(false)
    expect(followUpApplies(count, [])).toBe(false)
    expect(followUpApplies(count, undefined)).toBe(false)
    expect(followUpApplies({ parentId: "p", showIfValues: ["Vélo", "Voiture"] }, ["Train", "Voiture"])).toBe(true)
    expect(followUpApplies(size, undefined)).toBe(true)
  })

  it("puts each follow-up right after its parent, others in their order", () => {
    expect(formOrder([count, size, meal]).map((q) => q.id)).toEqual(["size", "meal", "count"])
    // A follow-up whose parent is not in the list stays where it is.
    expect(formOrder([count, size]).map((q) => q.id)).toEqual(["count", "size"])
    expect(normalisedOrder([{ id: "a" }, { id: "f", parentId: "b" }, { id: "b" }])).toEqual(["a", "b", "f"])
  })

  it("shows the follow-up only while the typed answer matches, a cleared answer hiding it", () => {
    const qs = [meal, count, size]
    expect(visibleQuestions(qs, {}).map((q) => q.id)).toEqual(["meal", "size"])
    expect(visibleQuestions(qs, { meal: "Oui" }).map((q) => q.id)).toEqual(["meal", "count", "size"])
    expect(visibleQuestions(qs, { meal: "Non" }).map((q) => q.id)).toEqual(["meal", "size"])
    // « Pas de réponse » on the personal page sends "".
    expect(visibleQuestions(qs, { meal: "" }).map((q) => q.id)).toEqual(["meal", "size"])
    expect(visibleQuestions([count], { meal: "Oui" })).toEqual([])
  })

  it("says the condition in words, with several answers joined by « ou »", () => {
    expect(conditionText(["Oui"], "Repas ?")).toBe("Si « Oui » à « Repas ? »")
    expect(conditionText(["Oui", "Peut-être"], "Repas ?")).toBe("Si « Oui » ou « Peut-être » à « Repas ? »")
  })
})

describe("checkAnswers with a follow-up", () => {
  it("requires a visible follow-up and stores its number", () => {
    const missing = checkAnswers([meal, count], { meal: "Oui" })
    expect(missing).toEqual({ ok: false, errors: [{ questionId: "count", message: "« Combien de personnes ? » est obligatoire." }] })
    expect(checkAnswers([meal, count], { meal: "Oui", count: "3" })).toEqual({ ok: true, values: new Map([["meal", ["Oui"]], ["count", ["3"]]]), hidden: [] })
  })

  it("neither requires nor keeps a hidden follow-up, even a forged or invalid answer", () => {
    expect(checkAnswers([meal, count], { meal: "Non" })).toEqual({ ok: true, values: new Map([["meal", ["Non"]]]), hidden: ["count"] })
    expect(checkAnswers([meal, count], { meal: "Non", count: "3" })).toEqual({ ok: true, values: new Map([["meal", ["Non"]]]), hidden: ["count"] })
    expect(checkAnswers([meal, count], { meal: "Non", count: "-4" }).ok).toBe(true)
  })

  it("never asks a follow-up whose parent is not among the questions", () => {
    expect(checkAnswers([count], { count: "3" })).toEqual({ ok: true, values: new Map(), hidden: ["count"] })
  })

  it("lists the errors in form order, the follow-up checked after its parent", () => {
    const r = checkAnswers([count, meal, { ...size, required: true }], { meal: "Oui", count: "0" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.map((e) => e.questionId)).toEqual(["count", "size"])
  })

  it("keeps the stored answers of the questions not sent (personal page), the follow-up judged on them", () => {
    const keep = new Map([["meal", ["Oui"]], ["count", ["3"]]])
    // Only the follow-up sent: the stored « Oui » shows it.
    expect(checkAnswers([meal, count], { count: "4" }, { keep })).toEqual({ ok: true, values: new Map([["meal", ["Oui"]], ["count", ["4"]]]), hidden: [] })
    // The parent changed to « Non », the follow-up not sent: hidden, so the caller clears it.
    expect(checkAnswers([meal, count], { meal: "Non" }, { keep })).toEqual({ ok: true, values: new Map([["meal", ["Non"]]]), hidden: ["count"] })
    // Nothing sent: the stored answers stay, nothing is refused.
    expect(checkAnswers([meal, count], {}, { keep })).toEqual({ ok: true, values: keep, hidden: [] })
  })

  it("an unproven sign-up adds a follow-up only when the stored parent answer shows it", () => {
    const qs = [meal, count]
    expect(consistentAdditions(qs, [["meal", ["Oui"]], ["count", ["3"]]], new Map())).toEqual([["meal", ["Oui"]], ["count", ["3"]]])
    expect(consistentAdditions(qs, [["count", ["3"]]], new Map([["meal", ["Non"]]]))).toEqual([])
    expect(consistentAdditions(qs, [["count", ["3"]]], new Map([["meal", ["Oui"]]]))).toEqual([["count", ["3"]]])
    expect(consistentAdditions([count], [["count", ["3"]]], new Map([["meal", ["Oui"]]]))).toEqual([])
  })
})

describe("the organiser's rules", () => {
  const questions = [
    { id: "meal", label: "Repas ?", type: "yesno", options: [], parentId: null },
    { id: "size", label: "Taille", type: "single", options: ["S", "M"], parentId: null },
    { id: "free", label: "Remarque", type: "text", options: [], parentId: null },
    { id: "count", label: "Combien ?", type: "number", options: [], parentId: "meal" },
  ]

  it("offers as parent the yes/no and choice questions that aren't follow-ups, never itself", () => {
    expect(parentCandidates(questions, null).map((q) => q.id)).toEqual(["meal", "size"])
    expect(parentCandidates(questions, "size").map((q) => q.id)).toEqual(["meal"])
    // A question with a follow-up can't become one (one level only).
    expect(parentCandidates(questions, "meal")).toEqual([])
  })

  it("refuses a parent of another event, itself, a follow-up, a text question, or a question with follow-ups", () => {
    const ok = (parentId: string, showIfValues = ["Oui"], selfId: string | null = null) => followUpProblem({ selfId, parentId, showIfValues }, questions)
    expect(ok("meal")).toBeNull()
    expect(followUpProblem({ selfId: null, parentId: null, showIfValues: [] }, questions)).toBeNull()
    expect(ok("elsewhere")).toBe(PARENT_UNKNOWN)
    expect(ok("size", ["S"], "size")).toBe(PARENT_SELF)
    expect(ok("count")).toBe(PARENT_NESTED)
    expect(ok("free")).toBe(PARENT_TYPE)
    expect(ok("size", ["S"], "meal")).toBe(HAS_FOLLOW_UPS)
    expect(ok("meal", [])).toBe(VALUES_EMPTY)
    expect(ok("size", ["XL"])).toBe(VALUES_UNKNOWN)
  })

  it("once answered, a follow-up keeps its parent and its accepted answers can only grow", () => {
    const existing = { parentId: "size", showIfValues: ["S"], answerCount: 2 }
    const check = (parentId: string | null, showIfValues: string[]) => followUpProblem({ selfId: "x", parentId, showIfValues }, questions, existing)
    expect(check("size", ["S", "M"])).toBeNull()
    expect(check(null, [])).toBeNull()
    expect(check("meal", ["Oui"])).toBe(PARENT_LOCKED)
    expect(check("size", ["M"])).toBe(VALUES_LOCKED)
    // An answered question asked to everyone can't become a follow-up.
    expect(followUpProblem({ selfId: "x", parentId: "meal", showIfValues: ["Oui"] }, questions, { parentId: null, showIfValues: [], answerCount: 1 })).toBe(PARENT_LOCKED)
  })

  it("stores the accepted answers in the parent's order, each once", () => {
    expect(normalisedShowIf({ type: "single", options: ["S", "M", "L"] }, ["L", "S", "L"])).toEqual(["S", "L"])
    expect(normalisedShowIf({ type: "yesno", options: [] }, ["Non"])).toEqual(["Non"])
  })

  it("a parent stays a choice question and keeps the choices its follow-ups use", () => {
    const f = [{ label: "Combien ?", showIfValues: ["S"] }]
    expect(parentEditProblem({ type: "single", options: ["S", "XL"] }, f)).toBeNull()
    expect(parentEditProblem({ type: "text", options: [] }, f)).toMatch(/Oui \/ non ou à choix/)
    expect(parentEditProblem({ type: "single", options: ["M", "L"] }, f)).toBe("La question de suivi « Combien ? » s'affiche pour « S » : ce choix ne peut pas être retiré.")
    expect(parentEditProblem({ type: "text", options: [] }, [])).toBeNull()
  })

  it("moves a parent with its follow-ups, a follow-up only among its siblings", () => {
    const list = [{ id: "a" }, { id: "p" }, { id: "f1", parentId: "p" }, { id: "f2", parentId: "p" }, { id: "b" }]
    expect(moveInGroups(list, "p", -1)!.map((q) => q.id)).toEqual(["p", "f1", "f2", "a", "b"])
    expect(moveInGroups(list, "p", 1)!.map((q) => q.id)).toEqual(["a", "b", "p", "f1", "f2"])
    expect(moveInGroups(list, "b", -1)!.map((q) => q.id)).toEqual(["a", "b", "p", "f1", "f2"])
    expect(moveInGroups(list, "f2", -1)!.map((q) => q.id)).toEqual(["a", "p", "f2", "f1", "b"])
    expect(moveInGroups(list, "f1", -1)).toBeNull()
    expect(canMove(list, "f2", 1)).toBe(false)
    expect(canMove(list, "a", -1)).toBe(false)
    expect(canMove(list, "a", 1)).toBe(true)
  })

  it("says the removal of a parent removes its follow-ups too, and the moves of a block", () => {
    expect(removalLines({ answers: 0 }, [{ label: "Combien ?", answers: 2 }])).toEqual([
      "Elle disparaît du formulaire. Personne n'y a encore répondu.",
      "Sa question de suivi « Combien ? » est retirée aussi ; ses 2 réponses restent dans les exports.",
    ])
    expect(removalLines({ answers: 1 }, [])).toHaveLength(1)
    expect(moveStatus("Repas ?", 1, 2, 5)).toBe("« Repas ? » et sa question de suivi sont maintenant en position 2 sur 5.")
    expect(moveStatus("Taille", 0, 1, 5)).toBe("« Taille » est maintenant en position 1 sur 5.")
  })

  it("names the condition in the list, and ties a refusal to its field", () => {
    expect(followUpText({ parentId: "meal", showIfValues: ["Oui"] }, questions)).toBe("Si « Oui » à « Repas ? »")
    expect(followUpText({ parentId: null }, questions)).toBeNull()
    expect(followUpErrorField(VALUES_EMPTY)).toBe("showif")
    expect(followUpErrorField(PARENT_NESTED)).toBe("parent")
    expect(followUpErrorField("autre")).toBeNull()
    expect(duplicatedParent("a", new Map([["a", "a2"]]))).toBe("a2")
    expect(duplicatedParent("z", new Map())).toBeNull()
    expect(duplicatedParent(null, new Map())).toBeNull()
  })
})

describe("the summary of a follow-up (#686)", () => {
  const regs = [
    { volunteerId: "v1", status: "active" },
    { volunteerId: "v2", status: "active" },
    { volunteerId: "v3", status: "active" },
    { volunteerId: "v4", status: "waiting" },
  ]
  const questions = [
    { id: "count", label: "Combien de personnes ?", type: "number", options: [], parentId: "meal", showIfValues: ["Oui"], answers: [
      { volunteerId: "v1", values: ["3"] },
      // A stale answer of somebody who now says « Non »: not counted.
      { volunteerId: "v2", values: ["5"] },
      { volunteerId: "v4", values: ["2"] },
    ] },
    { id: "meal", label: "Repas ?", type: "yesno", options: [], answers: [
      { volunteerId: "v1", values: ["Oui"] },
      { volunteerId: "v2", values: ["Non"] },
      { volunteerId: "v3", values: ["Oui"] },
      { volunteerId: "v4", values: ["Oui"] },
    ] },
  ]

  it("comes after its parent and counts only the people it was asked to", () => {
    const s = answerSummary(questions, regs)
    expect(s.questions.map((q) => q.id)).toEqual(["meal", "count"])
    const f = s.questions[1]
    expect(f.condition).toEqual({ text: "Si « Oui » à « Repas ? »", confirmed: 2, waiting: 1 })
    expect(f.rows).toEqual([
      { answer: "Total", kind: "total", confirmed: 3, waiting: 2 },
      { answer: "Nombre de réponses", kind: "count", confirmed: 1, waiting: 1 },
      // v3 said « Oui » without a number; v2 said « Non » and is not « sans réponse ».
      { answer: "Sans réponse", kind: "none", confirmed: 1, waiting: 0 },
    ])
    expect(s.questions[0].condition).toBeUndefined()
  })

  it("says whom it was asked to, and its condition in the CSV", () => {
    const s = answerSummary(questions, regs)
    expect(conditionLine(s.questions[1].condition!, true)).toBe("Posée seulement si « Oui » à « Repas ? » : 2 bénévoles confirmés concernés, 1 en attente.")
    expect(conditionLine({ text: "Si « Oui » à « Repas ? »", confirmed: 1, waiting: 0 }, false)).toBe("Posée seulement si « Oui » à « Repas ? » : 1 bénévole confirmé concerné.")
    expect(answerSummaryCsv(s)).toContain("Combien de personnes ? (si « Oui » à « Repas ? »)")
  })

  it("counts nobody for a follow-up whose parent is gone", () => {
    const s = answerSummary([questions[0]], regs)
    expect(s.questions[0].condition).toMatchObject({ confirmed: 0, waiting: 0 })
    expect(s.questions[0].rows.find((r) => r.kind === "none")).toMatchObject({ confirmed: 0, waiting: 0 })
  })
})

describe("« Mes réponses » with a follow-up (#984)", () => {
  const row = (id: string, position: number, values: string[], extra: Record<string, unknown> = {}) => ({ id, label: id, position, type: "yesno", options: [], answers: values.length ? [{ values }] : [], ...extra })

  it("lists the follow-up right after its parent, shown only when the stored answer shows it", () => {
    const rows = myAnswerRows([row("f", 0, ["3"], { type: "number", parentId: "p", showIfValues: ["Oui"] }), row("x", 1, []), row("p", 2, ["Oui"])])
    expect(rows.map((r) => r.id)).toEqual(["x", "p", "f"])
    expect(shownRows(rows).map((r) => r.id)).toEqual(["x", "p", "f"])
    const no = myAnswerRows([row("p", 0, ["Non"]), row("f", 1, [], { type: "number", parentId: "p", showIfValues: ["Oui"] })])
    expect(shownRows(no).map((r) => r.id)).toEqual(["p"])
  })

  it("reads the stored answers by question, as checkAnswers keeps them", () => {
    expect(storedAnswers([row("p", 0, ["Oui"]), row("x", 1, [])])).toEqual(new Map([["p", ["Oui"]]]))
  })
})

describe("duplicating an event with a follow-up (#378)", () => {
  const source = {
    title: "Fête", description: null, location: null, startDate: new Date("2026-06-01T00:00:00Z"), endDate: new Date("2026-06-01T00:00:00Z"),
    latitude: null, longitude: null, publicInstructions: null, confirmationMessage: null, reminderMessage: null, remindersEnabled: true,
    requirePhone: false, accentColorKey: null, showSchedule: [], shifts: [], pages: [], leaders: [],
  }

  it("points the copied follow-up to the copy of its parent, never to the source", () => {
    let n = 0
    const plan = duplicatePlan({ ...source, questions: [
      { id: "meal", label: "Repas ?", type: "yesno", options: [], required: true, position: 0 },
      { id: "count", label: "Combien ?", type: "number", options: [], required: false, position: 1, parentId: "meal", showIfValues: ["Oui"] },
    ] }, {}, () => `new-${++n}`)
    expect(plan.questions.map((q) => [q.id, q.parentId, q.showIfValues])).toEqual([["new-1", null, []], ["new-2", "new-1", ["Oui"]]])
  })

  it("leaves out a follow-up whose parent is not copied", () => {
    const plan = duplicatePlan({ ...source, questions: [
      { id: "count", label: "Combien ?", type: "number", options: [], required: false, position: 1, parentId: "gone", showIfValues: ["Oui"] },
    ] }, {}, () => "id")
    expect(plan.questions).toEqual([])
  })
})
