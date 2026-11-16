// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
"use client"

import { useEffect, useEffectEvent, useId, useRef, useState } from "react"
import { announce } from "@/lib/announce"
import { describeBulkFailure } from "@/lib/form-errors"
import { focusFirstAvailable, isFocusDropped } from "@/lib/focus-return"
import { statusBoxClass } from "@/lib/status-message"
import {
  DAY_OF_WINDOW_HOURS,
  PRIMARY_ACTION,
  addShiftToBoard,
  attendanceAnnouncement,
  answerFor,
  attendanceRequest,
  leftShift,
  dayOfBoardUrl,
  filterGroups,
  groupHeading,
  missingLine,
  personName,
  presenceLine,
  searchAnnouncement,
  shiftCounts,
  shiftHours,
  shiftName,
  telHref,
  unchangedAnnouncement,
  type DayOfBoard as Board,
  type DayOfGroup,
  type DayOfPerson,
  type DayOfShift,
} from "@/lib/day-of"
import { needCreatedAnnouncement } from "@/lib/day-of-need"
import type { RegistrationWindow } from "@/lib/registration-window"
import { fold } from "@/lib/text-fold"
import { ATTENDANCE_TRANSITIONS, type AttendanceTransition } from "@/lib/attendance-state"
import AddNeedPanel from "./AddNeedPanel"
import {
  NO_CHANGES,
  addChanges,
  answeredAttendance,
  answerMark,
  boardChanges,
  changedShownRows,
  changesAnnouncement,
  isFreshAnswer,
  leftBoardAnnouncement,
  marksAfterPoll,
  mayAnnounceChanges,
  nextPollDelay,
  noticeStillHolds,
  pinMark,
  releasePin,
  shouldSyncOnResume,
  shownAttendance,
  shownState,
  shownStatus,
  statusAnnouncement,
  syncStatusOf,
  syncStatusText,
  SETTLE_MS,
  type BoardChanges,
  type LocalMarks,
  type SyncStatus,
} from "@/lib/day-of-sync"

/** Typing in the search box: the count is announced once typing has paused this long. */
const SEARCH_ANNOUNCE_MS = 500
/** A board read that takes longer than this counts as failed. */
const SYNC_TIMEOUT_MS = 15_000
/** A check-in or an absence without an answer after this long is reported as possibly not received. */
const ACTION_TIMEOUT_MS = 20_000
/** Changes made elsewhere wait this long after the last keystroke in the search box. */
const TYPING_QUIET_MS = 2_000

/** The clock, read in handlers and timers only. */
const nowMs = () => Date.now()

/** Says `text` in the live region and notes when, so changes made elsewhere wait their turn. */
function sayAt(lastAnnouncedAt: { current: number | null }, set: (text: string) => void, text: string) {
  lastAnnouncedAt.current = nowMs()
  announce(set, text)
}

type Props = {
  eventId: string
  board: Board
  /** "YYYY-MM-DD" in the organization's zone. */
  today: string
  /** « 14h05 »: when the server built this board. */
  refreshedAt: string
  /** The page's « Secteur » filter (#1170, `secteur` param value, "" for all): every read keeps it. */
  sector?: string
  /** The event's existing postes, for the « Ajouter un besoin » field (#1304). */
  roles?: string[]
  timeZone: string
  /** The registration window (#1304): says why a send is blocked instead of showing the list. */
  registrationWindow: RegistrationWindow
  /** The event's active sector ids, to tell whether the page's filter hides the new shift. */
  activeSectorIds?: string[]
  /**
   * The board rendered for a front-desk account (#1142): « Ajouter un besoin » is not rendered
   * (and its links with it), and a 403 means the access to this event is over, not a session
   * problem: `onAccessEnded` is called so the caller unmounts this board.
   */
  frontDesk?: boolean
  /** The grant is no longer live (403): the caller unmounts this board and focuses its message. */
  onAccessEnded?: () => void
}

type Snapshot = { board: Board; today: string; refreshedAt: string }
/** Why the board is read: the timer or a return to the page, « Actualiser », or an action that changed nothing. */
type SyncKind = "poll" | "manual" | "after_action"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const actionWhat: Record<AttendanceTransition, string> = {
  check_in: "Présence", undo_check_in: "Présence", mark_absent: "Absence", undo_absent: "Absence",
  mark_left_early: "Départ", undo_left_early: "Départ",
}
const outlineButton = "border border-blue-600 text-blue-700 bg-white hover:bg-blue-50"
const telClass = `inline-flex items-center min-h-11 px-3 rounded-xl border border-gray-300 bg-white text-sm font-medium text-blue-700 underline underline-offset-2 hover:bg-gray-50 ${focusRing}`

/**
 * « Jour J » (#561): the shifts running now and in the next hours, who is expected, arrived,
 * absent or gone before the end, one tap to record it (#1141). Each action goes through the same
 * route as the registrations list (#399). One live region says each outcome; a row's first button
 * stays in place whatever its label, so the focus does too. The second button is one of two keyed
 * nodes: « Marquer absent » for an expected person, « Marquer parti avant la fin » for a present
 * one. Once pressed it goes, and the focus moves to the first one. Two distinct nodes, never one
 * whose label changes: a poll that turns « Marquer absent » into the departure action under a
 * focused button would otherwise let a second tap record something else.
 *
 * Two devices never overwrite each other: the server changes a row only from the state the press
 * started from. When it changed nothing, the row takes the state the server returned, nothing is
 * retried, and one sentence says so (also shown in the row).
 *
 * The board keeps itself current (#1141): it reads the board route every 25 s while the page is
 * visible and online, at once on coming back to the page or to the network, never by reloading the
 * page. Search, focus, an action in flight and the marks made here survive each read (merge and
 * ordering rules in day-of-sync.ts). Polls are silent unless something changed elsewhere.
 */
export default function DayOfBoard({ eventId, board: initialBoard, today: initialToday, refreshedAt: initialRefreshedAt, sector = "", roles = [], timeZone, registrationWindow, activeSectorIds = [], frontDesk = false, onAccessEnded }: Props) {
  const [snap, setSnap] = useState<Snapshot>({ board: initialBoard, today: initialToday, refreshedAt: initialRefreshedAt })
  const { board, today, refreshedAt } = snap
  const [query, setQuery] = useState("")
  // Actions made here that the board may not show yet: registration id → mark (day-of-sync.ts).
  const [marks, setMarks] = useState<LocalMarks>({})
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState("")
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("ok")
  const [failures, setFailures] = useState(0)
  // Only « Actualiser » changes its own label: a background read leaves the button as it is.
  const [manualBusy, setManualBusy] = useState(false)
  // Re-arms the poll timer after each read, whatever its outcome.
  const [attempts, setAttempts] = useState(0)
  // Only read in effects (no markup depends on them), so the server's guess never mismatches.
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden")
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false)
  // A failed toggle, shown in the person's row. `seq` remounts the alert, so the same message
  // twice in a row is voiced again.
  const [error, setError] = useState<{ registrationId: string; text: string; seq: number } | null>(null)
  const errorSeq = useRef(0)
  // An action that changed nothing because another device was first: the sentence said in the live
  // region, shown in the person's row for who does not hear it. Plain text, no live role.
  const [notice, setNoticeState] = useState<{ registrationId: string; text: string } | null>(null)
  const noticeRef = useRef(notice)
  // Rows whose shown state just changed: their buttons stay inert for a moment (#1141).
  const [settling, setSettling] = useState<Set<string>>(new Set())
  const settlingRef = useRef<Set<string>>(new Set())
  const settlingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const setNotice = (next: { registrationId: string; text: string } | null) => {
    if (next === noticeRef.current) return
    noticeRef.current = next
    setNoticeState(next)
  }
  /**
   * The row's state just changed (an answer or a poll): both of its buttons are inert for
   * SETTLE_MS, so a second tap cannot run a transition on a button whose meaning changed.
   */
  const markSettling = (ids: string[]) => {
    if (ids.length === 0) return
    for (const id of ids) {
      settlingRef.current.add(id)
      const previous = settlingTimers.current.get(id)
      if (previous) clearTimeout(previous)
      settlingTimers.current.set(id, setTimeout(() => {
        settlingTimers.current.delete(id)
        settlingRef.current.delete(id)
        setSettling((current) => {
          if (!current.has(id)) return current
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }, SETTLE_MS))
    }
    setSettling((current) => {
      const next = new Set(current)
      for (const id of ids) next.add(id)
      return next
    })
  }
  useEffect(() => () => {
    for (const timer of settlingTimers.current.values()) clearTimeout(timer)
    settlingTimers.current.clear()
    settlingRef.current.clear()
  }, [])

  // « Plus tôt aujourd'hui » opened or closed by hand, kept while a search forces it open.
  const [earlierOpen, setEarlierOpen] = useState(false)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const searchId = useId()

  // The merge reads and writes these between awaits: refs hold the latest, state renders them.
  const snapRef = useRef(snap)
  const marksRef = useRef(marks)
  const statusRef = useRef<{ status: SyncStatus; failures: number }>({ status: "ok", failures: 0 })
  const updateMarks = (fn: (m: LocalMarks) => LocalMarks) => {
    const next = fn(marksRef.current)
    if (next === marksRef.current) return
    marksRef.current = next
    setMarks(next)
  }
  // Ordering (day-of-sync.ts): every read and every check-in answer takes the next tick.
  const tick = useRef(0)
  const appliedAt = useRef(0)
  const lastAttemptAt = useRef<number | null>(null)
  const pollInFlight = useRef(false)
  // Announcements: the user's own outcomes first, changes made elsewhere last and added up.
  const lastAnnouncedAt = useRef<number | null>(null)
  const lastChangesAt = useRef<number | null>(null)
  const unsaid = useRef<BoardChanges>(NO_CHANGES)
  const typingUntil = useRef(0)
  const say = (text: string) => sayAt(lastAnnouncedAt, setStatus, text)
  // Actions in flight, counted at once (state lags a render). A read answering meanwhile is not
  // applied: it could drop the row the action needs for its outcome; it is read again after.
  const actionsInFlight = useRef(0)
  const deferred = useRef<SyncKind | null>(null)
  // The row that had the focus when a read replaced the board, to find it again after the render.
  const focusAfterSync = useRef<{ registrationId: string | null; shiftId: string; leftText: string | null } | null>(null)

  const stateOf = (p: DayOfPerson) => shownState(p, marks)

  // « Ajouter un besoin » (#1304): the created shift joins the board at once, before any poll, and
  // the screen says where it is (listed, counted later, or hidden by the search / sector filter).
  // The tick marks every read sent before as stale, so a poll already in flight cannot drop it.
  function onNeedCreated(shift: DayOfShift, sectorId: string | null): string {
    const now = new Date()
    const result = addShiftToBoard(snapRef.current.board, shift, now, timeZone)
    const next = { ...snapRef.current, board: result.board, today: shift.date }
    appliedAt.current = ++tick.current
    snapRef.current = next
    setSnap(next)
    const counts = shiftCounts(shift, () => "expected")
    const q = fold(query.trim())
    const hiddenBySearch = q !== "" && !fold(`${shift.roleName} ${shift.label}`).includes(q)
    const inActiveSector = sectorId !== null && activeSectorIds.includes(sectorId)
    const hiddenBySector = sector === "autres" ? inActiveSector : sector !== "" && sectorId !== sector
    const text = needCreatedAnnouncement({
      name: shiftName(shift),
      hours: shiftHours(shift),
      missing: counts.missing,
      phase: result.phase,
      laterCount: result.board.laterCount,
      hiddenBySearch,
      hiddenBySector,
    })
    say(text)
    return text
  }

  const inProgress = filterGroups(board.inProgress, query)
  const upcoming = filterGroups(board.upcoming, query)
  const earlier = filterGroups(board.earlier, query)
  const searching = query.trim() !== ""

  const announcedQuery = useRef(query)
  const resultText = searchAnnouncement([...inProgress, ...upcoming, ...earlier])
  useEffect(() => {
    if (announcedQuery.current === query) return
    const timer = setTimeout(() => {
      announcedQuery.current = query
      sayAt(lastAnnouncedAt, setStatus, resultText)
    }, SEARCH_ANNOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, resultText])

  function setFreshness(next: SyncStatus, nextFailures: number, syncedAt: string, quiet: boolean): boolean {
    const before = shownStatus(statusRef.current.status, statusRef.current.failures)
    const after = shownStatus(next, nextFailures)
    statusRef.current = { status: next, failures: nextFailures }
    setSyncStatus(next)
    setFailures(nextFailures)
    const text = statusAnnouncement(before, after, syncedAt)
    if (text && !quiet) say(text)
    return text !== null
  }

  async function sync(kind: SyncKind) {
    const sentAt = ++tick.current
    lastAttemptAt.current = nowMs()
    if (kind === "poll") pollInFlight.current = true
    if (kind === "manual") setManualBusy(true)
    const finish = () => {
      if (kind === "poll") pollInFlight.current = false
      if (kind === "manual") setManualBusy(false)
      setAttempts((n) => n + 1)
    }
    const fail = (next: SyncStatus) => {
      finish()
      // A newer read already went through: this older failure says nothing about now.
      if (!isFreshAnswer(sentAt, appliedAt.current)) return
      // End of a front-desk access (#1142): the caller unmounts the board, its timers and its
      // freshness line rather than keeping a list that will never be current again.
      if (next === "access_ended") { onAccessEnded?.(); return }
      appliedAt.current = sentAt
      // A failure of « Actualiser » shows at once: the person asked, the old time must not pass for an answer.
      const nextFailures = kind === "manual" ? Math.max(2, statusRef.current.failures + 1) : statusRef.current.failures + 1
      const voiced = setFreshness(next, nextFailures, snapRef.current.refreshedAt, false)
      // « Actualiser » always answers, even when the failure is not new.
      if (kind === "manual" && !voiced) say(statusAnnouncement("ok", next, snapRef.current.refreshedAt) ?? syncStatusText(next, snapRef.current.refreshedAt))
    }
    let res: Response
    try {
      // A read that hangs (weak site network) would hold the next ones: given up after a while.
      res = await fetch(dayOfBoardUrl(eventId, sector), { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(SYNC_TIMEOUT_MS) })
    } catch {
      fail(syncStatusOf({ network: true, online: typeof navigator === "undefined" || navigator.onLine !== false }))
      return
    }
    if (!res.ok) { fail(syncStatusOf({ status: res.status }, { forbiddenIsAccessEnded: frontDesk })); return }
    let next: Snapshot
    try {
      next = (await res.json()) as Snapshot
      if (!next?.board || typeof next.refreshedAt !== "string") throw new Error("shape")
    } catch {
      fail("error")
      return
    }
    finish()
    if (!isFreshAnswer(sentAt, appliedAt.current)) return
    if (actionsInFlight.current > 0) {
      const rank: Record<SyncKind, number> = { after_action: 0, poll: 1, manual: 2 }
      if (!deferred.current || rank[kind] > rank[deferred.current]) deferred.current = kind
      return
    }
    appliedAt.current = sentAt

    const before = snapRef.current
    const marksBefore = marksRef.current
    const marksAfter = marksAfterPoll(marksBefore, sentAt)
    const changes = boardChanges(before.board, marksBefore, next.board, marksAfter)
    // The sentence shown in a row goes once the read changes what that row shows.
    const shownNotice = noticeRef.current
    if (shownNotice && !noticeStillHolds(before.board, marksBefore, next.board, marksAfter, shownNotice.registrationId)) setNotice(null)

    // The focused row, found again after the render even if its card moved to another section.
    // A person's row, or anywhere else in a shift card (its title, its contact's phone).
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const card = active?.closest<HTMLElement>("[data-shift-id]")
    if (card?.dataset.shiftId) {
      const registrationId = active?.closest<HTMLElement>("[data-registration-id]")?.dataset.registrationId ?? null
      const leftText = registrationId && kind !== "after_action" ? leftBoardAnnouncement(before.board, next.board, registrationId) : null
      focusAfterSync.current = { registrationId, shiftId: card.dataset.shiftId, leftText }
    }

    // Nothing new: the board is left as it is (no list re-rendered), so a screen reader's position stays.
    if (JSON.stringify(before) !== JSON.stringify(next)) {
      snapRef.current = next
      setSnap(next)
    } else {
      focusAfterSync.current = null
    }
    // A row whose shown state changed here must settle before its second button may act again.
    const settleIds = changedShownRows(before.board, marksBefore, next.board, marksAfter)
    updateMarks(() => marksAfter)
    markSettling(settleIds)

    const reconnected = setFreshness("ok", 0, next.refreshedAt, kind === "after_action")
    const leftText = focusAfterSync.current?.leftText ?? null
    if (kind === "after_action") return
    if (kind === "manual") {
      const said = changesAnnouncement(addChanges(unsaid.current, changes))
      unsaid.current = NO_CHANGES
      if (!reconnected && !leftText) say(said ? said.replace(/^Liste mise à jour/, `Liste mise à jour à ${next.refreshedAt}`) : `Liste mise à jour à ${next.refreshedAt}.`)
      return
    }
    if (reconnected || leftText) { unsaid.current = NO_CHANGES; return }
    unsaid.current = addChanges(unsaid.current, changes)
    const now = nowMs()
    const busy = actionsInFlight.current > 0 || now < typingUntil.current
    const text = changesAnnouncement(unsaid.current)
    if (text && mayAnnounceChanges({ now, lastAnnouncedAt: lastAnnouncedAt.current, lastChangesAt: lastChangesAt.current, busy })) {
      unsaid.current = NO_CHANGES
      lastChangesAt.current = now
      say(text)
    }
  }

  // After a read changed the board: if the focused row's button went (its card moved to another
  // section, or the person left the board), focus it again, else its shift, else « Plus tôt
  // aujourd'hui », else the page title. Hidden targets (a closed <details>) are skipped.
  // After an action too (`marks`): « Marquer absent » goes once the person is absent or present,
  // so a focus left on it drops to the page; it moves to the row's first button (#1141).
  useEffect(() => {
    const target = focusAfterSync.current
    focusAfterSync.current = null
    if (!target || !isFocusDropped(document.activeElement)) return
    focusFirstAvailable([
      () => (target.registrationId ? buttons.current.get(target.registrationId) : null),
      () => document.getElementById(`dayof-shift-${target.shiftId}`),
      () => document.getElementById("dayof-earlier-summary"),
      () => document.getElementById("page-heading"),
    ])
    if (target.leftText) sayAt(lastAnnouncedAt, setStatus, target.leftText)
  }, [snap, marks])

  const onPoll = useEffectEvent(() => {
    if (pollInFlight.current) return
    void sync("poll")
  })
  const onResume = useEffectEvent(() => {
    if (pollInFlight.current || document.visibilityState === "hidden" || navigator.onLine === false) return
    if (shouldSyncOnResume(lastAttemptAt.current, nowMs(), statusRef.current.status)) void sync("poll")
  })
  const onOffline = useEffectEvent(() => {
    // Signed out stays the message: a network drop changes nothing to what the person must do.
    if (statusRef.current.status === "expired") return
    setFreshness("offline", statusRef.current.failures + 1, snapRef.current.refreshedAt, false)
  })

  // Visible and online, as the browser says; coming back to either reads the board at once.
  useEffect(() => {
    const onVisibility = () => {
      const isVisible = document.visibilityState !== "hidden"
      setVisible(isVisible)
      if (isVisible) onResume()
    }
    const goOnline = () => { setOnline(true); onResume() }
    const goOffline = () => { setOnline(false); onOffline() }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  // The next read: re-armed after each one, paused while hidden, offline or signed out.
  useEffect(() => {
    const delay = nextPollDelay({ visible, online, status: syncStatus, failures })
    if (delay === null) return
    const timer = setTimeout(onPoll, delay)
    return () => clearTimeout(timer)
  }, [visible, online, syncStatus, failures, attempts])

  async function act(person: DayOfPerson, shift: DayOfShift, transition: AttendanceTransition) {
    const id = person.registrationId
    if (pending.has(id) || settlingRef.current.has(id)) return
    const shownBefore = shownAttendance(person, marksRef.current)
    const plan = ATTENDANCE_TRANSITIONS[transition]
    // The row changed since it was rendered: this press is about a state it no longer shows.
    if (plan.from !== shownBefore.state) return
    const name = personName(person)
    setNotice(null)
    setPending((prev) => new Set(prev).add(id))
    actionsInFlight.current += 1
    // While the action is in flight, the row keeps what it showed when tapped, whatever a read says.
    updateMarks((m) => pinMark(m, id, shownBefore))
    const unpin = () => updateMarks((m) => releasePin(m, id))
    const done = () => {
      setPending((prev) => { const next = new Set(prev); next.delete(id); return next })
      actionsInFlight.current -= 1
      // A read that answered during the action is read again now.
      const again = deferred.current
      if (actionsInFlight.current === 0 && again) {
        deferred.current = null
        // A background read waits for the page to be visible and online again (the return reads).
        if (again === "manual" || (document.visibilityState !== "hidden" && navigator.onLine !== false)) void sync(again)
      }
    }
    const { url, body } = attendanceRequest(eventId, id, transition, shift.id)
    const what = `${actionWhat[transition]} de ${name}`
    const fail = (text: string) => {
      errorSeq.current += 1
      setError({ registrationId: id, text, seq: errorSeq.current })
      lastAnnouncedAt.current = nowMs() // the alert is voiced: changes made elsewhere wait
      unpin()
      done()
    }
    let res: Response
    try {
      // Bounded: a hung action would hold the board's refresh (reads wait for actions to settle).
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(ACTION_TIMEOUT_MS) })
    } catch {
      const f = describeBulkFailure({ network: true }, what)
      fail(`${f.title}. ${f.message} Réessayez dans un instant.`)
      return
    }
    if (!res.ok) {
      // A front-desk access that ended is not a row error to retry: the caller unmounts the board.
      // 401 keeps its meaning (the session expired) and its row alert for both roles.
      if (frontDesk && res.status === 403) {
        done()
        onAccessEnded?.()
        return
      }
      const f = describeBulkFailure({ status: res.status, body: await res.json().catch(() => null) }, what)
      fail(`${f.title}. ${f.message}`)
      return
    }
    const result = (await res.json().catch(() => ({}))) as { changedIds?: string[]; results?: unknown }
    const own = answerFor(result.results, id)
    const changed = own ? own.changed : (result.changedIds ?? []).includes(id)
    setError(null)
    // WebKit leaves a tapped button unfocused (focus on <main>): put it back on the row's first button.
    const btn = buttons.current.get(id)
    if (btn && isFocusDropped(document.activeElement)) btn.focus()
    // « Marquer absent » leaves the row with this render: the effect above moves a dropped focus.
    focusAfterSync.current = { registrationId: id, shiftId: shift.id, leftText: null }
    const countsNow = () => shiftCounts(shift, (p) => shownState(p, marksRef.current))
    if (!changed) {
      // Recorded meanwhile from another device, no longer confirmed, or no longer on this shift
      // (`moved`, `gone`). The row takes the state the server returned, written before `done()`
      // may send a read again: that read then finds nothing new for this row, and no « Liste mise
      // à jour » repeats what is said here. A person who left the shift has no state to take:
      // the row goes back to what it showed and the silent read below removes it.
      if (own?.state && !leftShift(own)) {
        const server = { state: own.state, checkedInAt: own.checkedInAt }
        updateMarks((m) => answerMark(m, id, server, ++tick.current))
        // The row takes a state recorded elsewhere: let it settle before anything else is pressed.
        if (own.state !== shownBefore.state) markSettling([id])
      } else unpin()
      done()
      // Said once, and shown in the row for who does not hear the live region.
      const text = unchangedAnnouncement(name, own, shiftName(shift), countsNow())
      setNotice({ registrationId: id, text })
      say(text)
      void sync("after_action")
      return
    }
    // The answer wins over any read sent before it; the next read sent after it confirms it.
    // The server's arrival is kept for a departure and for the presence its undo restores, never
    // dropped because the destination is not « présent » (#1141).
    updateMarks((m) => answerMark(m, id, answeredAttendance(plan.to, own?.checkedInAt, new Date().toISOString()), ++tick.current))
    markSettling([id])
    done()
    say(attendanceAnnouncement(name, transition, shiftName(shift), countsNow()))
  }

  // Plain render functions, not components declared here: a component type created on each
  // render would remount every card, and the button just toggled would lose the focus.
  function renderShiftCard(shift: DayOfShift) {
    const headingId = `dayof-shift-${shift.id}`
    const counts = shiftCounts(shift, stateOf)
    const missing = missingLine(counts)
    const contactPhone = shift.contactPhone?.trim()
    const contactName = shift.contactName?.trim()
    return (
      <li key={shift.id} data-shift-id={shift.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
        <div>
          <h4 id={headingId} tabIndex={-1} className="text-base font-semibold text-gray-900 break-words focus:outline-none">{shiftName(shift)}</h4>
          <p className="text-sm text-gray-700">{shiftHours(shift)}</p>
        </div>
        <p className="text-sm text-gray-800">
          <strong className="font-semibold">{presenceLine(counts)}.</strong>
          {missing && <span className="text-amber-900"> {missing}</span>}
        </p>
        {(contactName || contactPhone) && (
          <p className="text-sm text-gray-700 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Contact du créneau{contactName ? ` : ${contactName}` : ""}</span>
            {contactPhone && (
              <a href={telHref(contactPhone)} aria-label={`Appeler ${contactName ? `${contactName}, contact du créneau,` : "le contact du créneau"} au ${contactPhone}`} className={telClass}>
                {contactPhone}
              </a>
            )}
          </p>
        )}
        {shift.people.length > 0 && (
          // role="list": Safari/VoiceOver drops list semantics once Tailwind removes the bullets.
          <ul role="list" aria-label={`Personnes attendues, ${shiftName(shift)}`} className="divide-y divide-gray-100 border-t border-gray-100">
            {shift.people.map((p) => {
              const state = stateOf(p)
              const busy = pending.has(p.registrationId)
              const inert = busy || settling.has(p.registrationId)
              const name = personName(p)
              const primary = PRIMARY_ACTION[state]
              return (
                <li key={p.registrationId} data-registration-id={p.registrationId} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="font-medium text-gray-900 break-words">{name}</p>
                    <p className="text-sm">
                      {/* Never by colour alone: each of the four states has its word, and a sign for the
                          three recorded ones. « Parti avant la fin » uses the blue pair of « Complet »,
                          never the amber of an absence (a fact, not a fault) nor the red of an error. */}
                      {state === "present" && <span className="inline-block rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium"><span aria-hidden="true">✓ </span>Présent</span>}
                      {state === "absent" && <span className="inline-block rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-xs font-medium"><span aria-hidden="true">✗ </span>Absent</span>}
                      {state === "left_early" && <span className="inline-block rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium"><span aria-hidden="true">→ </span>Parti avant la fin</span>}
                      {state === "expected" && <span className="inline-block rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">Pas encore marqué</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.phone && (
                      <a href={telHref(p.phone)} aria-label={`Appeler ${name} au ${p.phone}`} className={telClass}>{p.phone}</a>
                    )}
                    {/* The row's first button never unmounts: « Marquer présent », then the undo of
                        what was recorded. The focus stays on it through every change. */}
                    <button
                      type="button"
                      ref={(el) => { if (el) buttons.current.set(p.registrationId, el); else buttons.current.delete(p.registrationId) }}
                      onClick={() => act(p, shift, primary.transition)}
                      // Named with the person, the visible label first (2.5.3). An action, not a
                      // toggle state: no aria-pressed, the label says what a press does.
                      aria-label={`${primary.label}, ${name}`}
                      aria-disabled={inert || undefined}
                      className={`min-h-11 min-w-11 px-4 rounded-xl text-sm font-medium transition-colors aria-disabled:opacity-50 ${state === "expected" ? "bg-blue-600 text-white hover:bg-blue-700" : outlineButton}`}
                    >
                      {primary.label}
                    </button>
                    {/* Two keyed second buttons, never one node with a ternary label (#1141): a poll
                        that changes the row drops the old node and the focus, instead of silently
                        turning a focused « Marquer absent » into the departure action. */}
                    {state === "expected" && (
                      <button
                        key="absent"
                        type="button"
                        onClick={() => act(p, shift, "mark_absent")}
                        aria-label={`Marquer absent, ${name}`}
                        aria-disabled={inert || undefined}
                        className={`min-h-11 min-w-11 px-4 rounded-xl text-sm font-medium transition-colors aria-disabled:opacity-50 ${outlineButton}`}
                      >
                        Marquer absent
                      </button>
                    )}
                    {state === "present" && (
                      <button
                        key="left"
                        type="button"
                        onClick={() => act(p, shift, "mark_left_early")}
                        aria-label={`Marquer parti avant la fin, ${name}`}
                        aria-disabled={inert || undefined}
                        className={`min-h-11 min-w-11 px-4 rounded-xl text-sm font-medium transition-colors aria-disabled:opacity-50 ${outlineButton}`}
                      >
                        Marquer parti avant la fin
                      </button>
                    )}
                  </div>
                  {notice?.registrationId === p.registrationId && (
                    <p className={`basis-full ${statusBoxClass("info")}`}>{notice.text}</p>
                  )}
                  {error?.registrationId === p.registrationId && (
                    <p key={error.seq} role="alert" className="basis-full text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error.text}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </li>
    )
  }

  function renderGroups(groups: DayOfGroup[], phase: "in_progress" | "upcoming" | "earlier") {
    return (
      <div className="space-y-5">
        {groups.map((g) => {
          const id = `dayof-${phase}-${g.key.replace(/[^\w-]/g, "")}`
          return (
            <section key={g.key} aria-labelledby={id} className="space-y-2">
              <h3 id={id} className="text-sm font-semibold text-gray-700">{groupHeading(g, phase, today)}</h3>
              <ul role="list" className="space-y-3">
                {g.shifts.map(renderShiftCard)}
              </ul>
            </section>
          )
        })}
      </div>
    )
  }

  const shown = shownStatus(syncStatus, failures)
  const count = (groups: DayOfGroup[]) => groups.reduce((n, g) => n + g.shifts.length, 0)
  const nothingFound = searching && count(inProgress) + count(upcoming) + count(earlier) === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Not a live region: the freshness changes are said once through the status region below. */}
        <p className={shown === "ok" ? "text-sm text-gray-700" : `${statusBoxClass("warning")} flex-1 basis-60`}>{syncStatusText(shown, refreshedAt)}</p>
        <button
          type="button"
          onClick={() => { if (!manualBusy) void sync("manual") }}
          aria-disabled={manualBusy || undefined}
          className="min-h-11 px-4 rounded-xl border border-blue-600 text-blue-700 bg-white text-sm font-medium hover:bg-blue-50 aria-disabled:opacity-50"
        >
          {manualBusy ? "Mise à jour…" : "Actualiser"}
        </button>
      </div>

      <div role="search">
        <label htmlFor={searchId} className="block text-sm font-medium text-gray-700 mb-1">Rechercher un bénévole ou un poste</label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => { typingUntil.current = nowMs() + TYPING_QUIET_MS; setQuery(e.target.value) }}
          autoComplete="off"
          className="input w-full min-h-11 text-base"
        />
      </div>

      <p role="status" aria-live="polite" aria-label="Mise à jour du tableau" className="sr-only">{status}</p>
      {nothingFound && <p className="text-sm text-gray-700">Aucun bénévole ni poste ne correspond à « {query.trim()} ».</p>}

      {!frontDesk && (
        <AddNeedPanel
          eventId={eventId}
          today={today}
          timeZone={timeZone}
          event={registrationWindow}
          roles={roles}
          onCreated={onNeedCreated}
          announce={say}
        />
      )}

      <section aria-labelledby="dayof-now" className="space-y-3">
        <h2 id="dayof-now" className="text-lg font-semibold text-gray-900">En cours</h2>
        {inProgress.length > 0
          ? renderGroups(inProgress, "in_progress")
          : <p className="text-sm text-gray-700">{searching ? "Aucun résultat en cours." : "Aucun créneau en cours."}</p>}
      </section>

      <section aria-labelledby="dayof-next" className="space-y-3">
        <h2 id="dayof-next" className="text-lg font-semibold text-gray-900">Dans les {DAY_OF_WINDOW_HOURS} prochaines heures</h2>
        {upcoming.length > 0
          ? renderGroups(upcoming, "upcoming")
          : <p className="text-sm text-gray-700">{searching ? "Aucun résultat à venir." : "Aucun créneau ne commence dans les prochaines heures."}</p>}
        {!searching && board.laterCount > 0 && (
          <p className="text-sm text-gray-700">
            Encore {board.laterCount} créneau{board.laterCount > 1 ? "x" : ""} plus tard aujourd&apos;hui.
          </p>
        )}
      </section>

      {board.earlier.length > 0 && (
        <section aria-labelledby="dayof-earlier" className="space-y-3">
          <h2 id="dayof-earlier" className="text-lg font-semibold text-gray-900">Plus tôt aujourd&apos;hui</h2>
          {earlier.length > 0 ? (
            // Open while searching, so a match among the finished shifts is visible; otherwise as
            // left by hand, so clearing the search doesn't close a section the user opened.
            <details open={searching || earlierOpen} onToggle={(e) => { if (!searching) setEarlierOpen(e.currentTarget.open) }}>
              <summary id="dayof-earlier-summary" className={`py-3 cursor-pointer rounded-xl text-sm font-medium text-blue-700 underline underline-offset-2 ${focusRing}`}>
                {count(earlier)} créneau{count(earlier) > 1 ? "x" : ""} terminé{count(earlier) > 1 ? "s" : ""}
              </summary>
              <div className="mt-3">
                {renderGroups(earlier, "earlier")}
              </div>
            </details>
          ) : (
            <p className="text-sm text-gray-700">Aucun résultat parmi les créneaux terminés.</p>
          )}
        </section>
      )}
    </div>
  )
}
