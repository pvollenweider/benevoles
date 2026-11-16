import { describe, it, expect } from "vitest"
import { orderedPlaces, placeChoiceProblem, placeName, placeNameTaken, PLACE_ARCHIVED_ERROR, PLACE_NOT_FOUND_ERROR, selectablePlaces } from "../places"

// #1171 lot 2: places of an event (invented stage names).
const p = (id: string, name: string, archivedAt: string | null = null, displayOrder = 0) => ({ id, name, archivedAt, displayOrder })

describe("places", () => {
  it("cleans names and compares them without case or extra spaces, archived ones aside", () => {
    expect(placeName("  Scène   du Lac ")).toBe("Scène du Lac")
    expect(placeName("")).toBeNull()
    expect(placeName("x".repeat(61))).toBeNull()
    const list = [p("a", "Grande Scène"), p("b", "Le Dôme", "2026-10-29")]
    expect(placeNameTaken(list, "grande scène")).toBe(true)
    expect(placeNameTaken(list, "grande scène", "a")).toBe(false)
    expect(placeNameTaken(list, "le dôme")).toBe(false)
  })

  it("orders active places first, and lets a shift keep its archived place only", () => {
    const list = [p("b", "Le Dôme", "2026-10-29", 0), p("c", "Chapiteau", null, 2), p("a", "Grande Scène", null, 1)]
    expect(orderedPlaces(list).map((x) => x.id)).toEqual(["a", "c", "b"])
    expect(selectablePlaces(list, null).map((x) => x.id)).toEqual(["a", "c"])
    expect(selectablePlaces(list, "b").map((x) => x.id)).toEqual(["a", "c", "b"])
    expect(placeChoiceProblem(list, null, null)).toBeNull()
    expect(placeChoiceProblem(list, "zz", null)).toBe(PLACE_NOT_FOUND_ERROR)
    expect(placeChoiceProblem(list, "b", null)).toBe(PLACE_ARCHIVED_ERROR)
    expect(placeChoiceProblem(list, "b", "b")).toBeNull()
  })
})
