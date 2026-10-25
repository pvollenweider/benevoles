// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The « Jour J » board keeps itself current while it is open (#1141): it polls the board route
 * while the page is visible and online, and merges each answer with the marks made on this phone.
 * Pure (no React, no Prisma): when to poll, which answer to keep, what to say.
 *
 * Ordering. One counter (`tick`) numbers every poll when it is sent and every check-in when its
 * answer arrives. A poll answer older than the last one applied is dropped (answers can arrive out
 * of order). A local mark stays over the board until a poll sent after the mark's answer comes
 * back: that poll has seen the mark, or something newer made elsewhere, and wins. A row whose
 * action is still in flight keeps what it showed when tapped, whatever a poll says meanwhile.
 */

import { personName, shiftName, type DayOfBoard, type DayOfGroup, type DayOfPerson, type DayOfShift } from "./day-of"

/** Between two polls while the page is visible and the last poll went through. */
export const DAY_OF_POLL_MS = 25_000
/** Longest wait between two tries after repeated failures. */
export const DAY_OF_POLL_MAX_MS = 120_000
/** Back on the page: refresh at once, unless the last try is more recent than this. */
export const DAY_OF_RESUME_MIN_MS = 5_000

export type SyncStatus = "ok" | "offline" | "error" | "expired"

/**
 * Milliseconds until the next poll, or null for none: hidden page or no network (the return to
 * the page or of the network triggers one), expired session (a poll cannot fix it). Doubles with
 * each failure in a row, up to DAY_OF_POLL_MAX_MS.
 */
export function nextPollDelay(s: { visible: boolean; online: boolean; status: SyncStatus; failures: number }): number | null {
  if (!s.visible || !s.online || s.status === "expired") return null
  const factor = 2 ** Math.min(Math.max(0, s.failures), 10)
  return Math.min(DAY_OF_POLL_MS * factor, DAY_OF_POLL_MAX_MS)
}

/** Whether coming back to the page (or the network coming back) calls for a poll right now. */
export function shouldSyncOnResume(lastAttemptAt: number | null, now: number, status: SyncStatus): boolean {
  if (status === "expired") return false
  if (status !== "ok") return true
  return lastAttemptAt === null || now - lastAttemptAt >= DAY_OF_RESUME_MIN_MS
}

/**
 * What a poll answer means for the page. A request that never got an answer is « offline » only
 * when the browser says it has no network; otherwise (server unreachable, timeout) a plain failure.
 * Failures and 5xx are retried; 401/403 are not.
 */
export function syncStatusOf(r: { network: true; online: boolean } | { status: number }): SyncStatus {
  if ("network" in r) return r.online ? "error" : "offline"
  if (r.status >= 200 && r.status < 300) return "ok"
  if (r.status === 401 || r.status === 403) return "expired"
  return "error"
}

/** A check-in made on this phone: `at` the tick of its answer, null while the action is in flight. */
export type LocalMark = { checkedInAt: string | null; at: number | null }
export type LocalMarks = Record<string, LocalMark>

/** The check-in shown for a person: this phone's mark if any, else the board's. */
export function shownCheckIn(p: Pick<DayOfPerson, "registrationId" | "checkedInAt">, marks: LocalMarks): string | null {
  const m = marks[p.registrationId]
  return m ? m.checkedInAt : p.checkedInAt
}

/** Whether a poll answer sent at `sentAt` comes after the last applied one (`appliedAt`). */
export function isFreshAnswer(sentAt: number, appliedAt: number): boolean {
  return sentAt > appliedAt
}

/**
 * The marks left once a poll sent at `sentAt` is applied: the ones answered before it was sent are
 * now in the board (or overtaken elsewhere) and go; in-flight ones and later ones stay. The same
 * object when nothing goes, so React skips the update.
 */
export function marksAfterPoll(marks: LocalMarks, sentAt: number): LocalMarks {
  let changed = false
  const next: LocalMarks = {}
  for (const [id, m] of Object.entries(marks)) {
    if (m.at !== null && m.at < sentAt) changed = true
    else next[id] = m
  }
  return changed ? next : marks
}

const peopleOf = (b: DayOfBoard): Map<string, DayOfPerson> => {
  const all = new Map<string, DayOfPerson>()
  const add = (groups: DayOfGroup[]) => { for (const g of groups) for (const sh of g.shifts) for (const p of sh.people) all.set(p.registrationId, p) }
  add(b.inProgress)
  add(b.upcoming)
  add(b.earlier)
  return all
}

export type BoardChanges = { arrived: number; undone: number; roster: boolean }

/**
 * What changed for the person using the page between what was shown (`before` with `marksBefore`)
 * and what is shown after a poll (`after` with `marksAfter`): presences marked or undone elsewhere,
 * and whether people appeared on or left the listed shifts. Shifts moving from « à venir » to « en
 * cours » with time are not a change: the page shows them where they are.
 */
export function boardChanges(before: DayOfBoard, marksBefore: LocalMarks, after: DayOfBoard, marksAfter: LocalMarks): BoardChanges {
  const was = peopleOf(before)
  const now = peopleOf(after)
  let arrived = 0
  let undone = 0
  let roster = was.size !== now.size
  for (const [id, p] of now) {
    const old = was.get(id)
    if (!old) { roster = true; continue }
    const a = shownCheckIn(old, marksBefore) !== null
    const b = shownCheckIn(p, marksAfter) !== null
    if (!a && b) arrived += 1
    if (a && !b) undone += 1
  }
  return { arrived, undone, roster }
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** Said after a poll that changed something; null when nothing did (polls are silent then). */
export function changesAnnouncement(c: BoardChanges): string | null {
  const parts: string[] = []
  if (c.arrived) parts.push(`${plural(c.arrived, "personne marquée présente", "personnes marquées présentes")}`)
  if (c.undone) parts.push(`${plural(c.undone, "présence annulée", "présences annulées")}`)
  if (c.roster) parts.push("la liste des personnes attendues a changé")
  return parts.length ? `Liste mise à jour : ${parts.join(", ")}.` : null
}

/** The visible line about freshness. `syncedAt` « 14h05 », the last successful read. */
export function syncStatusText(status: SyncStatus, syncedAt: string): string {
  switch (status) {
    case "ok": return `Mis à jour à ${syncedAt}.`
    case "offline": return `Pas de connexion : liste de ${syncedAt}. Elle se mettra à jour au retour du réseau.`
    case "error": return `La mise à jour n'a pas abouti : liste de ${syncedAt}. Nouvel essai automatique.`
    case "expired": return "Votre session a expiré : rechargez la page pour vous reconnecter."
  }
}

/** Said when the freshness changes kind (a lost or regained connection), never for a repeat. */
export function statusAnnouncement(before: SyncStatus, after: SyncStatus, syncedAt: string): string | null {
  if (before === after) return null
  switch (after) {
    case "ok": return `Connexion rétablie. Liste mise à jour à ${syncedAt}.`
    case "offline": return `Connexion perdue. La liste affichée date de ${syncedAt}.`
    case "error": return `La liste n'a pas pu être mise à jour. Elle date de ${syncedAt}.`
    case "expired": return syncStatusText("expired", syncedAt)
  }
}

/**
 * The freshness shown and voiced: one failed poll on a busy site network is common, so a plain
 * failure shows only from the second one in a row. No network and an expired session show at once.
 */
export function shownStatus(status: SyncStatus, failures: number): SyncStatus {
  return status === "error" && failures < 2 ? "ok" : status
}

/** Changes seen by polls and not yet said: added up until they may be said. */
export function addChanges(a: BoardChanges, b: BoardChanges): BoardChanges {
  return { arrived: a.arrived + b.arrived, undone: a.undone + b.undone, roster: a.roster || b.roster }
}

export const NO_CHANGES: BoardChanges = { arrived: 0, undone: 0, roster: false }

/** Quiet time after any message before poll changes may be said: the user's own outcome comes first. */
export const CHANGES_QUIET_MS = 3_000
/** At most one message about changes made elsewhere in this time. */
export const CHANGES_EVERY_MS = 60_000

/**
 * Whether changes made elsewhere may be said now. They come last: never while the user's own
 * action is in flight or while they type a search, never right after another message (which it
 * would cut off), and at most once a minute, the changes in between added up.
 */
export function mayAnnounceChanges(s: { now: number; lastAnnouncedAt: number | null; lastChangesAt: number | null; busy: boolean }): boolean {
  if (s.busy) return false
  if (s.lastAnnouncedAt !== null && s.now - s.lastAnnouncedAt < CHANGES_QUIET_MS) return false
  return s.lastChangesAt === null || s.now - s.lastChangesAt >= CHANGES_EVERY_MS
}

/** Where a registration sits on a board: its person and shift, or null when it is not listed. */
export function findOnBoard(b: DayOfBoard, registrationId: string): { person: DayOfPerson; shift: DayOfShift } | null {
  for (const groups of [b.inProgress, b.upcoming, b.earlier]) {
    for (const g of groups) for (const shift of g.shifts) {
      const person = shift.people.find((p) => p.registrationId === registrationId)
      if (person) return { person, shift }
    }
  }
  return null
}

/**
 * The focused row's person left the board with a poll (cancelled, moved to another shift beyond
 * today): what to say as the focus moves to their shift or the page title. Null when still listed.
 */
export function leftBoardAnnouncement(before: DayOfBoard, after: DayOfBoard, registrationId: string): string | null {
  if (findOnBoard(after, registrationId)) return null
  const was = findOnBoard(before, registrationId)
  if (!was) return null
  return `${personName(was.person)} ne figure plus parmi les personnes attendues, ${shiftName(was.shift)}.`
}
