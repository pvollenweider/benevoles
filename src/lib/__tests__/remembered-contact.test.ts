// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { contactToRemember, parseRememberedContact } from "../remembered-contact"

const form = { firstName: " Aline ", lastName: "Exemple", email: "aline@example.org", phone: "079 000 00 00", birthDate: "2000-01-01", comment: "secret" }

describe("contactToRemember", () => {
  it("keeps only the four contact fields, trimmed", () => {
    expect(contactToRemember(form)).toEqual({ firstName: "Aline", lastName: "Exemple", email: "aline@example.org", phone: "079 000 00 00" })
  })

  it("remembers nothing without names or email", () => {
    expect(contactToRemember({ ...form, email: " " })).toBeNull()
    expect(contactToRemember({ ...form, lastName: "" })).toBeNull()
  })

  it("keeps an empty phone", () => {
    expect(contactToRemember({ ...form, phone: "" })?.phone).toBe("")
  })
})

describe("parseRememberedContact", () => {
  it("reads back what was stored", () => {
    const stored = JSON.stringify(contactToRemember(form))
    expect(parseRememberedContact(stored)).toEqual(contactToRemember(form))
  })

  it("ignores missing, malformed or incomplete values", () => {
    expect(parseRememberedContact(null)).toBeNull()
    expect(parseRememberedContact("{")).toBeNull()
    expect(parseRememberedContact("42")).toBeNull()
    expect(parseRememberedContact(JSON.stringify({ firstName: "Aline", email: "aline@example.org" }))).toBeNull()
  })

  it("drops non-string fields and caps lengths", () => {
    const parsed = parseRememberedContact(JSON.stringify({ firstName: "A".repeat(300), lastName: "B", email: "c@example.org", phone: 42 }))
    expect(parsed?.firstName).toHaveLength(100)
    expect(parsed?.phone).toBe("")
  })
})
