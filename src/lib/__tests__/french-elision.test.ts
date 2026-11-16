// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { de, elidesBefore, que } from "../french-elision"

describe("French elision before a first name", () => {
  it("elides before a vowel, accented ones included", () => {
    expect(que("Aline")).toBe("qu'Aline")
    expect(de("Emma")).toBe("d'Emma")
    expect(de("Élodie")).toBe("d'Élodie")
    expect(que("Îlona")).toBe("qu'Îlona")
    expect(de("Œlia")).toBe("d'Œlia")
  })

  it("keeps the full word before a consonant, an h or a y", () => {
    expect(que("Lucas")).toBe("que Lucas")
    expect(de("Lucas")).toBe("de Lucas")
    expect(de("Hugo")).toBe("de Hugo")
    expect(que("Yann")).toBe("que Yann")
    expect(elidesBefore("Noah")).toBe(false)
  })

  it("trims the name and works on a full name", () => {
    expect(de("  Emma Johansson ")).toBe("d'Emma Johansson")
    expect(que("cette personne")).toBe("que cette personne")
  })
})
