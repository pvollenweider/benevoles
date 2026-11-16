// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  buildVolunteerCharter,
  charterStatusLabel,
  charterTextAfterToggle,
  DEFAULT_VOLUNTEER_CHARTER,
  INSURANCE_CLAUSE_WITH_ORG_RC,
  INSURANCE_CLAUSE_WITHOUT_ORG_RC,
  isCustomizedCharter,
  LEGACY_DEFAULT_CHARTERS,
  LEGACY_INSURANCE_CLAUSE_WITH_ORG_RC,
  LEGACY_INSURANCE_CLAUSE_WITHOUT_ORG_RC,
  matchDefaultCharter,
  planInsuranceParagraphUpdate,
  resolveCharterText,
} from "@/lib/volunteer-charter"

const WITH = buildVolunteerCharter({ hasOrgInsurance: true })
const WITHOUT = buildVolunteerCharter({ hasOrgInsurance: false })
const LAA_BULLET = "- À disposer d'une couverture accidents personnelle adéquate (LAA ou assurance équivalente)."

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

// The product lets a volunteer withdraw at any time and notifies organizers (#559), so the
// charter's "48 hours' notice" clause no longer matches the product (#569, owner decision
// 2026-10-05): it now asks for a warning "as soon as possible" instead.
describe("buildVolunteerCharter", () => {
  it("no longer asks for 48 hours' notice", () => {
    expect(DEFAULT_VOLUNTEER_CHARTER).not.toContain("48 heures")
  })

  it("asks to warn as soon as possible instead", () => {
    expect(DEFAULT_VOLUNTEER_CHARTER).toContain("dès que possible en cas de désistement")
  })

  // The accident bullet is the same whatever the switch: an RC policy never covers the
  // volunteer's own accidents.
  it("asks for personal accident cover exactly once in both versions, as the last bullet of section 1", () => {
    for (const text of [WITH, WITHOUT]) {
      expect(occurrences(text, LAA_BULLET)).toBe(1)
      expect(text).toContain(`selon ses disponibilités,\n${LAA_BULLET}\n\n2. En outre`)
      expect(text).not.toContain("À s'assurer d'une couverture accidents")
    }
  })

  it("ends with the paragraph matching the switch", () => {
    expect(WITH.endsWith(INSURANCE_CLAUSE_WITH_ORG_RC)).toBe(true)
    expect(WITHOUT.endsWith(INSURANCE_CLAUSE_WITHOUT_ORG_RC)).toBe(true)
    expect(WITH).not.toContain(INSURANCE_CLAUSE_WITHOUT_ORG_RC)
    expect(WITHOUT).not.toContain(INSURANCE_CLAUSE_WITH_ORG_RC)
  })

  it("uses the owner-approved wording", () => {
    expect(INSURANCE_CLAUSE_WITH_ORG_RC).toBe("L'organisation dispose d'une assurance responsabilité civile qui couvre les dommages causés à des tiers pendant les activités bénévoles. Les accidents dont la personne bénévole serait elle-même victime relèvent de sa propre assurance accidents.")
    expect(INSURANCE_CLAUSE_WITHOUT_ORG_RC).toBe("L'organisation ne fournit pas d'assurance responsabilité civile pour ces activités : la personne bénévole répond elle-même auprès des tiers des dommages qu'elle causerait, et vérifie que son assurance RC privée la couvre.")
  })

  // Regression: the « with insurance » version said the RC covered the volunteer.
  it("never says the volunteer is covered by the organization's RC", () => {
    expect(WITH).not.toContain("sera couverte")
    expect(WITHOUT).not.toContain("sera couverte")
  })
})

describe("resolveCharterText", () => {
  it("is the default for the insurance choice when the organization never customized it", () => {
    expect(resolveCharterText(null, true)).toBe(DEFAULT_VOLUNTEER_CHARTER)
    expect(resolveCharterText(null, false)).toBe(WITHOUT)
  })

  // Regression: the switch off still showed (and hashed) the « with insurance » default.
  it("follows the switch when it is off", () => {
    expect(resolveCharterText(undefined, false)).toContain(INSURANCE_CLAUSE_WITHOUT_ORG_RC)
    expect(resolveCharterText(undefined, false)).not.toContain(INSURANCE_CLAUSE_WITH_ORG_RC)
  })

  it("is the organization's own text otherwise, a saved old default included (never rewritten)", () => {
    expect(resolveCharterText("Notre convention à nous", false)).toBe("Notre convention à nous")
    expect(resolveCharterText(LEGACY_DEFAULT_CHARTERS.withOrgInsurance, false)).toBe(LEGACY_DEFAULT_CHARTERS.withOrgInsurance)
  })
})

describe("matchDefaultCharter", () => {
  it("recognises both current defaults", () => {
    expect(matchDefaultCharter(WITH)).toEqual({ hasOrgInsurance: true, legacy: false })
    expect(matchDefaultCharter(WITHOUT)).toEqual({ hasOrgInsurance: false, legacy: false })
  })

  // Organisations that saved the old default without editing it are not « customised ».
  it("recognises the old default texts, verbatim as they were before the fix", () => {
    expect(LEGACY_DEFAULT_CHARTERS.withOrgInsurance).toContain(LEGACY_INSURANCE_CLAUSE_WITH_ORG_RC)
    expect(LEGACY_DEFAULT_CHARTERS.withOrgInsurance).toContain("- À s'assurer d'une couverture accidents personnelle adéquate (LAA).")
    expect(LEGACY_DEFAULT_CHARTERS.withoutOrgInsurance).toContain(LEGACY_INSURANCE_CLAUSE_WITHOUT_ORG_RC)
    expect(matchDefaultCharter(LEGACY_DEFAULT_CHARTERS.withOrgInsurance)).toEqual({ hasOrgInsurance: true, legacy: true })
    expect(matchDefaultCharter(LEGACY_DEFAULT_CHARTERS.withoutOrgInsurance)).toEqual({ hasOrgInsurance: false, legacy: true })
  })

  it("ignores line endings and surrounding blanks, but not a wording change", () => {
    expect(matchDefaultCharter(`\n${WITH.replace(/\n/g, "\r\n")}  \n`)).toEqual({ hasOrgInsurance: true, legacy: false })
    expect(matchDefaultCharter(WITH.replace("bienveillant", "chaleureux"))).toBeNull()
  })

  it("isCustomizedCharter is true only for a text that is none of the defaults", () => {
    expect(isCustomizedCharter(WITH)).toBe(false)
    expect(isCustomizedCharter(LEGACY_DEFAULT_CHARTERS.withoutOrgInsurance)).toBe(false)
    expect(isCustomizedCharter("Notre charte")).toBe(true)
  })
})

describe("charterTextAfterToggle", () => {
  it("switches a default text to the other default", () => {
    expect(charterTextAfterToggle(WITH, false)).toEqual({ text: WITHOUT, kept: false })
    expect(charterTextAfterToggle(WITHOUT, true)).toEqual({ text: WITH, kept: false })
  })

  it("gives an old default the current wording", () => {
    expect(charterTextAfterToggle(LEGACY_DEFAULT_CHARTERS.withOrgInsurance, false)).toEqual({ text: WITHOUT, kept: false })
    expect(charterTextAfterToggle(LEGACY_DEFAULT_CHARTERS.withoutOrgInsurance, true)).toEqual({ text: WITH, kept: false })
  })

  // Regression: toggling replaced a customised text with the default, losing unsaved edits.
  it("keeps a customised text untouched", () => {
    const custom = WITH.replace("bienveillant", "chaleureux")
    expect(charterTextAfterToggle(custom, false)).toEqual({ text: custom, kept: true })
    expect(charterTextAfterToggle("Notre charte", true)).toEqual({ text: "Notre charte", kept: true })
  })
})

describe("planInsuranceParagraphUpdate", () => {
  it("replaces just the current paragraph of the other version", () => {
    const custom = WITH.replace("bienveillant", "chaleureux")
    const plan = planInsuranceParagraphUpdate(custom, false)
    expect(plan).toEqual({
      kind: "replace",
      removed: INSURANCE_CLAUSE_WITH_ORG_RC,
      added: INSURANCE_CLAUSE_WITHOUT_ORG_RC,
      text: WITHOUT.replace("bienveillant", "chaleureux"),
    })
  })

  it("replaces an old paragraph of either version, even with the same switch position", () => {
    const custom = `Notre charte.\n\n${LEGACY_INSURANCE_CLAUSE_WITH_ORG_RC}\n\nMerci !`
    expect(planInsuranceParagraphUpdate(custom, true)).toMatchObject({ kind: "replace", removed: LEGACY_INSURANCE_CLAUSE_WITH_ORG_RC, text: `Notre charte.\n\n${INSURANCE_CLAUSE_WITH_ORG_RC}\n\nMerci !` })
    const old = `Notre charte.\n\n${LEGACY_INSURANCE_CLAUSE_WITHOUT_ORG_RC}`
    expect(planInsuranceParagraphUpdate(old, true)).toMatchObject({ kind: "replace", removed: LEGACY_INSURANCE_CLAUSE_WITHOUT_ORG_RC, text: `Notre charte.\n\n${INSURANCE_CLAUSE_WITH_ORG_RC}` })
  })

  it("appends the paragraph at the end when the text has none", () => {
    expect(planInsuranceParagraphUpdate("Notre charte.\n\n", true)).toEqual({
      kind: "append",
      added: INSURANCE_CLAUSE_WITH_ORG_RC,
      text: `Notre charte.\n\n${INSURANCE_CLAUSE_WITH_ORG_RC}`,
    })
    expect(planInsuranceParagraphUpdate("", false)).toMatchObject({ kind: "append", text: INSURANCE_CLAUSE_WITHOUT_ORG_RC })
  })

  it("has nothing to do when the right paragraph is already there", () => {
    expect(planInsuranceParagraphUpdate(`Notre charte.\n\n${INSURANCE_CLAUSE_WITHOUT_ORG_RC}`, false)).toEqual({ kind: "unchanged" })
  })
})

// An organization without its own text still shows the default charter to volunteers, so the
// read-only settings summary must not say « aucune ».
describe("charterStatusLabel", () => {
  it("reports the default charter when none was customized", () => {
    expect(charterStatusLabel(null)).toBe("par défaut")
    expect(charterStatusLabel(undefined)).toBe("par défaut")
  })

  it("reports a custom charter", () => {
    expect(charterStatusLabel("Notre charte")).toBe("personnalisée")
  })
})
