// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { BETA_EVENT, BETA_OPERATOR, BETA_OWNER, BETA_PERSON_EMAIL, betaToken, localToday, saturdayAfter } from "../../../scripts/seed-video-beta"
import { BETA_OPERATOR_EMAIL, BETA_OWNER_EMAIL } from "../record-beta-features"

const root = path.resolve(__dirname, "../../..")
const recorder = readFileSync(path.join(root, "videos/lib/record-beta-features.ts"), "utf8")
const seed = readFileSync(path.join(root, "scripts/seed-video-beta.ts"), "utf8")

describe("beta videos fixture (scripts/seed-video-beta.ts)", () => {
  test("the swaps event falls on a Saturday at least two weeks ahead, whatever the take's day", () => {
    for (const today of ["2026-10-28", "2026-10-31", "2026-11-01", "2026-12-26"]) {
      const saturday = saturdayAfter(today, 14)
      expect(new Date(`${saturday}T00:00:00Z`).getUTCDay()).toBe(6)
      const days = (Date.parse(saturday) - Date.parse(today)) / 86_400_000
      expect(days).toBeGreaterThanOrEqual(14)
      expect(days).toBeLessThan(21)
    }
  })

  test("today is read in Europe/Zurich, not in UTC", () => {
    expect(localToday(new Date("2026-10-28T23:30:00Z"))).toBe("2026-10-29")
    expect(localToday(new Date("2026-10-28T12:00:00Z"))).toBe("2026-10-28")
  })

  test("the recorder signs in with the seeded accounts and opens the seeded event and tokens", () => {
    expect(BETA_OWNER_EMAIL).toBe(BETA_OWNER.email)
    expect(BETA_OPERATOR_EMAIL).toBe(BETA_OPERATOR.email)
    expect(recorder).toContain(`const EVENT_ID = "${BETA_EVENT.id}"`)
    expect(betaToken("swaps", "lea")).toBe("demo-beta-swaps-lea-0001")
    expect(recorder).toContain("const token = (scenario: string, key: string) => `demo-beta-${scenario}-${key}-0001`")
  })

  test("people are cast members on example.org, never « Exemple »", () => {
    for (const address of [BETA_OWNER.email, BETA_OPERATOR.email, "video.beta.lea@example.org", "video.beta.paul@example.org"]) expect(address).toMatch(BETA_PERSON_EMAIL)
    expect(seed).not.toMatch(/Exemple/)
    expect(seed).toContain("surnameOf(firstName)")
  })

  test("the seed never touches the demo organisation", () => {
    expect(seed).not.toMatch(/organizationId: "default"|id: "default"/)
  })
})
