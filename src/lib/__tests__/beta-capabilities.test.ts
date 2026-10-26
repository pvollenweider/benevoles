import { describe, it, expect } from "vitest"
import {
  BETA_CAPABILITIES,
  BETA_CAPABILITY_IDS,
  BETA_NOTHING_OPEN_ERROR,
  betaAdoptionAllowed,
  betaCardVisible,
  betaReadOnlyValue,
  betaStateSentence,
  betaSwitchHint,
  capabilityChanges,
  decideBetaOptIn,
  isOpenableCapability,
  parseCapabilityRequest,
  parseOpenCapabilities,
  storedOpenList,
  type BetaRegistry,
} from "../beta-capabilities"

// The real registry ships nothing yet (sectors land with #1147): the rules are checked against a
// registry where sectors is shipped, plus one capability that is not.
const SHIPPED: BetaRegistry = {
  sectors: { label: "Secteurs", description: "Regrouper plusieurs postes sous une même coordination.", shipped: true },
  swaps: { label: "Échanges", description: "Échanger un créneau.", shipped: false },
}

const OPTED_IN = { active: true, suspendedAt: null, betaOptInAt: new Date("2026-10-26T10:00:00Z") }
const NOT_OPTED_IN = { active: true, suspendedAt: null, betaOptInAt: null }

describe("registry", () => {
  it("declares sectors with a French label and a one-sentence description", () => {
    expect(BETA_CAPABILITY_IDS).toContain("sectors")
    expect(BETA_CAPABILITIES.sectors.label).toBe("Secteurs")
    expect(BETA_CAPABILITIES.sectors.description).toMatch(/^Regrouper plusieurs postes sous une même coordination\.$/)
  })

  it("does not let sectors be opened before the sectors lot ships", () => {
    expect(isOpenableCapability("sectors")).toBe(false)
    expect(parseOpenCapabilities({ open: ["sectors"] })).toEqual([])
    expect(betaAdoptionAllowed(OPTED_IN, ["sectors"], "sectors")).toBe(false)
  })
})

describe("parseOpenCapabilities", () => {
  it("ignores unknown ids stored in PlatformSetting", () => {
    expect(parseOpenCapabilities({ open: ["sectors", "teleportation", 42, null] }, SHIPPED)).toEqual(["sectors"])
  })

  it("ignores a known capability that is not shipped in this version", () => {
    expect(parseOpenCapabilities({ open: ["swaps"] }, SHIPPED)).toEqual([])
  })

  it("keeps each id once, in the registry's order", () => {
    expect(parseOpenCapabilities({ open: ["sectors", "sectors"] }, SHIPPED)).toEqual(["sectors"])
  })

  it("opens nothing for a missing row or a malformed value", () => {
    for (const value of [undefined, null, "sectors", { open: "sectors" }, {}, 1]) {
      expect(parseOpenCapabilities(value, SHIPPED)).toEqual([])
    }
  })
})

describe("parseCapabilityRequest", () => {
  it("accepts the full list to keep open", () => {
    expect(parseCapabilityRequest({ open: ["sectors"] }, SHIPPED)).toEqual({ ok: true, open: ["sectors"] })
    expect(parseCapabilityRequest({ open: [] }, SHIPPED)).toEqual({ ok: true, open: [] })
  })

  it("refuses an unknown or unshipped id instead of pretending to open it", () => {
    expect(parseCapabilityRequest({ open: ["teleportation"] }, SHIPPED).ok).toBe(false)
    expect(parseCapabilityRequest({ open: ["swaps"] }, SHIPPED).ok).toBe(false)
    expect(parseCapabilityRequest({ open: ["sectors"] }).ok).toBe(false) // the real registry: not shipped yet
  })

  it("refuses a body without a list", () => {
    expect(parseCapabilityRequest(null, SHIPPED).ok).toBe(false)
    expect(parseCapabilityRequest({ open: [1] }, SHIPPED).ok).toBe(false)
  })
})

describe("storedOpenList", () => {
  it("keeps the ids this version cannot manage, so saving never closes what the screen does not show", () => {
    expect(storedOpenList([], { open: ["sectors", "future-thing", "swaps"] }, SHIPPED)).toEqual(["future-thing", "swaps"])
    expect(storedOpenList(["sectors"], null, SHIPPED)).toEqual(["sectors"])
  })
})

describe("capabilityChanges", () => {
  it("lists what is opened and closed, for the operator log", () => {
    expect(capabilityChanges([], ["sectors"])).toEqual({ opened: ["sectors"], closed: [] })
    expect(capabilityChanges(["sectors"], [])).toEqual({ opened: [], closed: ["sectors"] })
    expect(capabilityChanges(["sectors"], ["sectors"])).toEqual({ opened: [], closed: [] })
  })
})

describe("betaAdoptionAllowed", () => {
  it("allows an opted-in, active organisation to adopt an open capability", () => {
    expect(betaAdoptionAllowed(OPTED_IN, ["sectors"], "sectors", SHIPPED)).toBe(true)
  })

  it("BE01: refuses an organisation that does not take part", () => {
    expect(betaAdoptionAllowed(NOT_OPTED_IN, ["sectors"], "sectors", SHIPPED)).toBe(false)
  })

  it("refuses a capability the operator did not open, or closed (emergency stop)", () => {
    expect(betaAdoptionAllowed(OPTED_IN, [], "sectors", SHIPPED)).toBe(false)
  })

  it("refuses an unknown or unshipped capability even if stored as open", () => {
    expect(betaAdoptionAllowed(OPTED_IN, ["teleportation"], "teleportation", SHIPPED)).toBe(false)
    expect(betaAdoptionAllowed(OPTED_IN, ["swaps"], "swaps", SHIPPED)).toBe(false)
  })

  it("refuses a deactivated or suspended organisation, even opted in", () => {
    expect(betaAdoptionAllowed({ ...OPTED_IN, active: false }, ["sectors"], "sectors", SHIPPED)).toBe(false)
    expect(betaAdoptionAllowed({ ...OPTED_IN, suspendedAt: new Date() }, ["sectors"], "sectors", SHIPPED)).toBe(false)
    expect(betaAdoptionAllowed(null, ["sectors"], "sectors", SHIPPED)).toBe(false)
  })

  it("BE06: after an opt-out new adoptions are refused; the rule reads the state and changes nothing", () => {
    const org = { ...OPTED_IN }
    const open = ["sectors"]
    expect(betaAdoptionAllowed(org, open, "sectors", SHIPPED)).toBe(true)
    const left = { ...org, betaOptInAt: null }
    expect(betaAdoptionAllowed(left, open, "sectors", SHIPPED)).toBe(false)
    // Nothing deleted: the inputs are left as they were (the helper has no write side).
    expect(org.betaOptInAt).toEqual(OPTED_IN.betaOptInAt)
    expect(open).toEqual(["sectors"])
  })
})

describe("betaCardVisible", () => {
  it("BE01: hides the card when nothing is open and the organisation does not take part", () => {
    expect(betaCardVisible([], false)).toBe(false)
  })

  it("shows it while something is open, or while the organisation takes part so it can leave", () => {
    expect(betaCardVisible(["sectors"], false)).toBe(true)
    expect(betaCardVisible([], true)).toBe(true)
  })
})

describe("decideBetaOptIn", () => {
  it("joins when something is open", () => {
    expect(decideBetaOptIn(false, { optIn: true }, ["sectors"])).toEqual({ ok: true, change: "opt_in" })
  })

  it("refuses to join when nothing is open", () => {
    expect(decideBetaOptIn(false, { optIn: true }, [])).toEqual({ ok: false, status: 409, error: BETA_NOTHING_OPEN_ERROR })
  })

  it("always lets an organisation leave, even when everything was closed", () => {
    expect(decideBetaOptIn(true, { optIn: false }, [])).toEqual({ ok: true, change: "opt_out" })
  })

  it("changes nothing when the state is already the one asked for", () => {
    expect(decideBetaOptIn(true, { optIn: true }, [])).toEqual({ ok: true, change: null })
    expect(decideBetaOptIn(false, { optIn: false }, ["sectors"])).toEqual({ ok: true, change: null })
  })

  it("refuses a malformed request", () => {
    expect(decideBetaOptIn(false, {}, ["sectors"]).ok).toBe(false)
    expect(decideBetaOptIn(false, { optIn: "yes" }, ["sectors"]).ok).toBe(false)
    expect(decideBetaOptIn(false, null, ["sectors"]).ok).toBe(false)
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
