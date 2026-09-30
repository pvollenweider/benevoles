import { describe, it, expect } from "vitest"
import { coordinatesOf, formatCoordinates, osmLink, parseCoordinates } from "../map-link"

// Map links from stored coordinates (#191).
describe("parseCoordinates", () => {
  it("reads a plain pair with a comma, a semicolon or a space, and decimal commas", () => {
    expect(parseCoordinates("46.1805734, 6.1228285")).toEqual({ latitude: 46.180573, longitude: 6.122829 })
    expect(parseCoordinates("46.18;6.12")).toEqual({ latitude: 46.18, longitude: 6.12 })
    expect(parseCoordinates("46.18 6.12")).toEqual({ latitude: 46.18, longitude: 6.12 })
    expect(parseCoordinates("46,18; 6,12")).toEqual({ latitude: 46.18, longitude: 6.12 })
    expect(parseCoordinates("-33.9, 151.2")).toEqual({ latitude: -33.9, longitude: 151.2 })
  })

  it("reads OpenStreetMap, Google Maps and geo links", () => {
    expect(parseCoordinates("https://www.openstreetmap.org/?mlat=46.1805734&mlon=6.1228285#map=17/46.1805734/6.1228285")).toEqual({ latitude: 46.180573, longitude: 6.122829 })
    expect(parseCoordinates("https://www.openstreetmap.org/#map=15/46.2044/6.1432")).toEqual({ latitude: 46.2044, longitude: 6.1432 })
    expect(parseCoordinates("https://www.google.com/maps/place/Gen%C3%A8ve/@46.2043907,6.1431577,13z/data=!3m1")).toEqual({ latitude: 46.204391, longitude: 6.143158 })
    expect(parseCoordinates("https://maps.google.com/?q=46.2,6.1")).toEqual({ latitude: 46.2, longitude: 6.1 })
    expect(parseCoordinates("geo:46.2,6.1?z=17")).toEqual({ latitude: 46.2, longitude: 6.1 })
  })

  it("rejects text, out-of-range values and blanks", () => {
    expect(parseCoordinates("Salle communale, Genève")).toBeNull()
    expect(parseCoordinates("95, 10")).toBeNull()
    expect(parseCoordinates("10, 190")).toBeNull()
    expect(parseCoordinates("")).toBeNull()
    expect(parseCoordinates(null)).toBeNull()
    expect(parseCoordinates("2026-07-04")).toBeNull()
  })
})

describe("osmLink, formatCoordinates, coordinatesOf", () => {
  it("builds a marker link and a readable pair", () => {
    expect(osmLink({ latitude: 46.1805734, longitude: 6.1228285 })).toBe("https://www.openstreetmap.org/?mlat=46.180573&mlon=6.122829#map=17/46.180573/6.122829")
    expect(formatCoordinates({ latitude: 46.18, longitude: 6.12 })).toBe("46.18, 6.12")
    expect(formatCoordinates(null)).toBe("")
  })

  it("needs both values of a row", () => {
    expect(coordinatesOf({ latitude: 46.18, longitude: 6.12 })).toEqual({ latitude: 46.18, longitude: 6.12 })
    expect(coordinatesOf({ latitude: 46.18, longitude: null })).toBeNull()
    expect(coordinatesOf(null)).toBeNull()
  })
})
