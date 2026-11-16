// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { hashCharterText, normalizeCharterText } from "@/lib/charter-hash"
import { buildVolunteerCharter, resolveCharterText } from "@/lib/volunteer-charter"

describe("charter-hash", () => {
  it("is stable: the same text always hashes the same way", () => {
    const text = buildVolunteerCharter({ hasOrgInsurance: true })
    expect(hashCharterText(text)).toBe(hashCharterText(text))
  })

  it("changes when the wording changes", () => {
    const withInsurance = buildVolunteerCharter({ hasOrgInsurance: true })
    const withoutInsurance = buildVolunteerCharter({ hasOrgInsurance: false })
    expect(hashCharterText(withInsurance)).not.toBe(hashCharterText(withoutInsurance))
  })

  it("tells apart a custom text from the default, for each insurance variant", () => {
    const custom = "Un texte personnalisé par l'organisation."
    const defaultWithInsurance = buildVolunteerCharter({ hasOrgInsurance: true })
    const defaultWithoutInsurance = buildVolunteerCharter({ hasOrgInsurance: false })
    const hashes = new Set([custom, defaultWithInsurance, defaultWithoutInsurance].map(hashCharterText))
    expect(hashes.size).toBe(3)
  })

  it("ignores incidental whitespace (line endings, surrounding blanks) but nothing else", () => {
    const base = "Texte  \r\nsur deux lignes."
    const same = "Texte  \nsur deux lignes.\n\n"
    const different = "Texte sur deux lignes." // an internal space removed: real wording change
    expect(hashCharterText(base)).toBe(hashCharterText(same))
    expect(hashCharterText(base)).not.toBe(hashCharterText(different))
  })

  it("normalizeCharterText trims and unifies line endings", () => {
    expect(normalizeCharterText("  a\r\nb  \n")).toBe("a\nb")
  })
})

describe("resolveCharterText", () => {
  it("falls back to the default for the organization's insurance choice when it has no custom charter", () => {
    expect(resolveCharterText(null, true)).toBe(buildVolunteerCharter({ hasOrgInsurance: true }))
    expect(resolveCharterText(undefined, true)).toBe(buildVolunteerCharter({ hasOrgInsurance: true }))
    expect(resolveCharterText(null, false)).toBe(buildVolunteerCharter({ hasOrgInsurance: false }))
  })

  // Regression: resolveCharterText(null) used to hash the « with insurance » default even for an
  // organization whose switch was off, so the proof named a text the volunteer was never meant to see.
  it("hashes differently with the switch off than on, for an organization without custom text", () => {
    expect(hashCharterText(resolveCharterText(null, false))).not.toBe(hashCharterText(resolveCharterText(null, true)))
  })

  it("uses the organization's own text otherwise, whatever the switch", () => {
    expect(resolveCharterText("Mon texte", true)).toBe("Mon texte")
    expect(resolveCharterText("Mon texte", false)).toBe("Mon texte")
  })
})
