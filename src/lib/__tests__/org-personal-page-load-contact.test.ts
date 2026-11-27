// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

// The organisation page « Mes inscriptions » must send a volunteer who can no longer cancel online
// to the organisation, never to the platform's public contact address. Read from the source: the
// loader needs a database, and the mistake was one wrong call in it.
describe("the organisation page's contact for a closed cancellation", () => {
  const loader = fs.readFileSync(path.join(process.cwd(), "src/lib/org-personal-page-load.ts"), "utf-8")
  const link = fs.readFileSync(path.join(process.cwd(), "src/lib/org-link.ts"), "utf-8")

  it("is built from the organisation's reply address", () => {
    expect(loader).toContain("contactEmail: orgCancelContactEmail(target.organization.replyToEmail, process.env.EMAIL_REPLY_TO)")
    expect(loader).not.toMatch(/contactEmail: contactEmail\(\)/)
  })

  it("loads that address with the link's organisation", () => {
    expect(link).toMatch(/organization: \{ select: \{[^}]*replyToEmail: true/)
  })
})
