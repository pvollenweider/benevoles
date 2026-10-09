import { describe, it, expect } from "vitest"
import { OPERATOR_ACTIONS, OPERATOR_ACTION_LABELS, operatorActionLabel, operatorLogData, organizationTarget } from "../operator-log"

describe("operator log (#810)", () => {
  it("has a French label for every action, and shows an unknown one as it is", () => {
    for (const action of OPERATOR_ACTIONS) expect(OPERATOR_ACTION_LABELS[action]).toMatch(/\S/)
    expect(operatorActionLabel("organization.refused")).toBe("Espace refusé et supprimé")
    expect(operatorActionLabel("something.new")).toBe("something.new")
  })

  it("copies the author's name, else the address, and drops an empty reason", () => {
    const base = { action: "organization.approved" as const, entityType: "Organization" as const, entityId: "org-1", target: organizationTarget({ name: "Fête", slug: "fete" }) }
    expect(operatorLogData({ ...base, actor: { id: "sa-1", name: "Opérateur", email: "ops@example.org" }, detail: "  " })).toEqual({
      action: "organization.approved", actorId: "sa-1", actorLabel: "Opérateur", entityType: "Organization", entityId: "org-1", target: "Fête (fete)", detail: null,
    })
    expect(operatorLogData({ ...base, actor: { id: "sa-1", name: " ", email: "ops@example.org" } }).actorLabel).toBe("ops@example.org")
    expect(operatorLogData({ ...base, actor: null })).toMatchObject({ actorId: null, actorLabel: null })
  })
})
