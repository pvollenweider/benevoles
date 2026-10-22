// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { calculateAgeAt } from "./utils"
import { rosterDisplayName } from "./shift-roster-text"

/**
 * Shift roster between volunteers (#1068): on an event whose organisers turned it on
 * (Event.shiftRosterEnabled, on by default for new events from Organization.shiftRosterDefault),
 * an identified viewer sees, shift by shift, the confirmed volunteers of the event who opted in
 * (RosterConsent), as « Aline M. », and how many others are there. Purpose (owner decision): a
 * volunteer who gives time wants to spend it with people they know, so names help when choosing
 * shifts: on the event's frise and list, behind « Voir qui est inscrit », and on the personal page
 * for the viewer's own shifts.
 *
 * Who may see (server-side, never anyone else): a volunteer holding a confirmed place on the event,
 * through their personal link ("confirmed" audience); a member invited to the event by the
 * organisation, through their invitation link, before signing up ("invited" audience). Never an
 * anonymous visitor, a group link, the embed or a search engine.
 *
 * Audience by consent text (RosterConsent.noticeVersion): the first text (ROSTER_NOTICE_V1) only
 * named confirmed volunteers as its audience, so such a choice is never shown to invited members
 * until the volunteer accepts the current text (from their personal page). An unknown version is
 * never shown at all.
 *
 * Privacy design (GDPR / nLPD review recorded in the PR of #1068):
 * - opt-in, never on the organiser's behalf: no choice = hidden, so existing registrations and
 *   volunteers registered before the setting was turned on stay hidden until they accept;
 * - a sign-up form that proves nothing about who submitted it (anyone can type an address) never
 *   makes anyone visible: the request is kept "pending" until confirmed from the personal page,
 *   whose link only goes out by email; such a sign-up also suspends an earlier acceptance, since
 *   the new shift may not be theirs;
 * - only to a volunteer holding a confirmed place on the same event; only confirmed colleagues,
 *   never someone known to be under 18, an erased or merged record; nothing once the event is
 *   over or anonymised;
 * - first name and last-name initial only: never the full name, contact details or anything else;
 * - per shift, the number of the other confirmed volunteers not named (#1068 follow-up): a bare
 *   count, the same whatever the reason (no choice, hidden, pending, minor, erased record), so it
 *   never tells why someone is not named; the shift totals are already public (spotsLeft). The
 *   sign-up hint, the card, the organisers' hint and the privacy policy say so.
 *
 * Pure and client-safe (no Prisma): the routes load, these functions decide. This module holds the
 * rules (who may see, who is named, the counts, the consent texts' versions and audiences); what
 * volunteers and organisers read (the texts, the sentences, the display name's format) is in
 * src/lib/shift-roster-text.ts.
 */

/**
 * The text a volunteer accepts, by version: stored with each choice (RosterConsent.noticeVersion).
 * V1 (2026-10-21, its wording in src/lib/shift-roster-text.ts): its audience was confirmed
 * volunteers only.
 */
export const ROSTER_NOTICE_V1 = "2026-10-21"
/** The current text (ROSTER_SIGNUP_LABEL and its hint): confirmed volunteers and invited members. */
export const ROSTER_NOTICE_VERSION = "2026-10-21.2"

/** Who is looking: a volunteer with a confirmed place, or a member invited and not (yet) confirmed. */
export type RosterAudience = "confirmed" | "invited"

/** Whether a choice accepted under `version` may be shown to `audience`. Unknown versions: never. */
export function noticeReaches(version: string | null | undefined, audience: RosterAudience): boolean {
  if (version === ROSTER_NOTICE_VERSION) return true
  if (version === ROSTER_NOTICE_V1) return audience === "confirmed"
  return false
}

/**
 * The version of the text a sign-up form showed, from what it sent: the current one only when the
 * form says so; anything else (a page loaded before this text, or nothing) counts as V1, the
 * narrower audience.
 */
export function signupNoticeVersion(submitted: unknown): string {
  return submitted === ROSTER_NOTICE_VERSION ? ROSTER_NOTICE_VERSION : ROSTER_NOTICE_V1
}

/** Age under which a volunteer is never shown, whatever they chose. */
export const ROSTER_MIN_AGE = 18

export type RosterChoice = "visible" | "pending" | "hidden"
/** A stored choice and the text it was given under. */
export type StoredRosterChoice = { status: RosterChoice; noticeVersion: string }
export type RosterSource = "signup" | "signup_verified" | "personal_page"

export const isRosterChoice = (v: unknown): v is RosterChoice => v === "visible" || v === "pending" || v === "hidden"

/** Known to be under 18 on the event's first day: only when a birth date was given (never asked for this). */
export function isKnownMinor(birthDate: Date | string | null | undefined, eventStart: Date | string | null | undefined): boolean {
  if (!birthDate) return false
  if (!eventStart) return true
  const age = calculateAgeAt(birthDate, eventStart)
  // Fails closed: an unreadable date counts as a minor.
  return !(age >= ROSTER_MIN_AGE)
}

/**
 * What the sign-up form shows for the roster: the optional box, the sentence for a minor (the
 * birth date typed, when asked, says under 18 on the event's first day), or nothing (event without
 * the roster). A date still being typed counts as none; the server decides again anyway.
 */
export function signupRosterBox(enabled: boolean, birthDate: string, eventStart: Date | string): "box" | "minor" | null {
  if (!enabled) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(birthDate) && isKnownMinor(birthDate, eventStart)) return "minor"
  return "box"
}

const isoDay = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10)
const localDay = (instant: Date, timeZone: string) => instant.toLocaleDateString("sv-SE", { timeZone })

export type RosterEventState = {
  shiftRosterEnabled: boolean
  personalDataAnonymizedAt: Date | string | null
  /** The event's last day, a calendar day at midnight UTC. */
  endDate: Date | string
}

/** Whether the event shows a roster now: turned on, not anonymised, last day not over in the organisation's zone. */
export function rosterOpen(event: RosterEventState, now: Date, timeZone: string): boolean {
  if (!event.shiftRosterEnabled || event.personalDataAnonymizedAt) return false
  return isoDay(event.endDate) >= localDay(now, timeZone)
}

/**
 * The choice stored after a public sign-up, from the stored one and the form's box. `verified`:
 * the submitter proved they own the address (their personal link, or a member invite emailed to
 * them), so their acceptance counts at once. Otherwise nothing they submit makes anyone visible:
 * an acceptance waits as "pending", and an earlier acceptance is suspended ("pending" again) since
 * the shifts just added may not be theirs. An unticked box never withdraws: it means no new choice.
 * Null = no row (unchanged); a known minor's request is ignored.
 */
export function choiceAfterSignup(input: { stored: RosterChoice | null; requested: boolean; verified: boolean; minor: boolean }): RosterChoice | null {
  const { stored, requested, verified, minor } = input
  if (verified) return requested && !minor ? "visible" : stored
  if (stored === "hidden") return "hidden"
  if (stored === "visible" || stored === "pending") return "pending"
  return requested && !minor ? "pending" : null
}

/**
 * The row stored after a public sign-up (choiceAfterSignup), with its text's version: a new choice
 * (box ticked) carries the version the form showed; anything else keeps the stored one, so a
 * sign-up without a new choice never widens an earlier audience. Null when nothing changes.
 */
export function rosterAfterSignup(input: { stored: StoredRosterChoice | null; requested: boolean; verified: boolean; minor: boolean; noticeVersion: string }): StoredRosterChoice | null {
  const { stored, requested, verified, minor, noticeVersion } = input
  const status = choiceAfterSignup({ stored: stored?.status ?? null, requested, verified, minor })
  if (status === null) return null
  const version = requested && !minor ? noticeVersion : (stored?.noticeVersion ?? noticeVersion)
  // A refusal kept is not a new choice, whatever text the form showed.
  if (stored && stored.status === status && (status === "hidden" || stored.noticeVersion === version)) return null
  return { status, noticeVersion: version }
}

export type RosterRegistration = {
  shiftId: string
  volunteerId: string
  status: string
  volunteer: {
    firstName: string
    lastName: string
    birthDate: Date | string | null
    erasedAt: Date | string | null
    mergedIntoId: string | null
  }
}

export type RosterShift = { id: string; label: string; date: Date | string; startTime: string; endTime: string }
/**
 * `othersCount`: the other confirmed volunteers there who are not named, a bare number (never why).
 * `own`: the viewer holds a confirmed place on this shift (the personal page shows those only).
 */
export type ShiftRosterEntry = { shiftId: string; label: string; date: string; startTime: string; endTime: string; names: string[]; othersCount: number; own: boolean }

/**
 * Who the viewer sees, shift by shift: for each shift of the event (in the given order) with at
 * least one other confirmed volunteer, or held by the viewer, those who chose "visible" under a
 * text that reaches the viewer's audience (noticeReaches), by display name, sorted, and the number
 * of the others (`othersCount`). Never named: the viewer, a pending or hidden choice, a choice whose
 * text does not reach this audience, an erased or merged record, a known minor. Counted, indistinctly: every other distinct volunteer
 * with a confirmed place there who is not named (minors and erased records included, so the count
 * never singles out a category against the public totals); never the viewer, a merged record, a
 * waitlisted or pending registration. Never anything but the shift's public label and times, the
 * display strings and the count. The caller checks the viewer holds a confirmed place on the event
 * (rosterOpen and the route).
 */
export function buildShiftRoster(input: {
  viewerId: string
  shifts: RosterShift[]
  registrations: RosterRegistration[]
  choices: Map<string, StoredRosterChoice>
  audience: RosterAudience
  eventStart: Date | string
}): ShiftRosterEntry[] {
  const { viewerId, shifts, registrations, choices, audience, eventStart } = input
  const collator = new Intl.Collator("fr", { sensitivity: "base" })
  // The confirmed registrations grouped by shift once, in their given order, so each shift reads
  // only its own (shifts + registrations, not shifts × registrations).
  const byShift = new Map<string, RosterRegistration[]>()
  for (const r of registrations) {
    if (r.status !== "active") continue
    const group = byShift.get(r.shiftId)
    if (group) group.push(r)
    else byShift.set(r.shiftId, [r])
  }
  const entries: ShiftRosterEntry[] = []
  for (const shift of shifts) {
    // Two people can share a display name: both are listed (one entry per confirmed volunteer).
    const names: string[] = []
    const named = new Set<string>()
    const others = new Set<string>()
    let own = false
    for (const r of byShift.get(shift.id) ?? []) {
      if (r.volunteerId === viewerId) { own = true; continue }
      const v = r.volunteer
      // A merged record keeps no place of its own: its registrations moved to the kept one.
      if (v.mergedIntoId || named.has(r.volunteerId)) continue
      const choice = choices.get(r.volunteerId)
      const shown = choice?.status === "visible" && noticeReaches(choice.noticeVersion, audience) && !v.erasedAt && !isKnownMinor(v.birthDate, eventStart)
      const name = shown ? rosterDisplayName(v.firstName, v.lastName) : null
      if (name) { named.add(r.volunteerId); others.delete(r.volunteerId); names.push(name) }
      else others.add(r.volunteerId)
    }
    if (!own && names.length === 0 && others.size === 0) continue
    const date = (shift.date instanceof Date ? shift.date : new Date(shift.date)).toISOString()
    entries.push({ shiftId: shift.id, label: shift.label, date, startTime: shift.startTime, endTime: shift.endTime, names: names.sort(collator.compare), othersCount: others.size, own })
  }
  return entries
}

/**
 * What the personal page says about the viewer's own choice. "visible_confirmed": shown under the
 * first text, to confirmed volunteers only, with the offer to accept the current one.
 */
export type RosterViewerState = "visible" | "visible_confirmed" | "pending" | "hidden" | "minor"

export function viewerState(choice: StoredRosterChoice | null, minor: boolean): RosterViewerState {
  if (minor) return "minor"
  if (!choice) return "hidden"
  if (choice.status !== "visible") return choice.status
  if (noticeReaches(choice.noticeVersion, "invited")) return "visible"
  return noticeReaches(choice.noticeVersion, "confirmed") ? "visible_confirmed" : "hidden"
}

/** What the personal page's card asks: show the name, hide it, or widen it to the current text. */
export type RosterAction = "show" | "hide" | "widen"

/** `?inscrits=1` on the event page: a display preference (the switch on at load), never an access right. */
export const ROSTER_QUERY_PARAM = "inscrits"

/**
 * Which link identifies the visitor of an event page for the roster, if any. Only an invitation
 * in the address or this browser's personal session on the event; never on a group link (shared,
 * so it identifies nobody, even with a session in the browser), in the embed or the admin preview,
 * nor on an event without the roster. The server checks the link again on every read.
 */
export function eventPageRosterViewer(input: {
  enabled: boolean
  embed: boolean
  preview: boolean
  groupLink: boolean
  inviteToken: string | null
  sessionToken: string | null
}): { kind: "invite" | "personal"; token: string } | null {
  if (!input.enabled || input.embed || input.preview || input.groupLink) return null
  if (input.inviteToken) return { kind: "invite", token: input.inviteToken }
  if (input.sessionToken) return { kind: "personal", token: input.sessionToken }
  return null
}

/**
 * What an invitation link may see of the roster: as a confirmed volunteer when the member holds a
 * confirmed place on the event; as an invited member while the invitation is still open (never
 * answered « pas disponible », never used to sign up: after a sign-up the personal link takes
 * over, and withdrawing every shift does not bring the invitation's access back); nothing for an
 * inactive, erased or merged member.
 */
export function inviteRosterAudience(input: { active: boolean; erased: boolean; merged: boolean; declined: boolean; used: boolean; confirmedOnEvent: boolean }): RosterAudience | null {
  if (!input.active || input.erased || input.merged) return null
  if (input.confirmedOnEvent) return "confirmed"
  if (input.declined || input.used) return null
  return "invited"
}

/** The event page with the switch on at load (`?inscrits=1`), from its public URL (its query kept). */
export function rosterEventHref(eventPageUrl: string): string {
  const hashAt = eventPageUrl.indexOf("#")
  const base = hashAt >= 0 ? eventPageUrl.slice(0, hashAt) : eventPageUrl
  return `${base}${base.includes("?") ? "&" : "?"}${ROSTER_QUERY_PARAM}=1`
}
