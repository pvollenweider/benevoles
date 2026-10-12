// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { randomInt } from "node:crypto"
import {
  GROUP_CODE_ALPHABET,
  GROUP_CODE_LENGTH,
  attributionCode,
  cleanRoleNames,
  generateGroupCode,
  groupFilterLine,
  groupFilterNotice,
  groupLinkStats,
  groupLinkStatsText,
  groupLinkUrl,
  groupQrFileStem,
  groupToggleAnnouncement,
  matchesGroupFilter,
  sameGroupName,
  missingRoles,
  parseGroupCode,
  removeRoleFromLink,
  renameRoleInLink,
  resolveGroupFilter,
  shiftsForGroup,
} from "@/lib/group-links"

const link = { code: "abcd2345", name: "Amicale des pompiers", roleNames: ["Bar", "Parking"], hideFull: false }

describe("generateGroupCode (#947)", () => {
  it("draws every character from the alphabet, at the fixed length", () => {
    const code = generateGroupCode(randomInt)
    expect(code).toHaveLength(GROUP_CODE_LENGTH)
    expect([...code].every((c) => GROUP_CODE_ALPHABET.includes(c))).toBe(true)
  })

  it("leaves out the characters a poster reader confuses", () => {
    expect(GROUP_CODE_ALPHABET).not.toMatch(/[0o1li]/)
  })

  it("is random, not sequential: two codes in a row differ", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateGroupCode(randomInt)))
    expect(codes.size).toBe(200)
  })

  it("uses the random source it is given", () => {
    expect(generateGroupCode(() => 0)).toBe("a".repeat(GROUP_CODE_LENGTH))
  })

  it("a generated code is accepted by the parser", () => {
    const code = generateGroupCode(randomInt)
    expect(parseGroupCode(code)).toBe(code)
  })
})

describe("parseGroupCode", () => {
  it("accepts a code, case and spaces aside", () => {
    expect(parseGroupCode(" ABCD2345 ")).toBe("abcd2345")
  })
  it("takes the first of repeated parameters", () => {
    expect(parseGroupCode(["abcd2345", "zzzz2222"])).toBe("abcd2345")
  })
  it("refuses what can't be a code (nothing is looked up then)", () => {
    expect(parseGroupCode(undefined)).toBeNull()
    expect(parseGroupCode("")).toBeNull()
    expect(parseGroupCode("abc")).toBeNull()
    expect(parseGroupCode("abcd234o")).toBeNull() // « o » is not in the alphabet
    expect(parseGroupCode("abcd2345x")).toBeNull()
  })
})

describe("groupLinkUrl", () => {
  it("adds the code to an organisation subdomain URL", () => {
    expect(groupLinkUrl("https://club.benevol.app/fete", "abcd2345")).toBe("https://club.benevol.app/fete?groupe=abcd2345")
  })
  it("keeps the local ?org= parameter", () => {
    expect(groupLinkUrl("http://localhost:3000/fete?org=club", "abcd2345")).toBe("http://localhost:3000/fete?org=club&groupe=abcd2345")
  })
})

describe("resolveGroupFilter: unknown code, deleted role, renamed role", () => {
  it("no parameter: the whole event", () => {
    expect(resolveGroupFilter(null, null, ["Bar"])).toEqual({ kind: "none" })
  })

  it("unknown code (or malformed, passed as \"\"): the whole event, with a notice", () => {
    expect(resolveGroupFilter("zzzz2222", null, ["Bar"])).toEqual({ kind: "unknown" })
    expect(resolveGroupFilter("", null, ["Bar"])).toEqual({ kind: "unknown" })
    expect(groupFilterNotice({ kind: "unknown" })).toMatch(/n'existe plus : tous les postes/)
  })

  it("a link whose code differs from the one asked is not used", () => {
    expect(resolveGroupFilter("zzzz2222", link, ["Bar"])).toEqual({ kind: "unknown" })
  })

  it("filters on the link's roles still on the planning", () => {
    expect(resolveGroupFilter("abcd2345", link, ["Accueil", "Bar", "Parking"])).toEqual({
      kind: "filtered", code: "abcd2345", name: "Amicale des pompiers", roleNames: ["Bar", "Parking"], hideFull: false,
    })
  })

  it("a deleted role is dropped, the others stay", () => {
    const f = resolveGroupFilter("abcd2345", link, ["Accueil", "Bar"])
    expect(f).toMatchObject({ kind: "filtered", roleNames: ["Bar"] })
  })

  it("a renamed role carried into the link keeps showing (the rename route updates the link)", () => {
    const renamed = { ...link, roleNames: renameRoleInLink(link.roleNames, "Bar", "Buvette") }
    expect(resolveGroupFilter("abcd2345", renamed, ["Buvette", "Parking"])).toMatchObject({ roleNames: ["Buvette", "Parking"] })
  })

  it("no role left: the whole event with a short notice naming the link", () => {
    const f = resolveGroupFilter("abcd2345", link, ["Accueil"])
    expect(f).toEqual({ kind: "empty", code: "abcd2345", name: "Amicale des pompiers" })
    expect(groupFilterNotice(f)).toBe("Les postes du lien « Amicale des pompiers » ne sont plus au planning : tous les postes de l'événement sont affichés.")
  })

  it("no notice when the filter applies or when there is no parameter", () => {
    expect(groupFilterNotice({ kind: "none" })).toBeNull()
    expect(groupFilterNotice(resolveGroupFilter("abcd2345", link, ["Bar"]))).toBeNull()
  })
})

describe("attributionCode: which sign-ups count for a link", () => {
  it("a link that exists counts, even with none of its roles left", () => {
    expect(attributionCode(resolveGroupFilter("abcd2345", link, ["Bar"]))).toBe("abcd2345")
    expect(attributionCode(resolveGroupFilter("abcd2345", link, []))).toBe("abcd2345")
  })
  it("no parameter or an unknown code: no attribution", () => {
    expect(attributionCode({ kind: "none" })).toBeNull()
    expect(attributionCode({ kind: "unknown" })).toBeNull()
  })
})

describe("renameRoleInLink / removeRoleFromLink / cleanRoleNames", () => {
  it("renames in place, without duplicating", () => {
    expect(renameRoleInLink(["Bar", "Parking"], "Bar", "Buvette")).toEqual(["Buvette", "Parking"])
    expect(renameRoleInLink(["Bar", "Parking"], "Bar", "Parking")).toEqual(["Parking"])
    expect(renameRoleInLink(["Accueil"], "Bar", "Buvette")).toEqual(["Accueil"])
  })
  it("removes a deleted role and keeps the others", () => {
    expect(removeRoleFromLink(["Bar", "Parking"], "Bar")).toEqual(["Parking"])
  })
  it("cleans the ticked roles", () => {
    expect(cleanRoleNames([" Bar ", "Bar", "", "Parking"])).toEqual(["Bar", "Parking"])
  })
  it("missingRoles lists the roles no longer on the planning", () => {
    expect(missingRoles(["Bar", "Parking"], ["Bar"])).toEqual(["Parking"])
  })
})

describe("shiftsForGroup", () => {
  const shifts = [
    { id: "s1", roleName: "Bar", status: "open" },
    { id: "s2", roleName: "Bar", status: "full" },
    { id: "s3", roleName: "Accueil", status: "open" },
    { id: "s4", roleName: "Parking", status: "open" },
  ]
  it("shows only the link's roles", () => {
    const f = resolveGroupFilter("abcd2345", link, ["Bar", "Accueil", "Parking"])
    expect(shiftsForGroup(shifts, f).map((s) => s.id)).toEqual(["s1", "s2", "s4"])
  })
  it("hides full shifts when the link asks for it", () => {
    const f = resolveGroupFilter("abcd2345", { ...link, hideFull: true }, ["Bar", "Accueil", "Parking"])
    expect(shiftsForGroup(shifts, f).map((s) => s.id)).toEqual(["s1", "s4"])
  })
  it("always keeps the visitor's own shifts, of another role or full", () => {
    const f = resolveGroupFilter("abcd2345", { ...link, hideFull: true }, ["Bar", "Accueil", "Parking"])
    expect(shiftsForGroup(shifts, f, new Set(["s2", "s3"])).map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4"])
  })
  it("no filter, unknown or empty link: every shift", () => {
    expect(shiftsForGroup(shifts, { kind: "none" })).toHaveLength(4)
    expect(shiftsForGroup(shifts, { kind: "unknown" })).toHaveLength(4)
    expect(shiftsForGroup(shifts, { kind: "empty", code: "abcd2345", name: "X" })).toHaveLength(4)
  })
})

describe("texts", () => {
  it("says which group the page is for", () => {
    expect(groupFilterLine("Amicale des pompiers", 2)).toBe("Lien « Amicale des pompiers » : seuls ses 2 postes sont affichés.")
    expect(groupFilterLine("Fanfare", 1)).toBe("Lien « Fanfare » : seul son poste est affiché.")
  })
  it("announces the toggle", () => {
    expect(groupToggleAnnouncement(true, "Fanfare")).toBe("Tous les postes de l'événement sont affichés.")
    expect(groupToggleAnnouncement(false, "Fanfare")).toBe("Seuls les postes du lien « Fanfare » sont affichés.")
  })
  it("QR file names are slugs of the event and the link", () => {
    expect(groupQrFileStem("fete-du-village", "Amicale des pompiers")).toBe("fete-du-village-amicale-des-pompiers-qr")
    expect(groupQrFileStem("fete", "Gym’ Club Écureuils !")).toBe("fete-gym-club-ecureuils-qr")
    expect(groupQrFileStem("fete", "!!!")).toBe("fete-qr")
  })
})

describe("sameGroupName", () => {
  it("compares names without case, accents or outer spaces", () => {
    expect(sameGroupName(" Fanfare l'Écho ", "fanfare l'echo")).toBe(true)
    expect(sameGroupName("Fanfare", "Fanfare 2")).toBe(false)
  })
})

describe("attribution counts (groupLinkStats)", () => {
  it("counts registrations and distinct people per link, ignoring the main link", () => {
    const stats = groupLinkStats([
      { groupLinkId: "l1", volunteerId: "v1" },
      { groupLinkId: "l1", volunteerId: "v1" },
      { groupLinkId: "l1", volunteerId: "v2" },
      { groupLinkId: "l2", volunteerId: "v3" },
      { groupLinkId: null, volunteerId: "v4" },
    ])
    expect(stats.get("l1")).toEqual({ registrations: 3, people: 2 })
    expect(stats.get("l2")).toEqual({ registrations: 1, people: 1 })
    expect(stats.size).toBe(2)
  })
  it("words the count", () => {
    expect(groupLinkStatsText(undefined)).toBe("Aucune inscription pour l'instant")
    expect(groupLinkStatsText({ registrations: 1, people: 1 })).toBe("1 personne inscrite, 1 créneau")
    expect(groupLinkStatsText({ registrations: 5, people: 3 })).toBe("3 personnes inscrites, 5 créneaux")
  })
  it("filters the registrations page by link, or without one", () => {
    expect(matchesGroupFilter("l1", "")).toBe(true)
    expect(matchesGroupFilter("l1", "l1")).toBe(true)
    expect(matchesGroupFilter("l2", "l1")).toBe(false)
    expect(matchesGroupFilter(null, "none")).toBe(true)
    expect(matchesGroupFilter(undefined, "none")).toBe(true)
    expect(matchesGroupFilter("l1", "none")).toBe(false)
  })
})
