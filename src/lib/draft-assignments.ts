// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { judgeAvailabilityAcks, shiftInterval, type AckGiven, type AnswerForFit } from "./availability-assist"
import { nextDate } from "./event-availability"
import type { Interval } from "./interval-union"
import { localParts } from "./workload-policy"
import { shiftEndsAt } from "./cancel-deadline"
import { roleLimitBreaches } from "./role-limit"
import { memberMayTake } from "./role-reservation"
import { shiftsClash } from "./shift-overlap"
import { materialTerms, type SwapShift } from "./shift-swaps"
import { spokenShift } from "./spoken-time"
import { shiftsTooYoungFor } from "./utils"

/**
 * Draft assignments and their publication (#1146, lot C; Codex design of 2026-10-30): the rules,
 * pure and Prisma-free. The server (src/lib/draft-assignments-server.ts) reads the rows under its
 * locks and asks these functions.
 *
 * - A draft (DraftAssignment) is an organiser's « this person on this shift », prepared apart from
 *   the registrations: it holds no place, sends nothing, and nothing public, no count, export,
 *   reminder or statistic reads it. A generated proposal (#1172) writes ordinary draft rows with
 *   `source: "proposal"`; nothing is ever published without an organiser.
 * - Review snapshot: what the organiser last looked at, the shift's material terms
 *   (`draftShiftTerms`) and the person's answer for the dates that can reach the shift
 *   (`availabilityStamp`, independent review: a change of another date leaves the draft alone). When
 *   either changes, the draft is « à revoir » and publication refuses it, even when the new answer
 *   fits (Codex): the organiser looks again, never a silent refresh. The acknowledgement stays bound
 *   to the answer's revision (owner decision 6, Codex): after any change, a draft outside the
 *   answer needs a new confirmation.
 * - Publication (`judgeDraftBatch`): the selected drafts, all or nothing. Hard refusals: the event
 *   archived, a shift cancelled or over, a review out of date, a person no longer an active member,
 *   already on the shift, overlapping hours (#986), the shift's capacity counting the batch, a poste
 *   reserved to tags the person lacks (#470), a minimum age not reached or unknown (#192), the limit
 *   per person of a poste (#466, no « add anyway » in a batch: Codex). An organiser may assign a
 *   poste « attribué par l'organisation uniquement » (#1145). Outside declared availability needs
 *   the draft's acknowledgement, bound to the current answer (owner decision 6). The workload
 *   protection (#1171) is judged by the server on each person's whole batch at once, never row by row.
 */

/** The workload evaluator's verdict codes come from the server; these are the batch's own. */
export type DraftProblemCode =
  | "event_archived"
  | "not_in_use"
  | "drafts_changed"
  | "shift_cancelled"
  | "shift_ended"
  | "shift_changed"
  | "availability_changed"
  | "person_gone"
  | "already_on_shift"
  | "overlap"
  | "capacity"
  | "reserved"
  | "min_age"
  | "birthdate_missing"
  | "role_limit"
  | "ack_missing"
  | "workload"

export type DraftProblem = {
  code: DraftProblemCode
  /** The full sentence, with the person's name: the server's refusal and the draft's dialog. */
  message: string
  /** The same without the person (the summary puts their name in its link), when one is named. */
  short?: string
  draftId?: string
  volunteerId?: string
  shiftId?: string
  details?: string[]
}

/** The cell's short marker of a problem: « Bloque la publication : places ». The sentence is in the summary. */
export const PROBLEM_MARKERS: Record<DraftProblemCode, string> = {
  event_archived: "événement archivé",
  not_in_use: "disponibilités non recueillies",
  drafts_changed: "brouillons modifiés",
  shift_cancelled: "créneau annulé",
  shift_ended: "créneau terminé",
  shift_changed: "créneau modifié",
  availability_changed: "disponibilités modifiées",
  person_gone: "plus membre actif",
  already_on_shift: "déjà inscrit·e",
  overlap: "chevauchement",
  capacity: "places",
  reserved: "poste réservé",
  min_age: "âge minimum",
  birthdate_missing: "date de naissance inconnue",
  role_limit: "limite du poste",
  ack_missing: "confirmation à donner",
  workload: "pauses et charge",
}

export const blockingMarker = (code: DraftProblemCode) => `Bloque la publication : ${PROBLEM_MARKERS[code]}`

/** At most this many drafts in one publication: a festival's planning, not a bulk import. */
export const MAX_PUBLISH_DRAFTS = 500

/** At most this many pending drafts on one event. */
export const MAX_EVENT_DRAFTS = 3000

/** Versioned, so a later change of what counts as « the shift changed » reads older drafts as stale. */
const TERMS_VERSION = "t1"

/** What a draft is about on its shift: its material terms (swap rules, #1174), versioned. */
export function draftShiftTerms(shift: SwapShift): string {
  return `${TERMS_VERSION}:${materialTerms(shift)}`
}

/** The answer's dates as stamped: « 2099-07-10=09:00-12:00,20:00-03:00 », « …=none » (not available), « …=? » (no answer). */
type StampAnswer = Pick<AnswerForFit, "requestId" | "revision"> & { days?: AnswerForFit["days"] }

const prevDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

/**
 * The civil dates whose answer can cover some instant of `interval` in `timeZone`: a range belongs
 * to the date it starts on and lasts less than 24 h (src/lib/availability-assist.ts), so an instant
 * of date D is covered by a range of D or of D-1. From the day before the start to the date of the
 * last minute.
 */
export function reachDates(interval: Interval, timeZone: string): string[] {
  const first = prevDate(localParts(interval.start, timeZone).date)
  const last = localParts(Math.max(interval.start, interval.end - 60_000), timeZone).date
  const dates: string[] = []
  for (let d = first; d <= last && dates.length < 10; d = nextDate(d)) dates.push(d)
  return dates
}

/**
 * The person's answer as the review saw it: « none » (never asked); with `reach`, the request and
 * the answer of the dates that can reach the shift (« a2:… »); without, the legacy request and
 * revision (drafts stamped before the independent review, compared the old way).
 */
export function availabilityStamp(answer: StampAnswer | null, reach?: { interval: Interval; timeZone: string }): string {
  if (!answer) return "none"
  if (!reach || !answer.days) return `${answer.requestId}:${answer.revision}`
  const byDate = new Map(answer.days.map((d) => [d.date, d]))
  const [before, ...own] = reachDates(reach.interval, reach.timeZone)
  // The day before reaches the shift only by a range past midnight, and by being answered or not
  // (declared or unknown minutes): its daytime ranges are left out, so changing them changes nothing.
  const prior = byDate.get(before)
  const words = [`${before}=${prior ? prior.ranges.filter((r) => r.endTime <= r.startTime).map((r) => `${r.startTime}-${r.endTime}`).sort().join(",") || "-" : "?"}`]
  for (const date of own) {
    const d = byDate.get(date)
    words.push(d ? `${date}=${d.ranges.map((r) => `${r.startTime}-${r.endTime}`).sort().join(",") || "none"}` : `${date}=?`)
  }
  return `${STAMP_VERSION}:${answer.requestId}:${words.join(";")}`
}

const STAMP_VERSION = "a2"

/** The stamp to compare a stored one with: the same form (per shift, or legacy). */
export function currentStampFor(stored: string, answer: StampAnswer | null, shift: { id: string; date: Date | string; startTime: string; endTime: string }, timeZone: string): string {
  if (stored.startsWith(`${STAMP_VERSION}:`)) return availabilityStamp(answer, { interval: shiftInterval(shift, timeZone), timeZone })
  return availabilityStamp(answer && { requestId: answer.requestId, revision: answer.revision })
}

/** The stamp a draft is written with now (creation, review, proposal). */
export function draftAvailabilityStamp(answer: StampAnswer | null, shift: { id: string; date: Date | string; startTime: string; endTime: string }, timeZone: string): string {
  return availabilityStamp(answer, { interval: shiftInterval(shift, timeZone), timeZone })
}

/** Set on drafts moved by a member merge (#600): never equal to a real answer, so they need a review. */
export const MERGE_STAMP = "merge"

export type ReviewState = { stale: boolean; shiftChanged: boolean; availabilityChanged: boolean }

/** Whether a draft's review is out of date: the shift or the answer changed since. */
export function draftReviewState(draft: { shiftTerms: string; availabilityStamp: string }, current: { shiftTerms: string; availabilityStamp: string }): ReviewState {
  const shiftChanged = draft.shiftTerms !== current.shiftTerms
  const availabilityChanged = draft.availabilityStamp !== current.availabilityStamp
  return { stale: shiftChanged || availabilityChanged, shiftChanged, availabilityChanged }
}

// ── The batch ─────────────────────────────────────────────────────────────────────────────────

export type BatchShift = SwapShift & { label: string; capacity: number; occupied: number; maxPerVolunteer?: number | null }

export type BatchHeld = { id: string; status: string; shift: BatchShift }

export type BatchPerson = {
  id: string
  firstName: string
  lastName: string
  organizationId: string | null
  active: boolean
  erasedAt: Date | string | null
  mergedIntoId: string | null
  birthDate: Date | string | null
  tags: string[]
  /** The person's live registrations on the event (any live status), with their shifts. */
  held: BatchHeld[]
  /** Their answer on the event, or null when they were never asked. */
  answer: AnswerForFit | null
}

export type BatchDraft = { id: string; shiftId: string; volunteerId: string; shiftTerms: string; availabilityStamp: string; ackKey: string | null }

export type BatchInput = {
  eventId: string
  organizationId: string
  /** The organisation's zone: when a shift ends (« déjà terminé »). */
  timeZone: string
  /** The event's frozen availability zone and dates (src/lib/availability-assist-data.ts). */
  availability: { timeZone: string; dates: readonly string[] }
  now: Date
  drafts: readonly BatchDraft[]
  shifts: ReadonlyMap<string, BatchShift>
  people: ReadonlyMap<string, BatchPerson>
  /** Roles reserved to tags (reservedRoles), from every live shift of the event. */
  reserved: ReadonlyMap<string, string[]>
  /** Limits per person and role (roleLimits), from every live shift of the event. */
  limits: ReadonlyMap<string, number>
}

const LIVE = new Set(["active", "waiting", "offered", "requested"])
const COMMITTED = new Set(["active", "requested"])

const day = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10))
const nameOf = (p: Pick<BatchPerson, "firstName" | "lastName">) => `${p.firstName} ${p.lastName}`.trim()
/** « Bar, Soir, samedi… » → itself; « le créneau… » → « Le créneau… ». */
const capFirst = (t: string) => t.charAt(0).toLocaleUpperCase("fr-FR") + t.slice(1)
/** « Bar, Soir, samedi 11 juillet, de 18h à 23h ». */
export const shiftWords = (s: Pick<BatchShift, "roleName" | "label" | "date" | "startTime" | "endTime">) => spokenShift({ roleName: s.roleName, label: s.label, date: day(s.date), startTime: s.startTime, endTime: s.endTime })

export type BatchVerdict = {
  /** Every hard refusal, the workload protection aside (the server adds its verdicts). */
  problems: DraftProblem[]
  /** The acknowledgements accepted, with their evidence, for the log (logAvailabilityAcks). */
  acknowledged: AckGiven[]
  /** Per person, the drafts that passed every check here: what the workload protection judges. */
  usable: Map<string, { draftId: string; shift: BatchShift }[]>
}

/** Every hard refusal of a batch, the workload protection aside. No problem: it may be published. Pure. */
export function judgeDraftBatch(input: BatchInput): BatchVerdict {
  const problems: DraftProblem[] = []
  const acknowledged: AckGiven[] = []
  const usableOf = new Map<string, { draftId: string; shift: BatchShift }[]>()
  const byPerson = new Map<string, BatchDraft[]>()
  for (const d of input.drafts) byPerson.set(d.volunteerId, [...(byPerson.get(d.volunteerId) ?? []), d])

  // Capacity, per shift: what already holds a place, plus every draft of the batch on it.
  const perShift = new Map<string, number>()
  for (const d of input.drafts) perShift.set(d.shiftId, (perShift.get(d.shiftId) ?? 0) + 1)
  for (const [shiftId, added] of perShift) {
    const s = input.shifts.get(shiftId)
    if (!s || s.status === "cancelled") continue
    const over = s.occupied + added - s.capacity
    if (over > 0) {
      // Who is drafted there (independent review): the organiser sees whom to move without searching.
      const names = input.drafts.filter((d) => d.shiftId === shiftId).map((d) => input.people.get(d.volunteerId)).flatMap((p) => (p ? [nameOf(p)] : [])).sort((a, b) => a.localeCompare(b, "fr"))
      problems.push({
        code: "capacity", shiftId,
        message: `${shiftWords(s)} : ${s.capacity} place${s.capacity > 1 ? "s" : ""}, ${s.occupied} déjà prise${s.occupied > 1 ? "s" : ""} et ${added} affectation${added > 1 ? "s" : ""} à publier${names.length > 0 ? ` (${names.join(", ")})` : ""}. Retirez-en ${over} ou augmentez la capacité.`,
      })
    }
  }

  for (const [volunteerId, drafts] of byPerson) {
    const person = input.people.get(volunteerId)
    if (!person || !person.active || person.erasedAt || person.mergedIntoId || person.organizationId !== input.organizationId) {
      const short = "n'est plus membre actif de l'organisation : retirez ses affectations en brouillon."
      problems.push({ code: "person_gone", volunteerId, message: person && nameOf(person) ? `${nameOf(person)} ${short}` : `Une personne ${short}`, short: `${short.charAt(0).toUpperCase()}${short.slice(1)}` })
      continue
    }
    const who = nameOf(person)
    const live = person.held.filter((h) => LIVE.has(h.status))
    const committed = live.filter((h) => COMMITTED.has(h.status) && h.shift.status !== "cancelled")
    const usable: { draft: BatchDraft; shift: BatchShift }[] = []

    for (const draft of drafts) {
      const shift = input.shifts.get(draft.shiftId)
      const at = { draftId: draft.id, volunteerId, shiftId: draft.shiftId }
      if (!shift || shift.eventId !== input.eventId || shift.status === "cancelled") {
        problems.push({ ...at, code: "shift_cancelled", message: `${who} : le créneau${shift ? ` ${shiftWords(shift)}` : ""} est annulé.`, short: `Le créneau${shift ? ` ${shiftWords(shift)}` : ""} est annulé.` })
        continue
      }
      if (shiftEndsAt(shift, input.timeZone).getTime() <= input.now.getTime()) {
        problems.push({ ...at, code: "shift_ended", message: `${who} : ${shiftWords(shift)} est déjà terminé. Ajoutez la personne à la main si c'est une correction après coup.`, short: capFirst(`${shiftWords(shift)} est déjà terminé. Ajoutez la personne à la main si c'est une correction après coup.`) })
        continue
      }
      const review = draftReviewState(draft, { shiftTerms: draftShiftTerms(shift), availabilityStamp: currentStampFor(draft.availabilityStamp, person.answer, shift, input.availability.timeZone) })
      if (review.shiftChanged) {
        problems.push({ ...at, code: "shift_changed", message: `${who} : ${shiftWords(shift)} a changé depuis le brouillon. Revoyez cette affectation.`, short: capFirst(`${shiftWords(shift)} a changé depuis le brouillon. Revoyez cette affectation.`) })
        continue
      }
      if (review.availabilityChanged) {
        problems.push({ ...at, code: "availability_changed", message: `${who} : ses disponibilités ont changé depuis le brouillon. Revoyez cette affectation.`, short: `Ses disponibilités ont changé depuis le brouillon. Revoyez cette affectation.` })
        continue
      }
      if (live.some((h) => h.shift.id === shift.id)) {
        problems.push({ ...at, code: "already_on_shift", message: `${who} est déjà inscrit·e sur ${shiftWords(shift)}.`, short: `Déjà inscrit·e sur ${shiftWords(shift)}.` })
        continue
      }
      if (shift.minAge != null) {
        if (!person.birthDate) {
          problems.push({ ...at, code: "birthdate_missing", message: `${who} : ${shiftWords(shift)} demande ${shift.minAge} ans au moins, et sa date de naissance n'est pas connue.`, short: capFirst(`${shiftWords(shift)} demande ${shift.minAge} ans au moins, et sa date de naissance n'est pas connue.`) })
          continue
        }
        if (shiftsTooYoungFor(person.birthDate, [{ minAge: shift.minAge, date: shift.date }]).length > 0) {
          problems.push({ ...at, code: "min_age", message: `${who} n'a pas l'âge minimum de ${shift.minAge} ans pour ${shiftWords(shift)}.`, short: `Âge minimum de ${shift.minAge} ans non atteint pour ${shiftWords(shift)}.` })
          continue
        }
      }
      const required = input.reserved.get(shift.roleName)
      if (required && !memberMayTake(person.tags, required)) {
        problems.push({ ...at, code: "reserved", message: `${who} : le poste « ${shift.roleName} » est réservé aux membres ${required.map((t) => `« ${t} »`).join(" ou ")}.`, short: `Le poste « ${shift.roleName} » est réservé aux membres ${required.map((t) => `« ${t} »`).join(" ou ")}.` })
        continue
      }
      usable.push({ draft, shift })
    }

    // Overlaps: with the missions held, and between the drafts of the batch (each pair once).
    for (let i = 0; i < usable.length; i++) {
      const { draft, shift } = usable[i]
      const held = committed.find((h) => shiftsClash(h.shift, shift))
      if (held) {
        problems.push({ draftId: draft.id, volunteerId, shiftId: shift.id, code: "overlap", message: `${who} : ${shiftWords(shift)} chevauche ${shiftWords(held.shift)}, déjà prévu.`, short: capFirst(`${shiftWords(shift)} chevauche ${shiftWords(held.shift)}, déjà prévu.`) })
        continue
      }
      for (let j = i + 1; j < usable.length; j++) {
        if (shiftsClash(usable[j].shift, shift)) {
          problems.push({ draftId: draft.id, volunteerId, shiftId: shift.id, code: "overlap", message: `${who} : ${shiftWords(shift)} chevauche ${shiftWords(usable[j].shift)}, deux affectations à publier.`, short: capFirst(`${shiftWords(shift)} chevauche ${shiftWords(usable[j].shift)}, deux affectations à publier.`) })
        }
      }
    }

    // The limit per person of a poste (#466): what is held, plus the whole batch.
    for (const b of roleLimitBreaches(usable.map((u) => u.shift), live.map((h) => h.shift), new Map(input.limits))) {
      problems.push({ volunteerId, code: "role_limit", message: `${who} : au plus ${b.max} créneau${b.max > 1 ? "x" : ""} « ${b.roleName} » par personne, ${b.held} déjà prévu${b.held > 1 ? "s" : ""} et ${b.asked} à publier.`, short: `Au plus ${b.max} créneau${b.max > 1 ? "x" : ""} « ${b.roleName} » par personne, ${b.held} déjà prévu${b.held > 1 ? "s" : ""} et ${b.asked} à publier.` })
    }

    // Outside declared availability: the draft's own acknowledgement, checked on the current answer.
    const acks = judgeAvailabilityAcks({
      eventId: input.eventId,
      volunteerId,
      shifts: usable.map((u) => ({ id: u.shift.id, date: u.shift.date, startTime: u.shift.startTime, endTime: u.shift.endTime, name: u.shift.label && u.shift.label !== u.shift.roleName ? `${u.shift.roleName} · ${u.shift.label}` : u.shift.roleName })),
      answer: person.answer,
      eventDates: input.availability.dates,
      timeZone: input.availability.timeZone,
      acks: usable.map((u) => u.draft.ackKey).filter((k): k is string => !!k),
    })
    for (const m of acks.missing) {
      const u = usable.find((x) => x.shift.id === m.shiftId)!
      problems.push({ draftId: u.draft.id, volunteerId, shiftId: m.shiftId, code: "ack_missing", message: `${who} a indiqué ne pas être disponible pendant ${shiftWords(u.shift)} : confirmez cette affectation dans le brouillon pour la publier.`, short: `A indiqué ne pas être disponible pendant ${shiftWords(u.shift)} : confirmez cette affectation dans le brouillon pour la publier.` })
    }
    acknowledged.push(...acks.acknowledged)
    usableOf.set(volunteerId, usable.map((u) => ({ draftId: u.draft.id, shift: u.shift })))
  }
  return { problems, acknowledged, usable: usableOf }
}

/** The refusal's lead sentence: how many problems, and that nothing was published (the list follows, never repeated here). */
export function publicationRefusalText(problems: readonly DraftProblem[]): string {
  const n = problems.length
  return `Rien n'a été publié : ${n} point${n > 1 ? "s" : ""} à régler.`
}

/** When the selection sent no longer matches the drafts (edited, discarded or published meanwhile). */
export const DRAFTS_CHANGED_TEXT = "Les brouillons ont changé depuis l'ouverture de la page : rechargez-la avant de publier. Rien n'a été publié."

/** The same idempotency key sent again for another selection. */
export const PUBLICATION_KEY_REUSED_TEXT = "Cette publication a déjà été faite avec d'autres affectations : rechargez la page. Rien n'a été publié."

/** The canonical form of a selection, hashed by the server to tell a retry from another request. */
export function selectionCanonical(drafts: readonly { id: string; revision: number }[]): string {
  return [...drafts].map((d) => `${d.id}:${d.revision}`).sort().join(",")
}
