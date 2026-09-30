import { describe, it, expect } from "vitest"
import { roleLimitAdminMessage, roleLimitBreaches, roleLimitMessage, roleLimitSelectionMessage, roleLimits } from "../role-limit"

const loge = (max: number | null = 2) => ({ roleName: "Loge", maxPerVolunteer: max })
const bar = { roleName: "Bar", maxPerVolunteer: null }

// Shifts per volunteer for a role (#466).
describe("roleLimits", () => {
  it("reads the role's limit from any of its shifts, the smallest winning", () => {
    expect(roleLimits([loge(null), loge(2), bar])).toEqual(new Map([["Loge", 2]]))
    expect(roleLimits([loge(3), loge(2)]).get("Loge")).toBe(2)
    expect(roleLimits([bar, loge(null), loge(0)]).size).toBe(0)
  })
})

describe("roleLimitBreaches", () => {
  const limits = new Map([["Loge", 2]])
  it("allows up to the limit, refuses one over", () => {
    expect(roleLimitBreaches([loge(), loge()], [], limits)).toEqual([])
    expect(roleLimitBreaches([loge()], [loge()], limits)).toEqual([])
    expect(roleLimitBreaches([loge()], [loge(), loge()], limits)).toEqual([{ roleName: "Loge", max: 2, held: 2, asked: 1 }])
    expect(roleLimitBreaches([loge(), loge(), loge()], [], limits)).toEqual([{ roleName: "Loge", max: 2, held: 0, asked: 3 }])
  })

  it("ignores roles without a limit and other roles' shifts", () => {
    expect(roleLimitBreaches([bar, bar, bar], [bar, loge(), loge()], limits)).toEqual([])
  })
})

describe("messages", () => {
  it("explains the limit to the volunteer and to the organiser", () => {
    expect(roleLimitMessage({ roleName: "Loge", max: 2, held: 2, asked: 1 })).toBe("Vous avez déjà 2 créneaux « Loge », le maximum pour ce poste.")
    expect(roleLimitMessage({ roleName: "Loge", max: 2, held: 0, asked: 3 })).toBe("Au plus 2 créneaux « Loge » par personne : vous en avez choisi 3, retirez-en 1.")
    expect(roleLimitMessage({ roleName: "Loge", max: 2, held: 1, asked: 2 })).toBe("Au plus 2 créneaux « Loge » par personne : vous en avez déjà 1, vous pouvez en ajouter 1.")
    expect(roleLimitMessage({ roleName: "Loge", max: 1, held: 1, asked: 1 })).toBe("Vous avez déjà 1 créneau « Loge », le maximum pour ce poste.")
    expect(roleLimitSelectionMessage({ roleName: "Loge", max: 2, held: 2, asked: 1 })).toBe("Au plus 2 créneaux « Loge » par personne : ce créneau n'est pas ajouté.")
    expect(roleLimitAdminMessage({ roleName: "Loge", max: 2, held: 2, asked: 1 }, "Alice Martin")).toBe("Alice Martin a déjà 2 créneaux « Loge », pour un maximum de 2 par personne.")
  })
})
