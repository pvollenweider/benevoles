// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
"use client"

import { useEffect, useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { announce } from "@/lib/announce"
import { describeBulkFailure } from "@/lib/form-errors"
import { focusFirstAvailable, isFocusDropped } from "@/lib/focus-return"
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

/** Typing in the search box: the count is announced once typing has paused this long. */
const SEARCH_ANNOUNCE_MS = 500

type Props = {
  eventId: string
  board: Board
  /** "YYYY-MM-DD" in the organization's zone. */
  today: string
  /** « 14h05 »: when the server built this board. Changes with every refresh. */
  refreshedAt: string
}

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const telClass = `inline-flex items-center min-h-11 px-3 rounded-xl border border-gray-300 bg-white text-sm font-medium text-blue-700 underline underline-offset-2 hover:bg-gray-50 ${focusRing}`

/**
 * « Jour J » (#561): the shifts running now and in the next hours, who is expected and who has
 * arrived, one tap to mark someone present. Check-in goes through the same route and action as the
 * registrations list (#399). One live region says each outcome; the toggled button stays in place,
 * so the focus does too.
 */
export default function DayOfBoard({ eventId, board, today, refreshedAt }: Props) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const [query, setQuery] = useState("")
  // Marks made here since the last server render: registration id → check-in instant or null.
  const [overrides, setOverrides] = useState<Record<string, string | null>>({})
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState("")
  // A failed toggle, shown in the person's row. `seq` remounts the alert, so the same message
  // twice in a row is voiced again.
  const [error, setError] = useState<{ registrationId: string; text: string; seq: number } | null>(null)
  const errorSeq = useRef(0)
  // « Plus tôt aujourd'hui » opened or closed by hand, kept while a search forces it open.
  const [earlierOpen, setEarlierOpen] = useState(false)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const searchId = useId()

  // A refresh brings the server's state, marks made here and on other phones alike: once it has
  // landed (pending true, then false), the local marks give way to it. Decided on the transition,
  // not on the minute-precision time shown, which two refreshes in the same minute share.
  const [wasRefreshing, setWasRefreshing] = useState(refreshing)
  if (wasRefreshing !== refreshing) {
    setWasRefreshing(refreshing)
    if (!refreshing) setOverrides({})
  }
  // Set when a toggle found nothing to change: its own message already says the list is updated.
  const quietRefresh = useRef(false)
  // The row whose button had the focus when a refresh was asked for after a toggle.
  const refreshFocus = useRef<{ registrationId: string; shiftId: string } | null>(null)
  const previousRefreshing = useRef(refreshing)
  useEffect(() => {
    const finished = previousRefreshing.current && !refreshing
    previousRefreshing.current = refreshing
    if (!finished) return
    const target = refreshFocus.current
    refreshFocus.current = null
    // The refresh took the focused row away (no longer confirmed): focus its shift, else the page title.
    if (target && !buttons.current.get(target.registrationId)?.isConnected) {
      focusFirstAvailable([() => document.getElementById(`dayof-shift-${target.shiftId}`), () => document.getElementById("page-heading")])
    }
    if (quietRefresh.current) { quietRefresh.current = false; return }
    announce(setStatus, `Liste mise à jour à ${refreshedAt}.`)
  }, [refreshing, refreshedAt])

  const isPresent = (p: DayOfPerson) => (p.registrationId in overrides ? overrides[p.registrationId] : p.checkedInAt) !== null

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
      announce(setStatus, resultText)
    }, SEARCH_ANNOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, resultText])

  async function toggle(person: DayOfPerson, shift: DayOfShift) {
    const id = person.registrationId
    if (pending.has(id)) return
    const present = !isPresent(person)
    const name = personName(person)
    setPending((prev) => new Set(prev).add(id))
    const done = () => setPending((prev) => { const next = new Set(prev); next.delete(id); return next })
    const { url, body } = presenceRequest(eventId, id, present)
    const what = `Présence de ${name}`
    const fail = (text: string) => {
      errorSeq.current += 1
      setError({ registrationId: id, text, seq: errorSeq.current })
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
    done()
    // WebKit leaves a tapped button unfocused (focus on <main>): put it back on the button.
    const btn = buttons.current.get(id)
    if (btn && isFocusDropped(document.activeElement)) btn.focus()
    if (!(result.changedIds ?? []).includes(id)) {
      // Already in that state (marked meanwhile from another phone) or no longer confirmed.
      announce(setStatus, `Rien n'a changé pour ${name} : la liste est mise à jour.`)
      quietRefresh.current = true
      refreshFocus.current = document.activeElement === btn ? { registrationId: id, shiftId: shift.id } : null
      startRefresh(() => router.refresh())
      return
    }
    const next = { ...overrides, [id]: present ? new Date().toISOString() : null }
    setOverrides(next)
    const counts = shiftCounts(shift, (p) => (p.registrationId in next ? next[p.registrationId] : p.checkedInAt) !== null)
    announce(setStatus, presenceAnnouncement(name, present, shiftName(shift), counts))
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
                <li key={p.registrationId} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
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

  const count = (groups: DayOfGroup[]) => groups.reduce((n, g) => n + g.shifts.length, 0)
  const nothingFound = searching && count(inProgress) + count(upcoming) + count(earlier) === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm text-gray-700">Mis à jour à {refreshedAt}.</p>
        <button
          type="button"
          onClick={() => { if (!refreshing) startRefresh(() => router.refresh()) }}
          aria-disabled={refreshing || undefined}
          className="min-h-11 px-4 rounded-xl border border-blue-600 text-blue-700 bg-white text-sm font-medium hover:bg-blue-50 aria-disabled:opacity-50"
        >
          {refreshing ? "Mise à jour…" : "Actualiser"}
        </button>
      </div>

      <div role="search">
        <label htmlFor={searchId} className="block text-sm font-medium text-gray-700 mb-1">Rechercher un bénévole ou un poste</label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
              <summary className={`py-3 cursor-pointer rounded-xl text-sm font-medium text-blue-700 underline underline-offset-2 ${focusRing}`}>
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
