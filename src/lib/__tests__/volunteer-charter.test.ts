// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { buildVolunteerCharter, DEFAULT_VOLUNTEER_CHARTER, resolveCharterText } from "@/lib/volunteer-charter"

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

  it("keeps the insurance variant working either way", () => {
    expect(buildVolunteerCharter({ hasOrgInsurance: true })).toContain("assurance responsabilité civile de l'organisation")
    expect(buildVolunteerCharter({ hasOrgInsurance: false })).toContain("couverture accidents")
  })
})

describe("resolveCharterText", () => {
  it("is the default when the organization never customized it", () => {
    expect(resolveCharterText(null)).toBe(DEFAULT_VOLUNTEER_CHARTER)
  })

  it("is the organization's own text otherwise", () => {
    expect(resolveCharterText("Notre convention à nous")).toBe("Notre convention à nous")
  })
})
