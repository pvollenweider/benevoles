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
  filterGroups,
  groupHeading,
  missingLine,
  personName,
  presenceAnnouncement,
  presenceLine,
  presenceRequest,
  searchAnnouncement,
  shiftCounts,
  shiftHours,
  shiftName,
  telHref,
  type DayOfBoard as Board,
  type DayOfGroup,
  type DayOfPerson,
  type DayOfShift,
} from "@/lib/day-of"
import {
  NO_CHANGES,
  addChanges,
  boardChanges,
  changesAnnouncement,
  isFreshAnswer,
  leftBoardAnnouncement,
  marksAfterPoll,
  mayAnnounceChanges,
  nextPollDelay,
  shouldSyncOnResume,
  shownCheckIn,
  shownStatus,
  statusAnnouncement,
  syncStatusOf,
  syncStatusText,
  type BoardChanges,
  type LocalMarks,
  type SyncStatus,
} from "@/lib/day-of-sync"

/** Typing in the search box: the count is announced once typing has paused this long. */
const SEARCH_ANNOUNCE_MS = 500
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
}

type Snapshot = { board: Board; today: string; refreshedAt: string }
/** Why the board is read: the timer or a return to the page, « Actualiser », or a check-in that changed nothing. */
type SyncKind = "poll" | "manual" | "after_action"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const telClass = `inline-flex items-center min-h-11 px-3 rounded-xl border border-gray-300 bg-white text-sm font-medium text-blue-700 underline underline-offset-2 hover:bg-gray-50 ${focusRing}`

/**
 * « Jour J » (#561): the shifts running now and in the next hours, who is expected and who has
 * arrived, one tap to mark someone present. Check-in goes through the same route and action as the
 * registrations list (#399). One live region says each outcome; the toggled button stays in place,
 * so the focus does too.
 *
 * The board keeps itself current (#1141): it reads the board route every 25 s while the page is
 * visible and online, at once on coming back to the page or to the network, never by reloading the
 * page. Search, focus, an action in flight and the marks made here survive each read (merge and
 * ordering rules in day-of-sync.ts). Polls are silent unless something changed elsewhere.
 */
export default function DayOfBoard({ eventId, board: initialBoard, today: initialToday, refreshedAt: initialRefreshedAt }: Props) {
  const [snap, setSnap] = useState<Snapshot>({ board: initialBoard, today: initialToday, refreshedAt: initialRefreshedAt })
  const { board, today, refreshedAt } = snap
  const [query, setQuery] = useState("")
  // Check-ins made here that the board may not show yet: registration id → mark (day-of-sync.ts).
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
  const pendingRef = useRef(0)
  useEffect(() => { pendingRef.current = pending.size }, [pending])
  // The row that had the focus when a read replaced the board, to find it again after the render.
  const focusAfterSync = useRef<{ registrationId: string; shiftId: string; leftText: string | null } | null>(null)

  const isPresent = (p: DayOfPerson) => shownCheckIn(p, marks) !== null

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
      // A failure of « Actualiser » shows at once: the person asked, the old time must not pass for an answer.
      const nextFailures = kind === "manual" ? Math.max(2, statusRef.current.failures + 1) : statusRef.current.failures + 1
      const voiced = setFreshness(next, nextFailures, snapRef.current.refreshedAt, false)
      // « Actualiser » always answers, even when the failure is not new.
      if (kind === "manual" && !voiced) say(statusAnnouncement("ok", next, snapRef.current.refreshedAt) ?? syncStatusText(next, snapRef.current.refreshedAt))
    }
    let res: Response
    try {
      res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/day-of`, { cache: "no-store", headers: { Accept: "application/json" } })
    } catch {
      fail(syncStatusOf({ network: true, online: typeof navigator === "undefined" || navigator.onLine !== false }))
      return
    }
    if (!res.ok) { fail(syncStatusOf({ status: res.status })); return }
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
    appliedAt.current = sentAt

    const before = snapRef.current
    const marksBefore = marksRef.current
    const marksAfter = marksAfterPoll(marksBefore, sentAt)
    const changes = boardChanges(before.board, marksBefore, next.board, marksAfter)

    // The focused row, found again after the render even if its card moved to another section.
    const row = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>("[data-registration-id]") : null
    if (row?.dataset.registrationId && row.dataset.shiftId) {
      focusAfterSync.current = { registrationId: row.dataset.registrationId, shiftId: row.dataset.shiftId, leftText: kind === "after_action" ? null : leftBoardAnnouncement(before.board, next.board, row.dataset.registrationId) }
    }

    // Nothing new: no render at all, so a screen reader's reading position is left alone.
    if (JSON.stringify(before) !== JSON.stringify(next)) {
      snapRef.current = next
      setSnap(next)
    } else {
      focusAfterSync.current = null
    }
    updateMarks(() => marksAfter)

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
    const busy = pendingRef.current > 0 || now < typingUntil.current
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
  useEffect(() => {
    const target = focusAfterSync.current
    focusAfterSync.current = null
    if (!target || !isFocusDropped(document.activeElement)) return
    focusFirstAvailable([
      () => buttons.current.get(target.registrationId),
      () => document.getElementById(`dayof-shift-${target.shiftId}`),
      () => document.getElementById("dayof-earlier-summary"),
      () => document.getElementById("page-heading"),
    ])
    if (target.leftText) sayAt(lastAnnouncedAt, setStatus, target.leftText)
  }, [snap])

  const onPoll = useEffectEvent(() => {
    if (pollInFlight.current) return
    void sync("poll")
  })
  const onResume = useEffectEvent(() => {
    if (pollInFlight.current) return
    if (shouldSyncOnResume(lastAttemptAt.current, nowMs(), statusRef.current.status)) void sync("poll")
  })
  const onOffline = useEffectEvent(() => {
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

  async function toggle(person: DayOfPerson, shift: DayOfShift) {
    const id = person.registrationId
    if (pending.has(id)) return
    const shownBefore = shownCheckIn(person, marksRef.current)
    const present = shownBefore === null
    const name = personName(person)
    setPending((prev) => new Set(prev).add(id))
    // While the action is in flight, the row keeps what it showed when tapped, whatever a read says.
    updateMarks((m) => ({ ...m, [id]: { checkedInAt: shownBefore, at: null } }))
    const unpin = () => updateMarks((m) => {
      if (m[id]?.at !== null || !(id in m)) return m
      const next = { ...m }
      delete next[id]
      return next
    })
    const done = () => setPending((prev) => { const next = new Set(prev); next.delete(id); return next })
    const { url, body } = presenceRequest(eventId, id, present)
    const what = `Présence de ${name}`
    const fail = (text: string) => {
      errorSeq.current += 1
      setError({ registrationId: id, text, seq: errorSeq.current })
      unpin()
      done()
    }
    let res: Response
    try {
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    } catch {
      const f = describeBulkFailure({ network: true }, what)
      fail(`${f.title}. ${f.message} Réessayez dans un instant.`)
      return
    }
    if (!res.ok) {
      const f = describeBulkFailure({ status: res.status, body: await res.json().catch(() => null) }, what)
      fail(`${f.title}. ${f.message}`)
      return
    }
    const result = (await res.json().catch(() => ({}))) as { changedIds?: string[] }
    setError(null)
    // WebKit leaves a tapped button unfocused (focus on <main>): put it back on the button.
    const btn = buttons.current.get(id)
    if (btn && isFocusDropped(document.activeElement)) btn.focus()
    if (!(result.changedIds ?? []).includes(id)) {
      // Already in that state (marked meanwhile from another phone) or no longer confirmed.
      unpin()
      done()
      say(`Rien n'a changé pour ${name} : la liste est mise à jour.`)
      void sync("after_action")
      return
    }
    // The answer wins over any read sent before it; the next read sent after it confirms it.
    const mark = { checkedInAt: present ? new Date().toISOString() : null, at: ++tick.current }
    updateMarks((m) => ({ ...m, [id]: mark }))
    done()
    const counts = shiftCounts(shift, (p) => shownCheckIn(p, marksRef.current) !== null)
    say(presenceAnnouncement(name, present, shiftName(shift), counts))
  }

  // Plain render functions, not components declared here: a component type created on each
  // render would remount every card, and the button just toggled would lose the focus.
  function renderShiftCard(shift: DayOfShift) {
    const headingId = `dayof-shift-${shift.id}`
    const counts = shiftCounts(shift, isPresent)
    const missing = missingLine(counts)
    const contactPhone = shift.contactPhone?.trim()
    const contactName = shift.contactName?.trim()
    return (
      <li key={shift.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
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
              const present = isPresent(p)
              const busy = pending.has(p.registrationId)
              const name = personName(p)
              return (
                <li key={p.registrationId} data-registration-id={p.registrationId} data-shift-id={shift.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="font-medium text-gray-900 break-words">{name}</p>
                    <p className="text-sm">
                      {present
                        ? <span className="inline-block rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">Présent</span>
                        : <span className="inline-block rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">Pas encore marqué</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.phone && (
                      <a href={telHref(p.phone)} aria-label={`Appeler ${name} au ${p.phone}`} className={telClass}>{p.phone}</a>
                    )}
                    <button
                      type="button"
                      ref={(el) => { if (el) buttons.current.set(p.registrationId, el); else buttons.current.delete(p.registrationId) }}
                      onClick={() => toggle(p, shift)}
                      // Named with the person, the visible label first (2.5.3). An action, not a
                      // toggle state: no aria-pressed, the label says what a press does.
                      aria-label={`${present ? "Annuler la présence" : "Marquer présent"}, ${name}`}
                      aria-disabled={busy || undefined}
                      className={`min-h-11 min-w-11 px-4 rounded-xl text-sm font-medium transition-colors aria-disabled:opacity-50 ${present
                        ? "border border-blue-600 text-blue-700 bg-white hover:bg-blue-50"
                        : "bg-blue-600 text-white hover:bg-blue-700"}`}
                    >
                      {present ? "Annuler la présence" : "Marquer présent"}
                    </button>
                  </div>
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

      <p role="status" aria-live="polite" className="sr-only">{status}</p>
      {nothingFound && <p className="text-sm text-gray-700">Aucun bénévole ni poste ne correspond à « {query.trim()} ».</p>}

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
