import { describe, it, expect } from "vitest"
import { isUnlistedPublic, listingChangeLabel, PUBLIC_ACCESS_WHERE, PUBLIC_LIST_WHERE, robotsFor, visibilityLabel } from "../event-visibility"

// Unlisted events (#414): listing is a second axis, never a bypass of the lifecycle.
describe("event visibility", () => {
  it("lists only published and listed events; direct access needs published only", () => {
    expect(PUBLIC_LIST_WHERE).toEqual({ publicStatus: "published", isListed: true })
    expect(PUBLIC_ACCESS_WHERE).toEqual({ publicStatus: "published" })
  })

  it("labels the four combinations", () => {
    expect(visibilityLabel({ publicStatus: "draft", isListed: false })).toBe("Brouillon")
    expect(visibilityLabel({ publicStatus: "published", isListed: true })).toBe("Publié")
    expect(visibilityLabel({ publicStatus: "published", isListed: false })).toBe("Publié — non répertorié")
    expect(visibilityLabel({ publicStatus: "archived", isListed: false })).toBe("Archivé")
    expect(isUnlistedPublic({ publicStatus: "draft", isListed: false })).toBe(false)
    expect(isUnlistedPublic({ publicStatus: "published", isListed: false })).toBe(true)
  })

  it("asks robots to skip unlisted published events only", () => {
    expect(robotsFor({ publicStatus: "published", isListed: false })).toEqual({ index: false, follow: false })
    expect(robotsFor({ publicStatus: "published", isListed: true })).toBeUndefined()
    expect(robotsFor(null)).toBeUndefined()
  })

  it("words the log entry", () => {
    expect(listingChangeLabel(true)).toBe("répertorié")
    expect(listingChangeLabel(false)).toBe("non répertorié")
  })
})
