// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { coordinatesOf } from "./map-link"
import { type ShiftInfo } from "./shift-info"

/**
 * What a volunteer can read about a shift before choosing it (#1471): its description and its
 * public practical info (place, map link, instructions). The contact person is never part of it:
 * it stays for registered volunteers (src/lib/public-event.ts).
 */
export type ShiftDetails = { description: string | null; info: ShiftInfo }

export type ShiftDetailsSource = {
  description?: string | null
  locationDetails?: string | null
  instructions?: string | null
  latitude?: number | null
  longitude?: number | null
  mealOnTheGo?: boolean | null
}

const clean = (s: string | null | undefined) => s?.trim() || null

/**
 * The shift's details, or null when there is nothing more to read than its name and time. Only
 * what the organisation wrote for this shift counts: a shift without its own point inherits the
 * event's meeting point (src/lib/public-event.ts), so a map link alone would put « Détails » under
 * every shift of an event with an address. The link is still shown once there is something else.
 */
export function shiftDetails(shift: ShiftDetailsSource): ShiftDetails | null {
  const description = clean(shift.description)
  if (!description && !clean(shift.locationDetails) && !clean(shift.instructions) && !shift.mealOnTheGo) return null
  const info: ShiftInfo = {
    locationDetails: shift.locationDetails,
    instructions: shift.instructions,
    latitude: shift.latitude,
    longitude: shift.longitude,
    mealOnTheGo: shift.mealOnTheGo,
  }
  return { description, info }
}

/** Details by shift id, only for the shifts that have some. */
export function shiftDetailsById<S extends ShiftDetailsSource & { id: string }>(shifts: S[]): Map<string, ShiftDetails> {
  const out = new Map<string, ShiftDetails>()
  for (const s of shifts) {
    const details = shiftDetails(s)
    if (details) out.set(s.id, details)
  }
  return out
}

/** Name of the list's « Détails » button: it starts with the visible word (WCAG 2.5.3). */
export function detailsButtonName(title: string): string {
  return `Détails : ${title}`
}

/**
 * What a frise bar's screen-reader description adds (#1471): the place when there is one, and
 * where the rest is. A screen-reader user moving bar to bar hears it; the full details are in the
 * line under the frise, reached with Tab.
 */
export function barDetailsText(details: ShiftDetails): string {
  const place = clean(details.info.locationDetails) || (coordinatesOf(details.info) ? "Point de rendez-vous" : null)
  const more = !!details.description || !!clean(details.info.instructions) || !!details.info.mealOnTheGo || !!coordinatesOf(details.info)
  return [place ? `Lieu : ${place}.` : null, more ? "Détails sous le planning." : null].filter(Boolean).join(" ")
}

/** A pointer must rest this long on a bar before the line under the frise follows it: moving
 * from a bar down to a link of the line crosses other bars, which must not replace it. */
export const DETAILS_HOVER_DELAY_MS = 400

/** Said in the line under the frise before any bar was pointed at, focused or touched. */
export const FRISE_DETAILS_PROMPT = "Pointe ou parcours un créneau pour voir ses détails ici. Sur un téléphone, toucher un créneau le choisit : la vue « Liste » montre les détails sans choisir."

/** The same, when « Voir qui est inscrit » is on too: the line says both. */
export const FRISE_DETAILS_ROSTER_PROMPT = "Pointe ou parcours un créneau pour voir ici ses détails et qui est inscrit. Sur un téléphone, toucher un créneau le choisit : la vue « Liste » montre les détails et tous les noms sans choisir."

/** A shift this short (#1470) is a bar too narrow to read on a phone: on an event that has one,
 * the line under the frise says the name, hours and places of the bar pointed at, on every day. */
export const SHORT_SHIFT_MINUTES = 60

/** Whether an event has a short shift (#1470), cancelled ones aside. A night shift counts its
 * real length (22:00 to 00:30 is 150 minutes). */
export function hasShortShift(shifts: { startTime: string; endTime: string; status?: string }[]): boolean {
  const minutes = (t: string) => { const [h, m = "0"] = t.split(":"); return parseInt(h, 10) * 60 + parseInt(m, 10) }
  return shifts.some((s) => {
    if (s.status === "cancelled") return false
    let d = minutes(s.endTime) - minutes(s.startTime)
    if (d <= 0) d += 24 * 60
    return d <= SHORT_SHIFT_MINUTES
  })
}

/** Said in the line under the frise when it is there only for short shifts. */
export const FRISE_SHORT_PROMPT = "Pointe ou parcours un créneau pour voir ici son nom, ses horaires et ses places. La vue « Liste » les montre tous en entier."
