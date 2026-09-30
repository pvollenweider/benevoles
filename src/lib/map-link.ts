// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Map links from stored coordinates (#191, first step). Coordinates are typed once by the
 * organiser (pasted from a maps site or entered as "lat, lon"); the volunteer gets a link to
 * OpenStreetMap, so no map request leaves the page until the person clicks. No autocomplete
 * provider yet: the public Nominatim instance forbids it, and a provider interface is a later step.
 */

export type Coordinates = { latitude: number; longitude: number }

export const MAP_LINK_LABEL = "Voir sur la carte"
/** Visually hidden suffix of the link (same wording as the other external links of the site). */
export const MAP_LINK_SR_SUFFIX = " (OpenStreetMap, ouvre dans un nouvel onglet)"
/** Visible link text in emails, where hidden text is not reliable. */
export const MAP_LINK_EMAIL_LABEL = "Voir sur la carte (OpenStreetMap)"

const inRange = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

const round = (n: number) => Math.round(n * 1e6) / 1e6

/** OpenStreetMap link centred on the point, with a marker. */
export function osmLink(c: Coordinates): string {
  const lat = round(c.latitude)
  const lon = round(c.longitude)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`
}

/** "46.180573, 6.122829" for an input field. */
export function formatCoordinates(c: Coordinates | null | undefined): string {
  if (!c) return ""
  return `${round(c.latitude)}, ${round(c.longitude)}`
}

/**
 * Reads coordinates from what an organiser is likely to paste: "46.18, 6.12" (comma, semicolon
 * or space separated), an OpenStreetMap link (mlat/mlon or #map=z/lat/lon), a Google Maps link
 * (@lat,lon or q=lat,lon / ll=lat,lon), or a geo: URI. Returns null when nothing usable is found.
 */
export function parseCoordinates(input: string | null | undefined): Coordinates | null {
  const text = (input ?? "").trim()
  if (!text) return null
  const num = "(-?\\d{1,3}(?:[.,]\\d+)?)"
  const toNum = (s: string) => Number(s.replace(",", "."))
  const candidates: RegExp[] = [
    new RegExp(`[?&]mlat=${num}[^#]*[?&]mlon=${num}`),
    new RegExp(`#map=\\d+/${num}/${num}`),
    new RegExp(`@${num},${num}`),
    new RegExp(`[?&](?:q|ll|query|destination)=${num},${num}`),
    new RegExp(`^geo:${num},${num}`),
  ]
  for (const re of candidates) {
    const m = text.match(re)
    if (m) {
      const lat = toNum(m[1])
      const lon = toNum(m[2])
      if (inRange(lat, lon)) return { latitude: round(lat), longitude: round(lon) }
    }
  }
  // Plain pair: "46.18, 6.12", "46.18; 6.12", "46.18 6.12" (a decimal comma pair needs another separator).
  const pair = text.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/)
    ?? text.match(/^(-?\d{1,3},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)$/)
  if (pair) {
    const lat = toNum(pair[1])
    const lon = toNum(pair[2])
    if (inRange(lat, lon)) return { latitude: round(lat), longitude: round(lon) }
  }
  return null
}

/** Coordinates of a row, or null when one of them is missing. */
export function coordinatesOf(row: { latitude?: number | null; longitude?: number | null } | null | undefined): Coordinates | null {
  if (!row || row.latitude == null || row.longitude == null) return null
  return inRange(row.latitude, row.longitude) ? { latitude: row.latitude, longitude: row.longitude } : null
}
