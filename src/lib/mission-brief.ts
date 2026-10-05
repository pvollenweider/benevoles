// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Avant ta mission » (#560): what a registered volunteer needs to show up on their own, for
 * their next confirmed shift, at the top of the personal page. In reading order: date and time,
 * place with a map link, whom to contact on site, instruction, then the event's information
 * pages and the organization's email. The shift's own info comes first; the event's fills the
 * gaps. Pure: the page only renders it.
 */

import { shiftInstants } from "./ics"
import { coordinatesOf, osmLink } from "./map-link"
import { onSiteContact, type OnSiteContact, type ShiftInfo } from "./shift-info"

export const MISSION_BRIEF_TITLE = "Avant ta mission"
/** Anchor of the block, for the link from its shift's card. */
export const MISSION_BRIEF_ID = "avant-ta-mission"

/** What the event offers as a fallback, all of it already public except the day-of contact (carried by the shift info). */
export type BriefEvent = {
  location?: string | null
  latitude?: number | null
  longitude?: number | null
  publicInstructions?: string | null
  /** Information pages of a published event (#188), absolute URLs. */
  pages?: { title: string; url: string }[]
}

export type BriefShift = ShiftInfo & {
  label: string
  /** Calendar day, ISO (only the day is used). */
  date: string
  startTime: string
  endTime: string
}

export type MissionBrief = {
  /** Text of the place and its map link; the shift's place first, else the event's. */
  place: { text: string; href: string | null } | null
  contact: OnSiteContact | null
  /** Names of the role's sector leaders (#560), never their contact details. */
  leaders: string[]
  instructions: string | null
  pages: { title: string; url: string }[]
}

const clean = (v: string | null | undefined) => (v ?? "").trim()

/** The « Écrire à l'organisation » mail link, the event named in the subject. */
export function orgContactHref(email: string, eventTitle: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(`Question sur mon inscription : ${eventTitle}`)}`
}

/**
 * The confirmed registration whose shift comes next: not over yet at `now` (one in progress
 * still counts), earliest start first. Waitlist, offered and requested registrations never.
 */
export function nextConfirmedRegistration<T extends { status: string; shift: Pick<BriefShift, "date" | "startTime" | "endTime"> }>(
  registrations: T[],
  now: Date,
  timeZone: string,
): T | null {
  let best: { reg: T; start: number } | null = null
  for (const reg of registrations) {
    if (reg.status !== "active") continue
    const { start, end } = shiftInstants(reg.shift, timeZone)
    if (end.getTime() <= now.getTime()) continue
    if (!best || start.getTime() < best.start) best = { reg, start: start.getTime() }
  }
  return best?.reg ?? null
}

/**
 * The brief of one shift. The place text and the coordinates follow the shift info, which
 * already carries the event's coordinates when the shift has none (#191); a shift without a
 * place of its own takes the event's. The instruction is the shift's, else the event's public
 * instructions. The contact is the shift's, else the day-of contact (`onSiteContact`).
 */
export function missionBrief(shift: BriefShift, event: BriefEvent): MissionBrief {
  const ownPlace = clean(shift.locationDetails)
  const coords = coordinatesOf(shift) ?? coordinatesOf(event)
  const placeText = ownPlace || clean(event.location) || (coords ? "Point de rendez-vous" : "")
  return {
    place: placeText ? { text: placeText, href: coords ? osmLink(coords) : null } : null,
    contact: onSiteContact(shift),
    leaders: (shift.sectorLeaderNames ?? []).map(clean).filter(Boolean),
    instructions: clean(shift.instructions) || clean(event.publicInstructions) || null,
    pages: (event.pages ?? []).filter((p) => clean(p.title) && clean(p.url)),
  }
}
