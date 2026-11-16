// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The « Jour J » board keeps itself current while it is open (#1141): it polls the board route
 * while the page is visible and online, and merges each answer with the marks made on this phone.
 * Pure (no React, no Prisma): when to poll, which answer to keep, what to say.
 *
 * Ordering. One counter (`tick`) numbers every poll when it is sent and every attendance action
 * (check-in, absence, their undo) when its answer arrives. A poll answer older than the last one
 * applied is dropped (answers can arrive out of order). A local mark stays over the board until a poll sent after the mark's answer comes
 * back: that poll has seen the mark, or something newer made elsewhere, and wins. A row whose
 * action is still in flight keeps what it showed when tapped, whatever a poll says meanwhile.
 */

import { leftShiftSentence, personName, shiftName, type DayOfBoard, type DayOfGroup, type DayOfPerson, type DayOfShift } from "./day-of"
import { attendanceStateOf, type AttendanceState } from "./attendance-state"

/** Between two polls while the page is visible and the last poll went through. */
export const DAY_OF_POLL_MS = 25_000
/** Longest wait between two tries after repeated failures. */
export const DAY_OF_POLL_MAX_MS = 120_000
/** Back on the page: refresh at once, unless the last try is more recent than this. */
export const DAY_OF_RESUME_MIN_MS = 5_000
/** A row whose shown state just changed keeps its buttons inert this long (#1141). */
export const SETTLE_MS = 600

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

/** What a row shows: the attendance state, and the check-in instant when present. */
export type ShownAttendance = { state: AttendanceState; checkedInAt: string | null }

/**
 * An attendance action made on this phone (#399, #1141): the state it left (expected, present,
 * absent or left before the end, with the check-in instant), `at` the tick of its answer, null
 * while the action is in flight. An in-flight mark keeps the mark it replaced (`prev`), put back
 * if the action fails.
 */
export type LocalMark = ShownAttendance & { at: number | null; prev?: LocalMark }
export type LocalMarks = Record<string, LocalMark>

type Marked = Pick<DayOfPerson, "registrationId" | "checkedInAt" | "attendanceStatus">

/** What is shown for a person: this phone's mark if any, else the board's. */
export function shownAttendance(p: Marked, marks: LocalMarks): ShownAttendance {
  const m = marks[p.registrationId]
  return m ? { state: m.state, checkedInAt: m.checkedInAt } : { state: attendanceStateOf(p), checkedInAt: p.checkedInAt }
}

/** The state shown for a person: this phone's mark if any, else the board's. */
export function shownState(p: Marked, marks: LocalMarks): AttendanceState {
  return shownAttendance(p, marks).state
}

/** The check-in shown for a person: this phone's mark if any, else the board's. */
export function shownCheckIn(p: Marked, marks: LocalMarks): string | null {
  return shownAttendance(p, marks).checkedInAt
}

/** Starts an action on a row: it shows `shown` (what was on screen when tapped) until the answer. */
export function pinMark(marks: LocalMarks, id: string, shown: ShownAttendance): LocalMarks {
  const prev = marks[id]
  const pin = { state: shown.state, checkedInAt: shown.checkedInAt, at: null }
  return { ...marks, [id]: prev ? { ...pin, prev } : pin }
}

/**
 * The action failed: the row goes back to what it showed before, an earlier mark of this phone
 * included (a check-in answered but not yet seen by a poll is not lost).
 */
export function releasePin(marks: LocalMarks, id: string): LocalMarks {
  const m = marks[id]
  if (!m || m.at !== null) return marks
  const next = { ...marks }
  if (m.prev) next[id] = m.prev
  else delete next[id]
  return next
}

/**
 * The action was answered: the row takes the state the server gave, at the tick of that answer.
 * Used for a change that went through and for one that changed nothing (#1141): the server then
 * returns the state recorded meanwhile on another device, and writing it here, in place of the
 * pin, before any read is sent again, keeps a later poll from counting it as a change made
 * elsewhere and saying « Liste mise à jour » about what the person was just told.
 */
export function answerMark(marks: LocalMarks, id: string, server: ShownAttendance, at: number): LocalMarks {
  return { ...marks, [id]: { state: server.state, checkedInAt: server.checkedInAt, at } }
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

export type BoardChanges = { arrived: number; undone: number; absent: number; absenceUndone: number; leftEarly: number; departureUndone: number; roster: boolean }

/**
 * What changed for the person using the page between what was shown (`before` with `marksBefore`)
 * and what is shown after a poll (`after` with `marksAfter`): presences, absences and departures
 * marked or undone elsewhere, and whether people appeared on or left the listed shifts. Four
 * states (#1141): someone present here and absent there is one presence undone and one absence
 * marked, never a silent change. A presence turning into a departure is one departure only, and
 * the departure turning back into a presence one undone departure only: neither is said as a
 * presence undone or marked. Shifts moving from « à venir » to « en cours » with time are not a
 * change: the page shows them where they are.
 */
export function boardChanges(before: DayOfBoard, marksBefore: LocalMarks, after: DayOfBoard, marksAfter: LocalMarks): BoardChanges {
  const was = peopleOf(before)
  const now = peopleOf(after)
  const c = { arrived: 0, undone: 0, absent: 0, absenceUndone: 0, leftEarly: 0, departureUndone: 0 }
  let roster = was.size !== now.size
  for (const [id, p] of now) {
    const old = was.get(id)
    if (!old) { roster = true; continue }
    const a = shownState(old, marksBefore)
    const b = shownState(p, marksAfter)
    if (a === b) continue
    if (a === "present" && b !== "left_early") c.undone += 1
    if (a === "left_early") c.departureUndone += 1
    if (a === "absent") c.absenceUndone += 1
    if (b === "present" && a !== "left_early") c.arrived += 1
    if (b === "left_early") c.leftEarly += 1
    if (b === "absent") c.absent += 1
  }
  return { ...c, roster }
}

/**
 * The rows whose shown state changed between a read and another (a poll, or the answer to an
 * action): the board settles them before their second button may act again (#1141). A row present
 * on only one side is a roster change, not a settle.
 */
export function changedShownRows(before: DayOfBoard, marksBefore: LocalMarks, after: DayOfBoard, marksAfter: LocalMarks): string[] {
  const was = peopleOf(before)
  const now = peopleOf(after)
  const ids: string[] = []
  for (const [id, p] of now) {
    const old = was.get(id)
    if (!old) continue
    if (shownState(old, marksBefore) !== shownState(p, marksAfter)) ids.push(id)
  }
  return ids
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** Said after a poll that changed something; null when nothing did (polls are silent then). */
export function changesAnnouncement(c: BoardChanges): string | null {
  const parts: string[] = []
  if (c.arrived) parts.push(`${plural(c.arrived, "personne marquée présente", "personnes marquées présentes")}`)
  if (c.undone) parts.push(`${plural(c.undone, "présence annulée", "présences annulées")}`)
  if (c.absent) parts.push(`${plural(c.absent, "personne marquée absente", "personnes marquées absentes")}`)
  if (c.absenceUndone) parts.push(`${plural(c.absenceUndone, "absence annulée", "absences annulées")}`)
  if (c.leftEarly) parts.push(`${plural(c.leftEarly, "personne partie avant la fin", "personnes parties avant la fin")}`)
  if (c.departureUndone) parts.push(`${plural(c.departureUndone, "départ annulé", "départs annulés")}`)
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
  return {
    arrived: a.arrived + b.arrived,
    undone: a.undone + b.undone,
    absent: a.absent + b.absent,
    absenceUndone: a.absenceUndone + b.absenceUndone,
    leftEarly: a.leftEarly + b.leftEarly,
    departureUndone: a.departureUndone + b.departureUndone,
    roster: a.roster || b.roster,
  }
}

export const NO_CHANGES: BoardChanges = { arrived: 0, undone: 0, absent: 0, absenceUndone: 0, leftEarly: 0, departureUndone: 0, roster: false }

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
  return leftShiftSentence(personName(was.person), shiftName(was.shift))
}

/**
 * Whether the sentence shown in a person's row after an action that changed nothing still
 * describes the row once a read is applied (#1141): the person is still on the same shift and
 * shows the same state. Anything else (state changed here or elsewhere, moved, left) and the
 * sentence goes, so it never stays beside a row it no longer explains.
 */
export function noticeStillHolds(before: DayOfBoard, marksBefore: LocalMarks, after: DayOfBoard, marksAfter: LocalMarks, registrationId: string): boolean {
  const was = findOnBoard(before, registrationId)
  const now = findOnBoard(after, registrationId)
  if (!was || !now || was.shift.id !== now.shift.id) return false
  return shownState(was.person, marksBefore) === shownState(now.person, marksAfter)
}
