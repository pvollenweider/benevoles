import { describe, it, expect } from "vitest"
import { leaderRenamePlan } from "../sector-leader-rename"

// Renaming a poste carries its sector leaders (#1001): one row per person under the new name.
describe("leaderRenamePlan", () => {
  it("drops nothing when nobody leads a poste of the new name", () => {
    expect(leaderRenamePlan([{ id: "a", email: "marc@x.org" }], [])).toEqual({ dropIds: [] })
  })

  it("keeps the leaders already under the new name who do not lead the renamed poste", () => {
    expect(leaderRenamePlan([{ id: "a", email: "marc@x.org" }], [{ id: "b", email: "lea@x.org" }])).toEqual({ dropIds: [] })
  })

  it("drops the new name's row of a person who leads both, whatever the casing or spaces", () => {
    const plan = leaderRenamePlan(
      [{ id: "a", email: "marc@x.org" }, { id: "c", email: "paul@x.org" }],
      [{ id: "b", email: " MARC@x.org " }, { id: "d", email: "lea@x.org" }],
    )
    expect(plan).toEqual({ dropIds: ["b"] })
  })

  it("drops nothing for a poste without leaders", () => {
    expect(leaderRenamePlan([], [{ id: "b", email: "lea@x.org" }])).toEqual({ dropIds: [] })
  })
})
