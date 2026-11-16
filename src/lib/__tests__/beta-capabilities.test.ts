import { describe, it, expect } from "vitest"
import {
  BETA_CAPABILITIES,
  BETA_NOTHING_OPEN_ERROR,
  betaAdoptionAllowed,
  betaCardVisible,
  betaReadOnlyValue,
  betaStateSentence,
  betaSwitchHint,
  capabilityChanges,
  decideBetaOptIn,
  isOpenableCapability,
  OPENABLE_CAPABILITY_IDS,
  parseCapabilityRequest,
  parseOpenCapabilities,
  storedOpenList,
  type BetaRegistry,
} from "../beta-capabilities"

// The rules still in the beta, checked against a small registry: one shipped, one not.
const SHIPPED: BetaRegistry = {
  swaps: { label: "Échanges", description: "Échanger un créneau.", shipped: true },
  future: { label: "À venir", description: "Pas encore livrée.", shipped: false },
}

const OPTED_IN = { active: true, suspendedAt: null, betaOptInAt: new Date("2026-10-26T10:00:00Z") }
const NOT_OPTED_IN = { active: true, suspendedAt: null, betaOptInAt: null }

describe("registry", () => {
  it("keeps sectors and sector leaders as graduated capabilities, not openable by the operator", () => {
    expect(BETA_CAPABILITIES.sectors.graduated).toBe(true)
    expect(BETA_CAPABILITIES.sectorLeaders.graduated).toBe(true)
    expect(isOpenableCapability("sectors")).toBe(false)
    expect(isOpenableCapability("sectorLeaders")).toBe(false)
    expect(OPENABLE_CAPABILITY_IDS).not.toContain("sectors")
    expect(OPENABLE_CAPABILITY_IDS).not.toContain("sectorLeaders")
  })

  it("keeps the four other features in the beta, with their labels", () => {
    expect(OPENABLE_CAPABILITY_IDS).toEqual(["shiftSwaps", "workloadProtection", "availability", "assignmentProposals"])
    expect(BETA_CAPABILITIES.shiftSwaps.shipped).toBe(true)
    expect(BETA_CAPABILITIES.workloadProtection.shipped).toBe(true)
    expect(BETA_CAPABILITIES.availability.shipped).toBe(true)
    expect(BETA_CAPABILITIES.assignmentProposals.shipped).toBe(true)
    expect(BETA_CAPABILITIES.sectors.label).toBe("Secteurs")
    expect(BETA_CAPABILITIES.sectors.description).toMatch(/^Regrouper plusieurs postes sous une même coordination\.$/)
  })
})

describe("parseOpenCapabilities", () => {
  it("ignores a graduated capability stored in PlatformSetting", () => {
    expect(parseOpenCapabilities({ open: ["sectors", "sectorLeaders", "shiftSwaps"] })).toEqual(["shiftSwaps"])
  })

  it("ignores unknown ids stored in PlatformSetting", () => {
    expect(parseOpenCapabilities({ open: ["swaps", "teleportation", 42, null] }, SHIPPED)).toEqual(["swaps"])
  })

  it("ignores a known capability that is not shipped in this version", () => {
    expect(parseOpenCapabilities({ open: ["future"] }, SHIPPED)).toEqual([])
  })

  it("keeps each id once, in the registry's order", () => {
    expect(parseOpenCapabilities({ open: ["swaps", "swaps"] }, SHIPPED)).toEqual(["swaps"])
  })

  it("opens nothing for a missing row or a malformed value", () => {
    for (const value of [undefined, null, "swaps", { open: "swaps" }, {}, 1]) {
      expect(parseOpenCapabilities(value, SHIPPED)).toEqual([])
    }
  })
})

describe("parseCapabilityRequest", () => {
  it("accepts the full list to keep open", () => {
    expect(parseCapabilityRequest({ open: ["swaps"] }, SHIPPED)).toEqual({ ok: true, open: ["swaps"] })
    expect(parseCapabilityRequest({ open: [] }, SHIPPED)).toEqual({ ok: true, open: [] })
  })

  it("refuses a graduated capability or an unknown one instead of pretending to open it", () => {
    expect(parseCapabilityRequest({ open: ["sectors"] }).ok).toBe(false)
    expect(parseCapabilityRequest({ open: ["sectorLeaders"] }).ok).toBe(false)
    expect(parseCapabilityRequest({ open: ["teleportation"] }, SHIPPED).ok).toBe(false)
    expect(parseCapabilityRequest({ open: ["future"] }, SHIPPED).ok).toBe(false)
  })

  it("refuses a body without a list", () => {
    expect(parseCapabilityRequest(null, SHIPPED).ok).toBe(false)
    expect(parseCapabilityRequest({ open: [1] }, SHIPPED).ok).toBe(false)
  })
})

describe("storedOpenList", () => {
  it("keeps the ids this version cannot manage, so saving never closes what the screen does not show", () => {
    // A graduated id is kept like an unknown one: an older pod serving during a rollout still reads it.
    expect(storedOpenList([], { open: ["sectors", "future-thing", "swaps"] }, SHIPPED)).toEqual(["sectors", "future-thing"])
    expect(storedOpenList(["sectors"], null, SHIPPED)).toEqual(["sectors"])
  })
})

describe("capabilityChanges", () => {
  it("lists what is opened and closed, for the operator log", () => {
    expect(capabilityChanges([], ["shiftSwaps"])).toEqual({ opened: ["shiftSwaps"], closed: [] })
    expect(capabilityChanges(["shiftSwaps"], [])).toEqual({ opened: [], closed: ["shiftSwaps"] })
    expect(capabilityChanges(["shiftSwaps"], ["shiftSwaps"])).toEqual({ opened: [], closed: [] })
  })
})

describe("betaAdoptionAllowed", () => {
  it("BE01: an opted-in, active organisation adopts a capability the operator opened", () => {
    expect(betaAdoptionAllowed(OPTED_IN, ["swaps"], "swaps", SHIPPED)).toBe(true)
    expect(betaAdoptionAllowed(OPTED_IN, ["shiftSwaps"], "shiftSwaps")).toBe(true)
  })

  it("the four features still in the beta require the operator's open list and the organisation's opt-in", () => {
    expect(betaAdoptionAllowed(NOT_OPTED_IN, ["shiftSwaps"], "shiftSwaps")).toBe(false)
    expect(betaAdoptionAllowed(OPTED_IN, [], "shiftSwaps")).toBe(false)
    expect(betaAdoptionAllowed(OPTED_IN, ["workloadProtection"], "shiftSwaps")).toBe(false)
    expect(betaAdoptionAllowed(OPTED_IN, ["shiftSwaps"], "workloadProtection")).toBe(false)
  })

  it("#1311: sectors and sector leaders need neither the open list nor the organisation's opt-in", () => {
    expect(betaAdoptionAllowed(NOT_OPTED_IN, [], "sectors")).toBe(true)
    expect(betaAdoptionAllowed(NOT_OPTED_IN, [], "sectorLeaders")).toBe(true)
  })

  it("refuses an unknown or unshipped capability even if stored as open", () => {
    expect(betaAdoptionAllowed(OPTED_IN, ["teleportation"], "teleportation")).toBe(false)
    expect(betaAdoptionAllowed(OPTED_IN, ["future"], "future", SHIPPED)).toBe(false)
  })

  it("refuses a deactivated or suspended organisation, even for a graduated capability", () => {
    expect(betaAdoptionAllowed({ ...OPTED_IN, active: false }, [], "sectors")).toBe(false)
    expect(betaAdoptionAllowed({ ...OPTED_IN, suspendedAt: new Date() }, [], "sectors")).toBe(false)
    expect(betaAdoptionAllowed(null, [], "sectors")).toBe(false)
    expect(betaAdoptionAllowed({ ...NOT_OPTED_IN, active: false }, [], "sectorLeaders")).toBe(false)
  })

  it("BE06: after an opt-out new beta adoptions are refused; the rule reads the state and changes nothing", () => {
    const org = { ...OPTED_IN }
    const open = ["swaps"]
    expect(betaAdoptionAllowed(org, open, "swaps", SHIPPED)).toBe(true)
    const left = { ...org, betaOptInAt: null }
    expect(betaAdoptionAllowed(left, open, "swaps", SHIPPED)).toBe(false)
    // A graduated capability is unaffected by the opt-out.
    expect(betaAdoptionAllowed(left, [], "sectors")).toBe(true)
    // Nothing deleted: the inputs are left as they were (the helper has no write side).
    expect(org.betaOptInAt).toEqual(OPTED_IN.betaOptInAt)
    expect(open).toEqual(["swaps"])
  })
})

describe("betaCardVisible", () => {
  it("BE01: hides the card when nothing is open and the organisation does not take part", () => {
    expect(betaCardVisible([], false)).toBe(false)
  })

  it("#1311: a stored sectors id no longer makes the card appear", () => {
    expect(betaCardVisible(parseOpenCapabilities({ open: ["sectors", "sectorLeaders"] }), false)).toBe(false)
  })

  it("shows it while something is open, or while the organisation takes part so it can leave", () => {
    expect(betaCardVisible(["shiftSwaps"], false)).toBe(true)
    expect(betaCardVisible([], true)).toBe(true)
  })
})

describe("decideBetaOptIn", () => {
  it("joins when something is open", () => {
    expect(decideBetaOptIn(false, { optIn: true }, ["shiftSwaps"])).toEqual({ ok: true, change: "opt_in" })
  })

  it("refuses to join when nothing is open", () => {
    expect(decideBetaOptIn(false, { optIn: true }, [])).toEqual({ ok: false, status: 409, error: BETA_NOTHING_OPEN_ERROR })
  })

  it("always lets an organisation leave, even when everything was closed", () => {
    expect(decideBetaOptIn(true, { optIn: false }, [])).toEqual({ ok: true, change: "opt_out" })
  })

  it("changes nothing when the state is already the one asked for", () => {
    expect(decideBetaOptIn(true, { optIn: true }, [])).toEqual({ ok: true, change: null })
    expect(decideBetaOptIn(false, { optIn: false }, ["shiftSwaps"])).toEqual({ ok: true, change: null })
  })

  it("refuses a malformed request", () => {
    expect(decideBetaOptIn(false, {}, ["shiftSwaps"]).ok).toBe(false)
    expect(decideBetaOptIn(false, { optIn: "yes" }, ["shiftSwaps"]).ok).toBe(false)
    expect(decideBetaOptIn(false, null, ["shiftSwaps"]).ok).toBe(false)
  })
})

describe("card texts", () => {
  const on = { optedIn: true, optedInAt: "2026-10-26T08:00:00Z", optedInByName: "Marie Dupont" }
  const off = { optedIn: false, optedInAt: null, optedInByName: null }

  it("says since when and who turned the beta on", () => {
    expect(betaStateSentence(on, "Europe/Zurich")).toBe("Votre organisation participe à la bêta depuis le 26 octobre 2026 (activée par Marie Dupont).")
    expect(betaStateSentence({ ...on, optedInByName: null }, "Europe/Zurich")).toBe("Votre organisation participe à la bêta depuis le 26 octobre 2026.")
    expect(betaStateSentence(off, "Europe/Zurich")).toBe("Votre organisation ne participe pas à la bêta.")
  })

  it("labels leaving « Ne plus activer de nouvelles fonctions bêta » and says what is in use keeps working", () => {
    expect(betaSwitchHint(true, false)).toMatch(/^Ne plus activer de nouvelles fonctions bêta/)
    expect(betaSwitchHint(true, true)).toMatch(/continue de fonctionner, rien n'est supprimé/)
  })

  it("says joining changes no existing event and sends nothing", () => {
    expect(betaSwitchHint(false, true)).toMatch(/Vos événements existants ne changent pas/)
    expect(betaSwitchHint(false, true)).toMatch(/Rien n'est envoyé/)
    expect(betaSwitchHint(false, false)).toMatch(/participer de nouveau dès qu'une fonction sera ouverte/)
  })

  it("gives organisers a read-only value", () => {
    expect(betaReadOnlyValue(on, "Europe/Zurich")).toBe("oui, depuis le 26 octobre 2026")
    expect(betaReadOnlyValue(off, "Europe/Zurich")).toBe("non")
  })
})
