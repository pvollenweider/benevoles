import { describe, it, expect } from "vitest"
import {
  applyResultMessage, applySummary, confirmQuestion, labelToApply, labelUpdates,
  posteApplyCount, posteApplyTargets, posteSpansOtherDays,
} from "../poste-apply"

// « Appliquer au poste » from the Frise popover (#1017): which shifts, what is copied, what is said.

const shifts = [
  { id: "a", roleName: "Bar", date: "2026-07-04", status: "open", label: "Bar" },
  { id: "b", roleName: "Bar", date: "2026-07-04", status: "full", label: "Bar soir" },
  { id: "c", roleName: "Bar", date: "2026-07-05", status: "closed", label: "Bar" },
  { id: "d", roleName: "Bar", date: "2026-07-06", status: "cancelled", label: "Bar" },
  { id: "e", roleName: "Accueil", date: "2026-07-04", status: "open", label: "Accueil" },
]

describe("posteApplyTargets", () => {
  it("« ce jour »: the poste's live shifts of that day only", () => {
    expect(posteApplyTargets(shifts, "Bar", "day", "2026-07-04").map((s) => s.id)).toEqual(["a", "b"])
  })

  it("« tout l'événement »: every live shift of the poste, whatever the day, never a cancelled one or another poste", () => {
    expect(posteApplyTargets(shifts, "Bar", "event", "2026-07-04").map((s) => s.id)).toEqual(["a", "b", "c"])
  })
})

describe("posteApplyCount and posteSpansOtherDays", () => {
  it("counts shifts and distinct days", () => {
    expect(posteApplyCount(posteApplyTargets(shifts, "Bar", "event", "2026-07-04"))).toEqual({ shifts: 3, days: 2 })
    expect(posteApplyCount([])).toEqual({ shifts: 0, days: 0 })
  })

  it("is true only when the poste has live shifts on another day", () => {
    expect(posteSpansOtherDays(shifts, "Bar", "2026-07-04")).toBe(true)
    expect(posteSpansOtherDays(shifts, "Accueil", "2026-07-04")).toBe(false)
    // A cancelled shift on another day does not count.
    expect(posteSpansOtherDays(shifts.filter((s) => s.id !== "c"), "Bar", "2026-07-04")).toBe(false)
  })
})

describe("labelToApply", () => {
  it("copies a label typed in the popover", () => {
    expect(labelToApply("  Bar soir ", "", "Bar")).toBe("Bar soir")
    expect(labelToApply("Bar nuit", "Bar soir", "Bar")).toBe("Bar nuit")
  })

  it("never overwrites the others' labels with an empty, unchanged or poste-name label", () => {
    expect(labelToApply("", "Bar soir", "Bar")).toBeUndefined()
    expect(labelToApply("   ", "", "Bar")).toBeUndefined()
    expect(labelToApply("Bar soir", "Bar soir", "Bar")).toBeUndefined()
    expect(labelToApply("Bar", "Bar soir", "Bar")).toBeUndefined()
  })
})

describe("labelUpdates", () => {
  it("writes only the shifts whose label differs, and nothing without a label", () => {
    expect(labelUpdates(shifts.slice(0, 3), "Bar soir")).toEqual([{ id: "a", label: "Bar soir" }, { id: "c", label: "Bar soir" }])
    expect(labelUpdates(shifts, undefined)).toEqual([])
  })
})

describe("applySummary", () => {
  it("says everything applied", () => {
    expect(applySummary({ capacity: 5, minVolunteers: 2, label: "Bar soir" }))
      .toBe("Applique 5 places, un minimum de 2 et le libellé « Bar soir ». Jamais moins de places que d'inscrits sur un créneau.")
  })

  it("says what each shift keeps", () => {
    expect(applySummary({ capacity: 1 }))
      .toBe("Applique 1 place. Chaque créneau garde son minimum et son libellé. Jamais moins de places que d'inscrits sur un créneau.")
    expect(applySummary({ capacity: 4, minVolunteers: null }))
      .toBe("Applique 4 places et aucun minimum. Chaque créneau garde son libellé. Jamais moins de places que d'inscrits sur un créneau.")
    expect(applySummary({ capacity: 4, label: "Relève" }))
      .toBe("Applique 4 places et le libellé « Relève ». Chaque créneau garde son minimum. Jamais moins de places que d'inscrits sur un créneau.")
  })
})

describe("confirmQuestion and applyResultMessage", () => {
  it("asks with the counts", () => {
    expect(confirmQuestion({ shifts: 12, days: 3 })).toBe("Appliquer à 12 créneaux sur 3 jours ?")
    expect(confirmQuestion({ shifts: 1, days: 1 })).toBe("Appliquer à 1 créneau sur 1 jour ?")
  })

  it("says what was covered, and the shifts kept above the places", () => {
    expect(applyResultMessage("Bar", "event", { shifts: 12, days: 3, keptHigher: 0 })).toBe("Appliqué à 12 créneaux du poste « Bar » sur 3 jours.")
    expect(applyResultMessage("Bar", "day", { shifts: 3, days: 1, keptHigher: 1 }))
      .toBe("Appliqué à 3 créneaux du poste « Bar » ce jour. 1 créneau garde plus de places : déjà plus d'inscrits.")
    expect(applyResultMessage("Bar", "event", { shifts: 1, days: 1, keptHigher: 2 }))
      .toBe("Appliqué à 1 créneau du poste « Bar ». 2 créneaux gardent plus de places : déjà plus d'inscrits.")
  })
})
