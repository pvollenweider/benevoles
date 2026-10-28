// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "vitest"
import { FIXTURE_SURNAMES, fullNameOf, isFixtureFullName, isFixtureSurname, ROSTER_SURNAMES, rosterSurname, surnameOf } from "../fixture-names"
import { normalizeFullName } from "../../../src/lib/member-duplicates"

const POOL = ["Martin", "Müller", "Smith", "Peeters", "De Jong", "Gruber", "García", "Rossi", "Silva", "Papadopoulos", "Nowak", "Ivanov", "Nováková", "Novák", "Tóth", "Popa", "Melnyk", "Johansson", "Jensen", "Hansen", "Korhonen", "Murphy"]

describe("video fixture cast", () => {
  test("every surname comes from the common-surname pool, none is the old placeholder", () => {
    for (const surname of [...Object.values(FIXTURE_SURNAMES), ...ROSTER_SURNAMES]) expect(POOL).toContain(surname)
    expect(Object.values(FIXTURE_SURNAMES)).not.toContain("Exemple")
  })

  test("each first name has its own surname, so two cast members never look related", () => {
    const surnames = Object.values(FIXTURE_SURNAMES)
    expect(new Set(surnames).size).toBe(surnames.length)
    expect(surnames.length).toBeGreaterThanOrEqual(10)
  })

  test("full names keep their accents and fold for accent-insensitive search", () => {
    expect(fullNameOf("Léa")).toBe("Léa Müller")
    expect(fullNameOf("Zoé")).toBe("Zoé Papadopoulos")
    expect(fullNameOf("Lou")).toBe("Lou Tóth")
    expect(normalizeFullName("Lea", "Muller")).toBe(normalizeFullName("Léa", "Müller"))
    expect(normalizeFullName("Samira", "Garcia")).toBe(normalizeFullName("Samira", surnameOf("Samira")))
  })

  test("an unknown first name fails loudly instead of inventing a surname", () => {
    expect(() => surnameOf("Inconnu")).toThrow(/No fixture surname/)
  })

  test("the legacy placeholder is accepted only where a reset guard asks for it", () => {
    expect(isFixtureSurname("Aline", "Martin")).toBe(true)
    expect(isFixtureSurname("Aline", "Exemple")).toBe(false)
    expect(isFixtureSurname("Aline", "Exemple", true)).toBe(true)
    expect(isFixtureSurname("Aline", "Müller", true)).toBe(false)
  })

  test("isFixtureFullName accepts only a cast full name", () => {
    expect(isFixtureFullName("Zoé Papadopoulos")).toBe(true)
    expect(isFixtureFullName("Zoé Exemple")).toBe(false)
    expect(isFixtureFullName("Zoé Martin")).toBe(false)
  })

  test("the 56 generated journal members have distinct full names", () => {
    const firstNames = ["Aline", "Nicolas", "Léa", "Camille", "Noah", "Sarah", "Emma", "Lucas"]
    const names = Array.from({ length: 56 }, (_, index) => `${firstNames[index % firstNames.length]} ${rosterSurname(index)}`)
    expect(new Set(names).size).toBe(56)
    expect(names[0]).toBe("Aline Martin")
    expect(ROSTER_SURNAMES).not.toContain("Ivanov")
    expect(ROSTER_SURNAMES).not.toContain("Nováková")
  })
})
