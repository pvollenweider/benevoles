import { describe, expect, it } from "vitest"
import { swapDoneText, swapMission, swapState, swapStateHeading, swapStateText, swapWhen } from "../shift-swap-text"

const bar = { id: "s", roleName: "Bar", label: "Bar", date: "2030-07-04", startTime: "10:00", endTime: "12:00", locationDetails: null, instructions: null }
const soir = { ...bar, label: "Soir", date: "2030-07-05", startTime: "18:00", endTime: "20:00" }
const ZONE = "Europe/Zurich"
const base = { requestId: "q", revision: 1, deadline: "2030-07-04T08:00:00.000Z", needsApproval: false, gives: bar, receives: soir, endMessage: null, otherName: "Jean D." }

describe("shift swap words (#1174)", () => {
  it("names the shift by poste and label, in words", () => {
    expect(swapMission(bar)).toBe("Bar")
    expect(swapMission(soir)).toBe("Bar, Soir")
    expect(swapWhen(bar)).toBe("jeudi 4 juillet, de 10h à 12h")
  })

  it("says each state from each side, naming the other person once an offer exists", () => {
    expect(swapState({ ...base, side: "requester", status: "open", otherName: null })).toBe("En attente d'une proposition")
    expect(swapState({ ...base, side: "requester", status: "offered" })).toBe("Jean D. te propose un échange")
    expect(swapState({ ...base, side: "counterpart", status: "offered", otherName: "Pierre M." })).toBe("En attente de la réponse de Pierre M.")
    expect(swapState({ ...base, side: "requester", status: "approval" })).toBe("En attente de la validation de l'organisation")
    expect(swapState({ ...base, side: "requester", status: "applied" })).toBe("Échange effectué")
    expect(swapState({ ...base, side: "requester", status: "expired" })).toBe("Expiré")
    expect(swapState({ ...base, side: "requester", status: "impossible" })).toBe("Devenu impossible")
  })

  it("keeps two headings in the same state apart by the shift given", () => {
    expect(swapStateHeading({ ...base, side: "requester", status: "open" })).toBe("En attente d'une proposition : Bar, jeudi 4 juillet")
  })

  it("gives the deadline in the organisation's zone, and the reason of an impossible swap", () => {
    expect(swapStateText({ ...base, side: "requester", status: "offered" }, ZONE)).toContain("avant le jeudi 4 juillet à 10:00")
    expect(swapStateText({ ...base, side: "requester", status: "impossible", endMessage: "Cet échange crée un conflit d'horaire." }, ZONE))
      .toBe("L'échange ne peut plus être effectué : cet échange crée un conflit d'horaire. Tu conserves ton créneau.")
  })

  it("names the new shift once a swap is done", () => {
    expect(swapDoneText("confirm", "applied", soir)).toBe("Échange effectué : ton créneau est maintenant Bar, Soir, vendredi 5 juillet, de 18h à 20h.")
    expect(swapDoneText("confirm", "approval")).toBe("Échange accepté : il attend maintenant la validation de l'organisation.")
  })
})
