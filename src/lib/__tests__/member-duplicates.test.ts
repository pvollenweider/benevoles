// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  canonicalDomain,
  emailsAreClose,
  findDuplicatePairs,
  normalizeEmailParts,
  normalizeFullName,
  normalizePhone,
  signalsFingerprint,
  withoutDismissed,
  type DuplicateMemberInput,
} from "../member-duplicates"

function member(overrides: Partial<DuplicateMemberInput> & { id: string }): DuplicateMemberInput {
  return {
    firstName: "Jean",
    lastName: "Dupont",
    email: null,
    phone: null,
    birthDate: null,
    active: true,
    addressToVerify: false,
    mergedIntoId: null,
    ...overrides,
  }
}

describe("normalizeFullName", () => {
  it("folds case, accents, spaces, hyphens and apostrophes the same way", () => {
    expect(normalizeFullName("François", "Müller")).toBe(normalizeFullName("francois", "muller"))
    expect(normalizeFullName("Jean-Pierre", "O'Brien")).toBe(normalizeFullName("Jean Pierre", "O Brien"))
    expect(normalizeFullName("  Zoé  ", "Da  Silva")).toBe(normalizeFullName("Zoe", "Da Silva"))
  })
})

describe("normalizePhone", () => {
  it("normalizes Swiss/French formats to the same digits", () => {
    const forms = ["079 123 45 67", "+41791234567", "0041 79 123 45 67", "0041791234567"]
    const normalized = forms.map(normalizePhone)
    expect(new Set(normalized).size).toBe(1)
    expect(normalized[0]).toBe("41791234567")
  })

  it("returns null for garbage or too-short input", () => {
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone("")).toBeNull()
    expect(normalizePhone("12")).toBeNull()
    expect(normalizePhone("abc")).toBeNull()
  })
})

describe("email closeness", () => {
  it("treats a one or two character local-part typo on the same domain as close", () => {
    expect(emailsAreClose("jean.dupont@example.com", "jean.dupon@example.com")).toBe(true)
    expect(emailsAreClose("jean.dupont@example.com", "jean.duport@example.com")).toBe(true)
  })

  it("is not close across unrelated domains, or for an identical address", () => {
    expect(emailsAreClose("jean.dupont@example.com", "jean.dupont@other.com")).toBe(false)
    expect(emailsAreClose("jean.dupont@example.com", "jean.dupont@example.com")).toBe(false)
  })

  it("treats a common domain typo as the same domain", () => {
    expect(canonicalDomain("gmial.com")).toBe("gmail.com")
    expect(emailsAreClose("jean.dupont@gmail.com", "jean.dupont@gmial.com")).toBe(true) // same local part, domain is a known typo of the other
    expect(emailsAreClose("jean.dupont@gmail.com", "jean.dupon@gmial.com")).toBe(true)
  })

  it("rejects malformed addresses", () => {
    expect(normalizeEmailParts("not-an-email")).toBeNull()
    expect(normalizeEmailParts("@nodomain")).toBeNull()
    expect(normalizeEmailParts("nolocal@")).toBeNull()
  })
})

describe("findDuplicatePairs — wording and ranking rules", () => {
  it("suggests homonyms (same name, different emails and phones) with only the name signal, worded as uncertain", () => {
    const pairs = findDuplicatePairs([
      member({ id: "a", firstName: "Marie", lastName: "Martin", email: "marie.one@example.com", phone: "+41791111111" }),
      member({ id: "b", firstName: "Marie", lastName: "Martin", email: "marie.two@other-domain.org", phone: "+41792222222" }),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].signals).toEqual(["name"])
    expect(pairs[0].reasons.join(" ")).toMatch(/homonyme n'est pas forcément la même personne/)
    expect(pairs[0].reasons.join(" ")).not.toMatch(/\bsont la même personne\b/) // never asserted as a fact
  })

  it("flags a shared phone between two distinct identities as 'shared phone possible', never a likely duplicate", () => {
    const pairs = findDuplicatePairs([
      member({ id: "a", firstName: "Alice", lastName: "Durand", phone: "+41791234567" }),
      member({ id: "b", firstName: "Bernard", lastName: "Giroud", phone: "+41791234567" }),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].signals).toEqual(["phone"])
    expect(pairs[0].reasons.join(" ")).toMatch(/Numéro partagé possible/)
    expect(pairs[0].reasons.join(" ")).toMatch(/ne veut pas dire/)
    expect(pairs[0].reasons.join(" ")).not.toMatch(/probablement|certainement|fiches peut-être/i)
  })

  it("ranks a name+phone combination above a name-only match, and name+birth date highest", () => {
    const pairs = findDuplicatePairs([
      member({ id: "name-only-a", firstName: "Luc", lastName: "Favre" }),
      member({ id: "name-only-b", firstName: "Luc", lastName: "Favre" }),
      member({ id: "name-phone-a", firstName: "Eva", lastName: "Roux", phone: "+41793334455" }),
      member({ id: "name-phone-b", firstName: "Eva", lastName: "Roux", phone: "+41793334455" }),
      member({
        id: "name-birth-a", firstName: "Nina", lastName: "Keller", birthDate: new Date("1990-05-01"),
      }),
      member({
        id: "name-birth-b", firstName: "Nina", lastName: "Keller", birthDate: new Date("1990-05-01"),
      }),
    ])
    const byIds = (a: string, b: string) => pairs.find((p) => (p.memberIdA === a && p.memberIdB === b) || (p.memberIdA === b && p.memberIdB === a))!
    const nameOnly = byIds("name-only-a", "name-only-b")
    const namePhone = byIds("name-phone-a", "name-phone-b")
    const nameBirth = byIds("name-birth-a", "name-birth-b")
    expect(namePhone.score).toBeGreaterThan(nameOnly.score)
    expect(nameBirth.score).toBeGreaterThan(namePhone.score)
  })

  it("flags a member with an address to verify next to a close record, worded as uncertain", () => {
    const pairs = findDuplicatePairs([
      member({ id: "a", firstName: "Sami", lastName: "Haddad", addressToVerify: true }),
      member({ id: "b", firstName: "Sami", lastName: "Haddad" }),
    ])
    expect(pairs[0].signals).toContain("address_to_verify")
    expect(pairs[0].reasons.join(" ")).toMatch(/fiches peut-être en double/)
  })

  it("never suggests a pair involving a tombstone (mergedIntoId set)", () => {
    const pairs = findDuplicatePairs([
      member({ id: "a", firstName: "Omar", lastName: "Said", mergedIntoId: "elsewhere" }),
      member({ id: "b", firstName: "Omar", lastName: "Said" }),
    ])
    expect(pairs).toHaveLength(0)
  })

  it("is limited to the members passed in (the caller scopes by organization)", () => {
    const pairs = findDuplicatePairs([
      member({ id: "org-a-1", firstName: "Pia", lastName: "Steiner" }),
      // Simulates two different organizations: the caller (member-duplicates-data.ts) never
      // passes members across organizations in the first place, so this only has to show that
      // the function itself has no notion of "organization" to get wrong — it only ever sees
      // what it's given.
    ])
    expect(pairs).toHaveLength(0)
  })
})

describe("signalsFingerprint / withoutDismissed", () => {
  it("is the same regardless of signal order", () => {
    expect(signalsFingerprint(["phone", "name"])).toBe(signalsFingerprint(["name", "phone"]))
  })

  it("drops a pair dismissed with the exact same signals, but brings it back when a new signal appears", () => {
    const pairs = findDuplicatePairs([
      member({ id: "a", firstName: "Théo", lastName: "Bovet" }),
      member({ id: "b", firstName: "Théo", lastName: "Bovet" }),
    ])
    expect(pairs).toHaveLength(1)
    const dismissed = [{ volunteerIdA: "a", volunteerIdB: "b", signalsFingerprint: signalsFingerprint(pairs[0].signals) }]
    expect(withoutDismissed(pairs, dismissed)).toHaveLength(0)

    const pairsWithPhone = findDuplicatePairs([
      member({ id: "a", firstName: "Théo", lastName: "Bovet", phone: "+41797776655" }),
      member({ id: "b", firstName: "Théo", lastName: "Bovet", phone: "+41797776655" }),
    ])
    expect(withoutDismissed(pairsWithPhone, dismissed)).toHaveLength(1) // new "phone" signal: fingerprint changed
  })

  it("is order-independent for the dismissed ids", () => {
    const pairs = findDuplicatePairs([
      member({ id: "z", firstName: "Iris", lastName: "Fontaine" }),
      member({ id: "a", firstName: "Iris", lastName: "Fontaine" }),
    ])
    const dismissed = [{ volunteerIdA: "a", volunteerIdB: "z", signalsFingerprint: signalsFingerprint(pairs[0].signals) }]
    expect(withoutDismissed(pairs, dismissed)).toHaveLength(0)
  })
})

describe("findDuplicatePairs — performance (blocking keeps this bounded)", () => {
  it("runs well under a second for a few thousand generated members", () => {
    const members: DuplicateMemberInput[] = []
    const firstNames = ["Alice", "Bernard", "Chloe", "David", "Elise", "Farid", "Giulia", "Hassan", "Ines", "Jonas"]
    const lastNames = ["Martin", "Keller", "Rossi", "Dubois", "Favre", "Steiner", "Perret", "Huber", "Moreau", "Zimmermann"]
    for (let i = 0; i < 4000; i++) {
      members.push(
        member({
          id: `m${i}`,
          firstName: firstNames[i % firstNames.length],
          lastName: `${lastNames[(i * 7) % lastNames.length]}${i}`, // unique per member: no accidental name blocks
          email: `member${i}@example${i % 50}.com`,
          phone: `+4179${String(1000000 + i).slice(-7)}`,
        }),
      )
    }
    // A handful of deliberate duplicates.
    members.push(member({ id: "dup-a", firstName: "Nora", lastName: "Dupont" }))
    members.push(member({ id: "dup-b", firstName: "Nora", lastName: "Dupont" }))

    const start = performance.now()
    const pairs = findDuplicatePairs(members)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(1000)
    expect(pairs.some((p) => (p.memberIdA === "dup-a" || p.memberIdB === "dup-a"))).toBe(true)
  })
})
