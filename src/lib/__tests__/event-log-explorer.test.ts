import { describe, it, expect } from "vitest"
import {
  baselineAnnouncement,
  entityBadgeClass,
  entryCountByEntity,
  isBaseline,
  loadedAnnouncement,
  logQueryParams,
  tabForKey,
} from "../event-log-explorer"

const noFilters = { entityType: "", actorType: "", action: "", since: "", until: "" }

describe("logQueryParams", () => {
  it("leaves empty filters out", () => {
    expect(logQueryParams(noFilters).toString()).toBe("")
  })

  it("sets the filters, dates as ISO, and the cursor", () => {
    const params = logQueryParams({ entityType: "Shift", actorType: "admin", action: "shift", since: "2030-06-01", until: "" }, "c1")
    expect(params.get("entityType")).toBe("Shift")
    expect(params.get("actorType")).toBe("admin")
    expect(params.get("action")).toBe("shift")
    expect(params.get("since")).toBe(new Date("2030-06-01").toISOString())
    expect(params.has("until")).toBe(false)
    expect(params.get("cursor")).toBe("c1")
  })
})

describe("announcements", () => {
  it("first page and more, singular and plural", () => {
    expect(loadedAnnouncement(1, false)).toBe("1 entrée trouvée.")
    expect(loadedAnnouncement(0, false)).toBe("0 entrée trouvée.")
    expect(loadedAnnouncement(3, false)).toBe("3 entrées trouvées.")
    expect(loadedAnnouncement(2, true)).toBe("2 entrées supplémentaires chargées.")
  })

  it("initial state generation", () => {
    expect(baselineAnnouncement(0)).toBe("Rien à générer : tout est déjà suivi.")
    expect(baselineAnnouncement(1)).toBe("1 état initial généré.")
    expect(baselineAnnouncement(4)).toBe("4 états initiaux générés.")
  })
})

describe("tabForKey", () => {
  it("arrows wrap around, Home and End go to the ends", () => {
    expect(tabForKey("explore", "ArrowRight")).toBe("replay")
    expect(tabForKey("story", "ArrowRight")).toBe("explore")
    expect(tabForKey("explore", "ArrowLeft")).toBe("story")
    expect(tabForKey("replay", "Home")).toBe("explore")
    expect(tabForKey("replay", "End")).toBe("story")
  })

  it("ignores other keys", () => {
    expect(tabForKey("explore", "Enter")).toBeNull()
    expect(tabForKey("explore", "a")).toBeNull()
  })
})

describe("entries", () => {
  it("counts loaded entries per entity", () => {
    const counts = entryCountByEntity([{ entityId: "a" }, { entityId: "b" }, { entityId: "a" }])
    expect(counts.get("a")).toBe(2)
    expect(counts.get("b")).toBe(1)
    expect(counts.get("c")).toBeUndefined()
  })

  it("tells a baseline snapshot from a real action", () => {
    expect(isBaseline("shift.baseline")).toBe(true)
    expect(isBaseline("shift.updated")).toBe(false)
  })

  it("colors known entity types, grey otherwise", () => {
    expect(entityBadgeClass("Shift")).toContain("indigo")
    expect(entityBadgeClass("EventPage")).toBe("bg-gray-100 text-gray-600")
  })
})
