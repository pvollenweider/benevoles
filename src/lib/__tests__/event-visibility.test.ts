import { describe, it, expect } from "vitest"
import { isUnlistedPublic, listingChangeLabel, orgHomeEventsWhere, orgHomeRobots, PUBLIC_ACCESS_WHERE, PUBLIC_LIST_WHERE, robotsFor, startOfToday, visibilityLabel } from "../event-visibility"

// Unlisted events (#414): listing is a second axis, never a bypass of the lifecycle.
describe("event visibility", () => {
  it("lists only published and listed events; direct access needs published only", () => {
    expect(PUBLIC_LIST_WHERE).toEqual({ publicStatus: "published", isListed: true })
    expect(PUBLIC_ACCESS_WHERE).toEqual({ publicStatus: "published" })
  })

  it("labels the four combinations", () => {
    expect(visibilityLabel({ publicStatus: "draft", isListed: false })).toBe("Brouillon")
    expect(visibilityLabel({ publicStatus: "published", isListed: true })).toBe("Publié")
    expect(visibilityLabel({ publicStatus: "published", isListed: false })).toBe("Publié, non répertorié")
    expect(visibilityLabel({ publicStatus: "archived", isListed: false })).toBe("Archivé")
    expect(isUnlistedPublic({ publicStatus: "draft", isListed: false })).toBe(false)
    expect(isUnlistedPublic({ publicStatus: "published", isListed: false })).toBe(true)
  })

  it("lets robots index published listed events only", () => {
    expect(robotsFor({ publicStatus: "published", isListed: false })).toEqual({ index: false, follow: false })
    expect(robotsFor({ publicStatus: "published", isListed: true })).toBeUndefined()
    expect(robotsFor({ publicStatus: "draft", isListed: true })).toEqual({ index: false, follow: false })
    expect(robotsFor({ publicStatus: "archived", isListed: true })).toEqual({ index: false, follow: false })
    expect(robotsFor(null)).toBeUndefined()
  })

  it("words the log entry", () => {
    expect(listingChangeLabel(true)).toBe("répertorié")
    expect(listingChangeLabel(false)).toBe("non répertorié")
  })
})

// An organisation's public page without any event to show reads as a soft 404 to Google.
describe("organisation public page", () => {
  it("shows published, listed events not over yet, from midnight today", () => {
    const now = new Date(2026, 10, 2, 15, 42, 7)
    expect(startOfToday(now)).toEqual(new Date(2026, 10, 2))
    expect(now.getHours()).toBe(15)
    expect(orgHomeEventsWhere(now)).toEqual({ publicStatus: "published", isListed: true, endDate: { gte: new Date(2026, 10, 2) } })
  })

  it("keeps the page out of search engines while it shows no event, links still followed", () => {
    expect(orgHomeRobots(0)).toEqual({ index: false, follow: true })
  })

  it("lets robots index the page again as soon as it shows an event", () => {
    expect(orgHomeRobots(1)).toBeUndefined()
    expect(orgHomeRobots(7)).toBeUndefined()
  })
})
