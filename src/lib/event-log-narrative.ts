/**
 * Turns EventLog entries into readable French. Two levels:
 *   - `describeEntry`: one line, used in the explorer list.
 *   - `narrateChain`: a causal chain (from getCausalChain) as a short story, following
 *     causedByLogId links only — it never infers a connection from timing/proximity, so a
 *     chain that happens to have gaps just reads as a sequence of separate sentences instead
 *     of inventing a "which caused" that isn't backed by data.
 */
import type { EventLogEntry, ShiftLabel } from "./event-log-read"

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" })
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "boolean") return v ? "oui" : "non"
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return dateFmt.format(new Date(v))
  return String(v)
}

/** One line per changed field, e.g. "capacité : 3 → 4". Field names get a French label when known. */
const FIELD_LABELS: Record<string, string> = {
  capacity: "capacité",
  status: "statut",
  date: "date",
  startTime: "heure de début",
  endTime: "heure de fin",
  roleName: "poste",
  label: "libellé",
  waitlistEnabled: "liste d'attente",
  shiftId: "créneau",
  source: "origine",
  comment: "commentaire",
  title: "titre",
  publicStatus: "statut de publication",
  startDate: "date de début",
  endDate: "date de fin",
  publicInstructions: "instructions publiques",
  remindersEnabled: "rappels automatiques",
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
      const fmt = (v: unknown) => (field === "shiftId" && typeof v === "string" ? shiftLabels?.[v]?.compact ?? v : fmtValue(v))
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

const ACTION_VERB: Record<string, (actor: string) => string> = {
  "shift.created": (a) => `${a} a créé ce créneau`,
  "shift.updated": (a) => `${a} a modifié ce créneau`,
  "shift.cancelled": (a) => `${a} a annulé ce créneau`,
  "registration.created": (a) => `${a} s'est inscrit·e`,
  "registration.updated": (a) => `${a} a modifié l'inscription`,
  "registration.cancelled": (a) => `${a} s'est désinscrit·e`,
  "registration.waitlist_joined": (a) => `${a} s'est mis·e en liste d'attente`,
  "registration.waitlist_offered": () => "une place s'est libérée et a été proposée",
  "registration.waitlist_confirmed": (a) => `${a} a confirmé sa place`,
  "event.published": (a) => `${a} a publié l'événement`,
  "event.archived": (a) => `${a} a archivé l'événement`,
  "event.updated": (a) => `${a} a modifié les paramètres de l'événement`,
  "memberinvite.sent": (a) => `${a} a envoyé une invitation`,
  // Not a real event: a synthetic snapshot of current state for entities that predate logging
  // (see the baseline endpoint). Worded as an observation, never as something that "happened".
  "shift.baseline": () => "état initial observé (avant le suivi du journal)",
  "registration.baseline": () => "état initial observé (avant le suivi du journal)",
  "event.baseline": () => "état initial observé (avant le suivi du journal)",
  "memberinvite.baseline": () => "état initial observé (avant le suivi du journal)",
}

/** Actions whose sentence benefits from naming which shift it's about (registration.* mostly). */
const SHIFT_AWARE_ACTIONS = new Set([
  "registration.created", "registration.cancelled", "registration.waitlist_joined",
  "registration.waitlist_offered", "registration.waitlist_confirmed", "registration.baseline",
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
 * being glued on with an invented "then".
 */
export function narrateChain(chain: EventLogEntry[], shiftLabels?: Record<string, ShiftLabel>): string {
  if (chain.length === 0) return ""

  const byId = new Map(chain.map((e) => [e.id, e]))
  const parts: string[] = []
  let lastDay = ""

  chain.forEach((entry, i) => {
    const day = dateFmt.format(entry.createdAt)
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
      : `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} à ${entry.createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`
    parts.push(withTime)
    lastDay = day
  })

  return parts.join(" ")
}
