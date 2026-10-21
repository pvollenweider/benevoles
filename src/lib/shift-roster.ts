// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { calculateAgeAt } from "./utils"

/**
 * Shift roster between volunteers (#1068): on an event whose organisers turned it on
 * (Event.shiftRosterEnabled), the personal page of a volunteer with a confirmed place names, shift
 * by shift, the other confirmed volunteers of the event, as « Aline M. », when those volunteers
 * opted in (RosterConsent). Purpose (owner decision): know who you will be with and choose shifts
 * by affinity; every shift of the event, since that is what lets a volunteer pick one.
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
 * - first name and last-name initial only: never the full name, contact details or anything else.
 *
 * Pure and client-safe (no Prisma): the routes load, these functions decide.
 */

/** The text a volunteer accepts, by version: stored with each choice (RosterConsent.noticeVersion). */
export const ROSTER_NOTICE_VERSION = "2026-10-21"

/** The sign-up form's optional checkbox (#1068), first person like the form's other boxes. */
export const ROSTER_SIGNUP_LABEL = "J'accepte que les autres bénévoles confirmés de cet événement, y compris ceux qui ne partagent aucun créneau avec moi, voient sur chacun de mes créneaux mon prénom et l'initiale de mon nom (par exemple « Aline M. »), jusqu'à la fin de l'événement, pour savoir avec qui ils seront et choisir leurs créneaux."
export const ROSTER_SIGNUP_HINT = "Facultatif, sans effet sur ton inscription. Tu pourras le confirmer, ou le masquer à tout moment, sur ta page personnelle."

/** The organisers' side (#1068): the setting's hint, the reminder once it is on, the publication's note. */
export const ROSTER_SETTING_LABEL = "Montrer aux bénévoles confirmés qui est inscrit sur chaque créneau"
export const ROSTER_SETTING_HINT = "Désactivé par défaut. Seuls les bénévoles qui l'acceptent apparaissent, sous la forme « Aline M. » (prénom et initiale du nom), sur la page personnelle des autres bénévoles confirmés de l'événement, pour tous les créneaux, jusqu'à la fin de l'événement. Les personnes déjà inscrites restent masquées tant qu'elles ne l'ont pas accepté depuis leur page personnelle. Les bénévoles de moins de 18 ans n'apparaissent jamais."
export const ROSTER_ENABLE_REMINDER = "Informez les bénévoles : le formulaire d'inscription leur propose désormais d'afficher leur nom, et vous ne pouvez pas l'accepter à leur place. Activer ce réglage ne vaut pas leur accord. Refuser ou retirer son accord est sans effet sur leur inscription. Mentionnez-le aussi dans les informations que votre association donne à ses bénévoles."
export const ROSTER_PUBLISH_NOTE = "Option : vous pouvez montrer aux bénévoles confirmés qui est inscrit sur chaque créneau (prénom et initiale du nom, seulement pour celles et ceux qui l'acceptent). Ce réglage est désactivé pour cet événement ; l'activer, maintenant ou plus tard, ne change rien à la publication."
export const ROSTER_MINOR_TEXT = "Les noms des bénévoles de moins de 18 ans ne sont jamais montrés aux autres bénévoles."

/** Age under which a volunteer is never shown, whatever they chose. */
export const ROSTER_MIN_AGE = 18

export type RosterChoice = "visible" | "pending" | "hidden"
export type RosterSource = "signup" | "signup_verified" | "personal_page"

export const isRosterChoice = (v: unknown): v is RosterChoice => v === "visible" || v === "pending" || v === "hidden"

/** « Aline M. »: the first name and the first letter of the last name, nothing more. Null without a first name. */
export function rosterDisplayName(firstName: string, lastName: string): string | null {
  const first = firstName.trim().replace(/\s+/g, " ")
  if (!first) return null
  // By code point, so an accented or astral first letter is kept whole.
  const initial = Array.from(lastName.trim())[0]
  return initial ? `${first} ${initial.toLocaleUpperCase("fr")}.` : first
}

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

/** How a screen reader should say a display name: « M. » alone is read « Monsieur » by French voices. */
export function rosterSpokenName(displayName: string): string {
  const m = displayName.match(/^(.*) (\S)\.$/u)
  return m ? `${m[1]}, initiale ${m[2]}` : displayName
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
export type ShiftRosterEntry = { shiftId: string; label: string; date: string; startTime: string; endTime: string; names: string[] }

/**
 * Who the viewer sees, shift by shift: for each shift of the event (in the given order) with at
 * least one name, the other confirmed volunteers there who chose "visible", by display name,
 * sorted. Never the viewer, a pending or hidden choice, an erased or merged record, a known minor;
 * never anything but the shift's public label and times and the display strings. The caller
 * checks the viewer holds a confirmed place on the event (rosterOpen and the route).
 */
export function buildShiftRoster(input: {
  viewerId: string
  shifts: RosterShift[]
  registrations: RosterRegistration[]
  choices: Map<string, RosterChoice>
  eventStart: Date | string
}): ShiftRosterEntry[] {
  const { viewerId, shifts, registrations, choices, eventStart } = input
  const collator = new Intl.Collator("fr", { sensitivity: "base" })
  const entries: ShiftRosterEntry[] = []
  for (const shift of shifts) {
    const names = new Set<string>()
    for (const r of registrations) {
      if (r.shiftId !== shift.id || r.status !== "active" || r.volunteerId === viewerId) continue
      if (choices.get(r.volunteerId) !== "visible") continue
      const v = r.volunteer
      if (v.erasedAt || v.mergedIntoId || isKnownMinor(v.birthDate, eventStart)) continue
      const name = rosterDisplayName(v.firstName, v.lastName)
      if (name) names.add(name)
    }
    if (names.size === 0) continue
    const date = (shift.date instanceof Date ? shift.date : new Date(shift.date)).toISOString()
    entries.push({ shiftId: shift.id, label: shift.label, date, startTime: shift.startTime, endTime: shift.endTime, names: [...names].sort(collator.compare) })
  }
  return entries
}

/** What the personal page says about the viewer's own choice. */
export type RosterViewerState = "visible" | "pending" | "hidden" | "minor"

export function viewerState(choice: RosterChoice | null, minor: boolean): RosterViewerState {
  if (minor) return "minor"
  return choice ?? "hidden"
}

/** The sentence of the personal page about the viewer's choice, with their own display name. */
export function viewerStateText(state: RosterViewerState, displayName: string | null): string {
  const shown = displayName ? `« ${displayName} »` : "ton prénom et l'initiale de ton nom"
  switch (state) {
    case "visible": return `Ton nom est affiché : sur tes créneaux, les autres bénévoles confirmés de l'événement voient ${shown}.`
    case "pending": return `Tu as demandé à l'inscription d'afficher ton nom : il n'apparaît qu'une fois confirmé ici. Sur tes créneaux, les autres bénévoles confirmés de l'événement verraient ${shown}.`
    case "minor": return "Ton nom n'est pas montré aux autres bénévoles (moins de 18 ans)."
    case "hidden": return `Ton nom n'est pas affiché aux autres bénévoles. Si tu l'affiches, les autres bénévoles confirmés de l'événement verront ${shown} sur tes créneaux. Tu pourras le masquer à tout moment.`
  }
}

export const rosterButtonLabel = (state: RosterViewerState) => (state === "visible" ? "Masquer mon nom" : "Afficher mon nom")
export const rosterDoneText = (visible: boolean) => (visible ? "Ton nom est maintenant affiché." : "Ton nom est maintenant masqué.")
export const ROSTER_EMPTY_TEXT = "Aucun autre bénévole confirmé n'a choisi d'afficher son nom pour l'instant."
export const ROSTER_FAILURE_TEXT = "Ton choix n'a pas pu être enregistré. Vérifie ta connexion, puis réessaie."
