import { describe, it, expect } from "vitest"
import {
  QUESTION_ROLE_PROBLEM, duplicatedQuestionRole, questionErrorField, questionRoleOptions, questionRoleProblem, questionRoleText,
} from "../question-role"

// A sign-up question attached to a poste (#984, part 3).

describe("questionRoleOptions", () => {
  const roles = [{ roleName: "Parking", leaders: 0 }, { roleName: "Cuisine", leaders: 2 }]

  it("« Aucun » first, then the postes by name, saying which have no leader", () => {
    expect(questionRoleOptions(roles, null)).toEqual([
      { value: "", label: "Aucun" },
      { value: "Cuisine", label: "Cuisine" },
      { value: "Parking", label: "Parking (aucun responsable)" },
    ])
  })

  it("keeps a poste no live shift carries any more when the question still has it, saying so", () => {
    expect(questionRoleOptions(roles, "Bar").at(-1)).toEqual({ value: "Bar", label: "Bar (plus aucun créneau)" })
    expect(questionRoleOptions(roles, "Cuisine")).toHaveLength(3)
  })

  it("only « Aucun » for an event without postes", () => {
    expect(questionRoleOptions([], null)).toEqual([{ value: "", label: "Aucun" }])
  })
})

describe("questionRoleProblem", () => {
  it("none, or a poste of the event's live shifts", () => {
    expect(questionRoleProblem(null, [])).toBeNull()
    expect(questionRoleProblem("", ["Cuisine"])).toBeNull()
    expect(questionRoleProblem("Cuisine", ["Cuisine", "Bar"])).toBeNull()
  })

  it("refuses a poste the event doesn't have (another event's, another organisation's)", () => {
    expect(questionRoleProblem("Accueil", ["Cuisine"])).toBe(QUESTION_ROLE_PROBLEM)
  })

  it("the poste the question already has stays allowed unchanged", () => {
    expect(questionRoleProblem("Bar", ["Cuisine"], "Bar")).toBeNull()
    expect(questionRoleProblem("Accueil", ["Cuisine"], "Bar")).toBe(QUESTION_ROLE_PROBLEM)
  })
})

describe("questionErrorField", () => {
  it("the poste's refusal marks the poste's field, anything else none", () => {
    expect(questionErrorField(QUESTION_ROLE_PROBLEM)).toBe("role")
    expect(questionErrorField("La question est obligatoire.")).toBeNull()
  })

  it("a refused bound of a number question marks its field (#1015)", () => {
    expect(questionErrorField("Un bénévole a répondu 2 : le minimum ne peut pas dépasser 2.")).toBe("min")
    expect(questionErrorField("Un bénévole a répondu 5 : le maximum ne peut pas être inférieur à 5.")).toBe("max")
    expect(questionErrorField("Le maximum doit être au moins égal au minimum.")).toBe("max")
    expect(questionErrorField("Le minimum ne peut pas être négatif.")).toBe("min")
  })
})

describe("questionRoleText and duplicatedQuestionRole", () => {
  it("names the poste in the list, nothing without one", () => {
    expect(questionRoleText("Cuisine")).toBe("Poste : Cuisine")
    expect(questionRoleText(null)).toBeNull()
  })

  it("keeps the poste in a copy that has it, clears it otherwise", () => {
    expect(duplicatedQuestionRole("Cuisine", new Set(["Cuisine"]))).toBe("Cuisine")
    expect(duplicatedQuestionRole("Cuisine", new Set(["Bar"]))).toBeNull()
    expect(duplicatedQuestionRole(null, new Set(["Bar"]))).toBeNull()
  })
})
