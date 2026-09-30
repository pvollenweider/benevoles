import { describe, it, expect } from "vitest"
import { allowedReservedRoles, memberMayTake, parseTagList, reservationRefusal, reservedRoles } from "../role-reservation"

// Roles reserved to members with a tag (#470).
describe("reservedRoles", () => {
  it("collects each role's tags from all its shifts, deduplicated case-insensitively", () => {
    const map = reservedRoles([
      { roleName: "Sécurité", reservedTags: ["sécurité"] },
      { roleName: "Sécurité", reservedTags: ["Sécurité", "secouriste"] },
      { roleName: "Sécurité", reservedTags: [] },
      { roleName: "Bar", reservedTags: [] },
    ])
    expect(Object.fromEntries(map)).toEqual({ "Sécurité": ["sécurité", "secouriste"] })
  })
})

describe("memberMayTake and allowedReservedRoles", () => {
  it("needs one of the tags, whatever the case", () => {
    expect(memberMayTake(["Sécurité"], ["sécurité"])).toBe(true)
    expect(memberMayTake(["bar"], ["sécurité", "secouriste"])).toBe(false)
    expect(memberMayTake([], [])).toBe(true)
    const reserved = new Map([["Sécurité", ["sécurité"]], ["Loge", ["artistes"]]])
    expect(allowedReservedRoles(reserved, ["SÉCURITÉ", "bar"])).toEqual(["Sécurité"])
  })
})

describe("parseTagList and messages", () => {
  it("cleans the organiser's input", () => {
    expect(parseTagList(" sécurité, Sécurité ;secouriste,, ")).toEqual(["sécurité", "secouriste"])
    expect(parseTagList("")).toEqual([])
    expect(parseTagList(Array.from({ length: 15 }, (_, i) => `t${i}`).join(","))).toHaveLength(10)
  })

  it("explains the refusal without naming tags", () => {
    expect(reservationRefusal("Sécurité", false)).toBe("Le poste « Sécurité » est réservé aux membres invités : utilisez le lien personnel reçu par email.")
    expect(reservationRefusal("Sécurité", true)).toMatch(/votre invitation n'y donne pas accès/)
  })
})
