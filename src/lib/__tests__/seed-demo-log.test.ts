// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { REGISTRATION_STATUS_LOG_LABELS } from "../log-value-labels"

/**
 * The demo seed writes the event journal by hand (scripts/seed-demo.ts). A registration status it
 * invents (« present ») showed in the journal as « statut : confirmée → present », in English: a
 * check-in is `Registration.checkedInAt`, logged as `checkedInAt`, never a status.
 */
describe("demo seed journal", () => {
  const source = readFileSync(join(process.cwd(), "scripts/seed-demo.ts"), "utf-8")
  const registrationEntries = source.split("\n").filter((l) => l.includes('entityType: "Registration"'))

  it("only logs registration statuses that exist", () => {
    expect(registrationEntries.length).toBeGreaterThan(0)
    for (const line of registrationEntries) {
      for (const [, from, to] of line.matchAll(/status: \{ from: "([^"]+)", to: "([^"]+)" \}/g)) {
        expect(Object.keys(REGISTRATION_STATUS_LOG_LABELS)).toContain(from)
        expect(Object.keys(REGISTRATION_STATUS_LOG_LABELS)).toContain(to)
      }
    }
  })

  it("logs a check-in as the app does, with checkedInAt", () => {
    const checkIn = registrationEntries.find((l) => l.includes('"registration.checked_in"'))
    expect(checkIn).toMatch(/checkedInAt: \{ from: null, to: /)
    expect(checkIn).not.toMatch(/status:/)
  })
})
