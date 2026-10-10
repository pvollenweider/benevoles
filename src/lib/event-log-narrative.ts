// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Turns EventLog entries into readable French. Two levels:
 *   - `describeEntry`: one line, used in the explorer list.
 *   - `narrateChain`: a causal chain (from getCausalChain) as a short story, following
 *     causedByLogId links only — it never infers a connection from timing/proximity, so a
 *     chain that happens to have gaps just reads as a sequence of separate sentences instead
 *     of inventing a "which caused" that isn't backed by data.
 */
import type { EventLogEntry, ShiftLabel } from "./event-log-read"
import { APP_TIME_ZONE } from "./time-zone"
import { listingChangeLabel } from "./event-visibility"

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" })


function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "boolean") return v ? "oui" : "non"
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return dateFmt.format(new Date(v))
  return String(v)
}

/** One line per changed field, e.g. "capacité : 3 → 4". Field names get a French label when known. */
const FIELD_LABELS: Record<string, string> = {
  // Anonymisation of a past event (#813): counts only, never a name.
  registrations: "inscriptions anonymisées",
  answers: "réponses aux questions",
  invites: "invitations",
  sectorLeaders: "responsables de secteur",
  capacity: "capacité",
  status: "statut",
  date: "date",
  startTime: "heure de début",
  endTime: "heure de fin",
  roleName: "poste",
  label: "libellé",
  waitlistEnabled: "liste d'attente",
  requiresApproval: "sur validation",
  shiftId: "créneau",
  source: "origine",
  comment: "commentaire",
  title: "titre",
  publicStatus: "statut de publication",
  startDate: "date de début",
  endDate: "date de fin",
  publicInstructions: "instructions publiques",
  remindersEnabled: "rappels automatiques",
  requirePhone: "téléphone obligatoire",
  isListed: "visibilité",
  audience: "destinataires",
  recipients: "nombre de destinataires",
  subject: "objet",
  resent: "envois relancés",
  personalLink: "lien personnel",
}

/**
 * `shiftLabels` resolves the `shiftId` field's raw id to a readable label (see
 * event-log-read.ts's resolveShiftLabels) — e.g. "créneau : — → Bar · 25/06 18:15–19:00" instead
 * of a raw cuid. Falls back to the id itself when not found (shift deleted, or map not passed),
 * which doubles as a de facto "debug mode": pass no map and ids show as-is.
 *
 * A `shiftId` entry with `from === to` is dropped from the diff list on purpose: some write
 * paths (e.g. a cancellation) record it unchanged, purely so `describeEntry`/`narrateChain` can
 * name the shift in their sentence (see `shiftPhrase` below) — it would be misleading to also
 * show it here as if it were a real change.
 */
export function describeChanges(changes: EventLogEntry["changes"], shiftLabels?: Record<string, ShiftLabel>): string[] {
  if (!changes) return []
  return Object.entries(changes)
    .filter(([field, { from, to }]) => field !== "shiftId" || from !== to)
    .map(([field, { from, to }]) => {
      const label = FIELD_LABELS[field] ?? field
      const fmt = (v: unknown) =>
        field === "shiftId" && typeof v === "string" ? shiftLabels?.[v]?.compact ?? v
        : field === "isListed" ? listingChangeLabel(v)
        : fmtValue(v)
      return `${label} : ${fmt(from)} → ${fmt(to)}`
    })
}

/** The shift a Registration entry's `changes.shiftId` refers to, in prose form, or "". */
function shiftPhrase(entry: Pick<EventLogEntry, "changes">, shiftLabels?: Record<string, ShiftLabel>): string {
  const field = entry.changes?.shiftId
  const shiftId = field ? (typeof field.to === "string" ? field.to : field.from) : undefined
  if (typeof shiftId !== "string") return ""
  const prose = shiftLabels?.[shiftId]?.prose
  return prose ? ` pour le créneau ${prose}` : ""
}

/**
 * One sentence per action written to EventLog. Every code logged anywhere must have one:
 * src/lib/__tests__/log-action-labels.test.ts scans the source and fails on a missing entry (#704).
 */
export const ACTION_VERB: Record<string, (actor: string) => string> = {
  "shift.created": (a) => `${a} a créé ce créneau`,
  "shift.updated": (a) => `${a} a modifié ce créneau`,
  "shift.cancelled": (a) => `${a} a annulé ce créneau`,
  "registration.created": (a) => `${a} a enregistré une inscription`,
  "registration.updated": (a) => `${a} a modifié l'inscription`,
  "registration.cancelled": (a) => `${a} a annulé une inscription`,
  "registration.restored": (a) => `${a} a rétabli une inscription annulée`,
  "registration.waitlist_joined": (a) => `${a} a rejoint la liste d'attente`,
  "registration.waitlist_offered": () => "une place s'est libérée et a été proposée",
  "registration.waitlist_confirmed": (a) => `${a} a confirmé sa place`,
  "registration.checked_in": (a) => `${a} a marqué la personne présente`,
  "registration.check_in_undone": (a) => `${a} a annulé la présence`,
  "registration.requested": (a) => `${a} a demandé une inscription`,
  "registration.accepted": (a) => `${a} a accepté la demande d'inscription`,
  "registration.refused": (a) => `${a} a refusé la demande d'inscription`,
  "event.published": (a) => `${a} a publié l'événement`,
  "event.unpublished": () => "l'événement est repassé en brouillon, son dernier créneau ayant été annulé",
  "event.archived": (a) => `${a} a archivé l'événement`,
  "event.updated": (a) => `${a} a modifié les paramètres de l'événement`,
  "event.links_regenerated": (a) => `${a} a régénéré les liens personnels de l'événement`,
  "event.personal_data_anonymized": () => "les données personnelles des bénévoles ont été anonymisées, 3 ans après la fin de l'événement",
  "message.sent": (a) => `${a} a envoyé un message`,
  "message.resent": (a) => `${a} a relancé les emails non distribués d'un message`,
  "question.created": (a) => `${a} a ajouté une question`,
  "question.updated": (a) => `${a} a modifié une question`,
  "question.removed": (a) => `${a} a retiré une question`,
  "memberinvite.sent": (a) => `${a} a envoyé une invitation`,
  "memberinvite.declined": (a) => `${a} a indiqué ne pas être disponible pour cet événement`,
  "eventpage.created": (a) => `${a} a créé une page`,
  "eventpage.updated": (a) => `${a} a modifié une page`,
  "eventpage.deleted": (a) => `${a} a supprimé une page`,
  "sectorleader.added": (a) => `${a} a désigné une personne responsable de secteur`,
  "sectorleader.removed": (a) => `${a} a retiré une personne responsable de secteur`,
  "eventmilestone.created": (a) => `${a} a ajouté un jalon`,
  "eventmilestone.updated": (a) => `${a} a modifié un jalon`,
  "eventmilestone.deleted": (a) => `${a} a supprimé un jalon`,
  // Not a real event: a synthetic snapshot of current state for entities that predate logging
  // (see the baseline endpoint). Worded as an observation, never as something that "happened".
  "shift.baseline": () => "état initial observé (avant le suivi du journal)",
  "registration.baseline": () => "état initial observé (avant le suivi du journal)",
  "event.baseline": () => "état initial observé (avant le suivi du journal)",
  "memberinvite.baseline": () => "état initial observé (avant le suivi du journal)",
}

/** Actions whose sentence benefits from naming which shift it's about (registration.* mostly). */
const SHIFT_AWARE_ACTIONS = new Set([
  "registration.created", "registration.cancelled", "registration.restored", "registration.waitlist_joined",
  "registration.waitlist_offered", "registration.waitlist_confirmed", "registration.baseline",
  "registration.checked_in", "registration.check_in_undone",
  "registration.requested", "registration.accepted", "registration.refused",
])

function buildSentence(entry: Pick<EventLogEntry, "action" | "actorLabel" | "changes">, shiftLabels?: Record<string, ShiftLabel>): string {
  const verb = ACTION_VERB[entry.action]
  const base = verb ? verb(entry.actorLabel) : `${entry.actorLabel} : ${entry.action}`
  const suffix = SHIFT_AWARE_ACTIONS.has(entry.action) ? shiftPhrase(entry, shiftLabels) : ""
  return base + suffix
}

/** One-line description of a single entry, for the explorer list. */
export function describeEntry(entry: Pick<EventLogEntry, "action" | "actorLabel" | "changes">, shiftLabels?: Record<string, ShiftLabel>): string {
  const sentence = buildSentence(entry, shiftLabels)
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

/**
 * Renders a causal chain (oldest first, as returned by getCausalChain) as connected French
 * sentences. Consecutive entries linked by causedByLogId get a connector phrase; entries with
 * no causal link to the previous one start a new sentence with their own timestamp instead of
 * being glued on with an invented "then". Days and times are in `timeZone`, the organization's
 * (#344): this also runs in the browser, whose own zone may differ.
 */
export function narrateChain(chain: EventLogEntry[], shiftLabels?: Record<string, ShiftLabel>, timeZone: string = APP_TIME_ZONE): string {
  if (chain.length === 0) return ""

  const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone, day: "numeric", month: "long" })
  const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
  const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" })

  const byId = new Map(chain.map((e) => [e.id, e]))
  const parts: string[] = []
  let lastDay = ""

  chain.forEach((entry, i) => {
    const day = dayFmt.format(entry.createdAt)
    const sentence = buildSentence(entry, shiftLabels)
    const causedByPrevious = i > 0 && entry.causedByLogId != null && byId.get(entry.causedByLogId)?.id === chain[i - 1].id

    if (causedByPrevious) {
      // Continues the previous sentence with a colon rather than folding case: the sentence
      // may start with a person's name (proper noun), which a lowercase-and-splice would break.
      parts[parts.length - 1] += entry.action === "registration.waitlist_offered"
        ? ` — ce qui a libéré une place, proposée à ${entry.actorLabel === "Système" ? "la personne suivante en liste d'attente" : entry.actorLabel}.`
        : ` — ${sentence}.`
      lastDay = day
      return
    }

    const withTime = day !== lastDay
      ? `Le ${dateTimeFmt.format(entry.createdAt)} : ${sentence}.`
      : `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} à ${timeFmt.format(entry.createdAt)}.`
    parts.push(withTime)
    lastDay = day
  })

  return parts.join(" ")
}
