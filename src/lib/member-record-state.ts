// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { RETENTION_DAYS } from "./retention"
import { localToday } from "./volunteer-hours"
import { ERASED_DISPLAY_NAME } from "./member-erasure"

/**
 * What a member record is, beyond active/inactive (#1014): an ordinary record, a record absorbed
 * by a merge (#600, kept RETENTION_DAYS.mergedMemberTombstone days then deleted by the daily
 * cleanup), or a record whose personal data was erased (#516, kept without identity so its
 * registrations still count in staffing and hours). Both special kinds are archives, not people
 * the organiser can reactivate: the members list shows them under their own filter, with one
 * sentence saying why they are there.
 *
 * Pure (no Prisma import): computed server-side, rendered by MembersManager (a client component).
 */

export type MemberRecordState =
  | { kind: "ordinary" }
  | {
      kind: "merged"
      /** Id of the record that holds the person now (end of the merge chain), null if unknown. */
      keptId: string | null
      /** Its display name, null if unknown (already deleted, or another organisation). */
      keptName: string | null
      /** Local calendar day ("YYYY-MM-DD", organisation time zone) the record is deleted on. */
      deletionDay: string
    }
  | {
      kind: "erased"
      /** Local calendar day ("YYYY-MM-DD", organisation time zone) of the erasure. */
      erasedDay: string
    }

export type RecordStateSource = {
  id: string
  firstName: string
  lastName: string
  mergedIntoId: string | null
  mergedAt: Date | null
  erasedAt: Date | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The day an absorbed record is deleted: its merge date plus the retention delay, as a calendar
 * day in the organisation's time zone. The cleanup removes it at its first nightly run once that
 * delay has passed (src/app/api/cron/cleanup/route.ts, same constant), hence « à partir du » in
 * the copy: the UI never promises the exact night, nor depends on the cron schedule.
 */
export function mergedRecordDeletionDay(mergedAt: Date, timeZone: string): string {
  return localToday(new Date(mergedAt.getTime() + RETENTION_DAYS.mergedMemberTombstone * DAY_MS), timeZone)
}

/** Follows `mergedIntoId` (capped, like event-log-read.ts) to the record that holds the person now. */
export function resolveMergeTarget(
  startId: string,
  byId: ReadonlyMap<string, Pick<RecordStateSource, "id" | "firstName" | "lastName" | "mergedIntoId">>,
): { id: string; name: string } | null {
  let current = byId.get(startId)?.mergedIntoId ?? null
  const seen = new Set([startId])
  for (let hops = 0; current && hops < 5; hops++) {
    if (seen.has(current)) return null
    seen.add(current)
    const row = byId.get(current)
    if (!row) return null
    if (!row.mergedIntoId) return { id: row.id, name: `${row.firstName} ${row.lastName}`.trim() }
    current = row.mergedIntoId
  }
  return null
}

export function memberRecordState(
  member: RecordStateSource,
  byId: ReadonlyMap<string, Pick<RecordStateSource, "id" | "firstName" | "lastName" | "mergedIntoId">>,
  timeZone: string,
): MemberRecordState {
  if (member.mergedIntoId) {
    const target = resolveMergeTarget(member.id, byId)
    return {
      kind: "merged",
      keptId: target?.id ?? null,
      keptName: target?.name || null,
      // A tombstone always has mergedAt (set in the same update); fall back to "today" defensively.
      deletionDay: mergedRecordDeletionDay(member.mergedAt ?? new Date(), timeZone),
    }
  }
  if (member.erasedAt) return { kind: "erased", erasedDay: localToday(member.erasedAt, timeZone) }
  return { kind: "ordinary" }
}

/** Merged and erased records: kept apart from the ordinary members (own filter, not counted). */
export function isArchivedRecord(state: MemberRecordState): boolean {
  return state.kind !== "ordinary"
}

/** Name shown in the list for a record: an absorbed record has no name left. */
export function recordDisplayName(state: MemberRecordState, firstName: string, lastName: string): string {
  if (state.kind === "merged") return "Fiche fusionnée"
  if (state.kind === "erased") return ERASED_DISPLAY_NAME
  return `${firstName} ${lastName}`.trim()
}

/**
 * Who a row action or a page title is about, unique per row (« Activité de … », « Modifier … »):
 * an absorbed record by the record it went into, an erased one by its erasure day, so such rows
 * rarely share an accessible name (two records merged into the same person, or erased the same
 * day, still do; the row's identity cell, read first, tells them apart).
 */
export function recordSubject(state: MemberRecordState, firstName: string, lastName: string, fmtDay: (iso: string) => string): string {
  if (state.kind === "merged") return state.keptName ? `la fiche fusionnée dans ${state.keptName}` : "la fiche fusionnée"
  if (state.kind === "erased") return `la fiche effacée le ${fmtDay(state.erasedDay)}`
  return `${firstName} ${lastName}`.trim()
}

/** « Activité de Marie Dupont », « Activité de la fiche fusionnée dans Marie Dupont ». */
export function activityTitle(subject: string): string {
  return `Activité de ${subject}`
}

/** The erased row's two clauses, shown separated by a decorative « · » (#1014). */
export const ERASED_ROW = { status: "Données effacées", reason: "gardée pour l'historique (effectifs et heures)" } as const

export type MergedSentence = {
  /** Text before the kept record's name (or the whole lead when it is unknown). */
  lead: string
  /** The kept record's name, rendered as a link to it; null when unknown. */
  keptName: string | null
  /** Text between the name and the date. */
  beforeDate: string
  /** The deletion day, formatted. */
  date: string
  /** Text after the date. */
  end: string
}

/** The row's explanation: « Fusionnée dans <nom> · supprimée automatiquement à partir du <date> ». */
export function mergedRowSentence(state: Extract<MemberRecordState, { kind: "merged" }>, fmtDay: (iso: string) => string): MergedSentence {
  return {
    lead: state.keptName ? "Fusionnée dans " : "Fusionnée dans une autre fiche",
    keptName: state.keptName,
    beforeDate: " · supprimée automatiquement à partir du ",
    date: fmtDay(state.deletionDay),
    end: "",
  }
}

/**
 * The member page's sentence: « Cette fiche a été fusionnée dans <nom>. Elle est gardée 30 jours
 * après la fusion, puis supprimée automatiquement à partir du <date>. »
 */
export function mergedPageSentence(state: Extract<MemberRecordState, { kind: "merged" }>, fmtDay: (iso: string) => string): MergedSentence {
  return {
    lead: state.keptName ? "Cette fiche a été fusionnée dans " : "Cette fiche a été fusionnée dans une autre fiche",
    keptName: state.keptName,
    beforeDate: `. Elle est gardée ${RETENTION_DAYS.mergedMemberTombstone} jours après la fusion, puis supprimée automatiquement à partir du `,
    date: fmtDay(state.deletionDay),
    end: ".",
  }
}

/** A sentence as plain text (tests, titles). */
export function sentenceText(s: MergedSentence): string {
  return `${s.lead}${s.keptName ?? ""}${s.beforeDate}${s.date}${s.end}`
}

/** Plain-text row explanation, null for an ordinary record. */
export function recordRowText(state: MemberRecordState, fmtDay: (iso: string) => string): string | null {
  if (state.kind === "erased") return `${ERASED_ROW.status} · ${ERASED_ROW.reason}`
  if (state.kind === "merged") return sentenceText(mergedRowSentence(state, fmtDay))
  return null
}

/** Second sentence of the erased notice (MemberEraseAction), why the record stays (#1014). */
export const ERASED_PAGE_TEXT =
  "Elle reste pour l'historique : ses inscriptions comptent toujours dans les effectifs et les heures, sans nom."

/** "2026-11-14" → "14 novembre 2026" (a local calendar day, no time zone shift). */
export function formatRecordDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })
}
