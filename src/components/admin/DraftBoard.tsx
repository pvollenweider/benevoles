"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { announce } from "@/lib/announce"
import { focusFirstAvailable } from "@/lib/focus-return"
import { NETWORK_ERROR, requestJson } from "@/lib/use-submit"
import { TABLE_SCROLL_HINT } from "@/lib/table-overflow"
import { fmtShortDate } from "@/lib/registrations-list"
import { dayLabel } from "@/lib/spoken-time"
import { fmtDuration } from "@/lib/signup-recap"
import { ackLabel, type FitState } from "@/lib/availability-assist"
import { de } from "@/lib/french-elision"
import { placesToFillText, type BoardItem, type BoardRow, type DayCoverage, type DraftOption } from "@/lib/draft-board"
import type { DraftBoardData } from "@/lib/draft-board-data"
import type { DraftProblem } from "@/lib/draft-assignments"
import { useHidesColumns } from "@/components/admin/members/useHidesColumns"
import ModalShell from "@/components/admin/ModalShell"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const linkClass = `font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`
/** A jump target (the summary's links): a visible mark where focus lands, inset so the scroll region does not clip it. */
const targetRing = "outline-hidden focus:ring-2 focus:ring-inset focus:ring-blue-600"
const smallButton = `min-h-9 rounded-lg border border-gray-500 bg-white px-3 py-1 text-xs font-medium text-gray-900 hover:bg-gray-50 aria-disabled:opacity-60 ${focusRing}`
const pill = "inline-block rounded-full border border-transparent px-2 py-0.5 font-medium"

type Layout = "grid" | "day"

/**
 * One pill per item, its kind (DESIGN.md §2 pairs, never colour alone: the word is always there). A
 * generated draft says « Proposé » instead of « Brouillon », never both (independent review, P1 #5).
 */
const KIND_BADGE: Record<BoardItem["kind"], { label: string; className: string }> = {
  confirmed: { label: "Confirmée", className: "bg-[#dcfce7] text-[#15803d]" },
  pending: { label: "En attente", className: "bg-[#fef3c7] text-[#78350f]" },
  draft: { label: "Brouillon", className: "bg-[#f3f4f6] text-[#4b5563]" },
}
const OUTSIDE_FITS: FitState[] = ["partial", "outside"]

const ids = {
  cell: (l: Layout, v: string, d: string) => `${l}-cell-${v}-${d}`,
  add: (l: Layout, v: string, d: string) => `${l}-add-${v}-${d}`,
  draft: (l: Layout, id: string) => `${l}-draft-${id}`,
  row: (l: Layout, v: string) => `${l}-row-${v}`,
  seen: (l: Layout, v: string) => `${l}-seen-${v}`,
}
/** The day view's list of shifts still missing people (the capacity links land there). */
const COVERAGE_ID = "day-coverage"

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const personName = (r: Pick<BoardRow, "firstName" | "lastName">) => `${r.firstName} ${r.lastName}`.trim()
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** « Bar · Soir » read « Bar, Soir »: the middle dot is shown, never spoken. */
function ShiftName({ name }: { name: string }) {
  const [role, ...rest] = name.split(" · ")
  if (rest.length === 0) return <>{name}</>
  return <>{role}<span aria-hidden="true"> ·</span><span className="sr-only">,</span>{" "}{rest.join(" · ")}</>
}
const spokenName = (name: string) => name.replace(" · ", ", ")

/** A warning triangle, before the words that carry the meaning. */
function WarningIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-px h-3.5 w-3.5 shrink-0" fill="currentColor"><path d="M8.9 1.6a1 1 0 0 0-1.8 0L.2 13.5A1 1 0 0 0 1.1 15h13.8a1 1 0 0 0 .9-1.5L8.9 1.6ZM8 5a.8.8 0 0 1 .8.8v3.6a.8.8 0 0 1-1.6 0V5.8A.8.8 0 0 1 8 5Zm0 6.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" /></svg>
}

function hoursText(r: BoardRow): string {
  const parts = [r.committedMinutes > 0 ? `${fmtDuration(r.committedMinutes)} confirmées ou en attente` : "Aucune mission", r.draftMinutes > 0 ? `${fmtDuration(r.draftMinutes)} en brouillon` : null]
  return parts.filter(Boolean).join(", ")
}

const missingText = placesToFillText

/** The registrations page, on the mission's shift and the person (« Voir l'inscription »). */
const registrationHref = (eventId: string, shiftId: string, row: BoardRow) => `/admin/events/${eventId}/registrations?${new URLSearchParams({ shift: shiftId, q: personName(row) })}`

type DraftTarget = { row: BoardRow; date: string; item: BoardItem; layout: Layout }
type CellTarget = { row: BoardRow; date: string; layout: Layout }
type SummaryProblem = DraftBoardData["summary"]["problems"][number]
const problemKey = (p: Pick<DraftProblem, "code" | "draftId" | "volunteerId" | "shiftId">) => `${p.code}|${p.draftId ?? p.volunteerId ?? p.shiftId ?? ""}`

/** A page-level status said after a focus move (RecentCancellations pattern): 150 ms later, the timer cleared on unmount. */
function useLaterStatus() {
  const [status, setStatus] = useState("")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  function later(text: string) {
    if (timer.current) clearTimeout(timer.current)
    setStatus("")
    timer.current = setTimeout(() => setStatus(text), 150)
  }
  return { status, later }
}

/**
 * « Affectations en brouillon » (#1146, lot C): the summary and « Publier les affectations », then
 * the person × day planning (a captioned table in a labelled scroll region on a wide screen, a day
 * list below md or on demand). Accessibility reviews (2026-10-30, and the independent review's
 * plan, 2026-10-31): ids prefixed by layout (both are in the DOM, one hidden); the row header holds
 * the name only, hours and short markers in a « Résumé » column; short dates shown, full dates read;
 * the places still to fill in a second header row, read once with their date; summary links focus
 * the visible cell; one page-level polite status outside the dialogs, said 150 ms after a focus
 * move; a refusal and a publication are focused blocks, not live regions; focus after every action.
 */
export default function DraftBoard({ eventId, board, day, view: initialView, scope, basePath, proposals = false }: {
  eventId: string
  board: DraftBoardData
  /** Generated proposals are available (#1172): drafts can be locked. */
  proposals?: boolean
  day: string | null
  view: Layout
  scope: "event" | "all"
  basePath: string
}) {
  const router = useRouter()
  const { status, later } = useLaterStatus()
  const [view, setView] = useState<Layout>(initialView)
  const [confirming, setConfirming] = useState<{ busy: boolean; error: string | null } | null>(null)
  // `unlisted`: the problems the refreshed summary does not list, frozen once the page has been read
  // again (null until then): the block appears and takes focus only then, so its words never change
  // under the reader (accessibility review), and never repeat the summary (independent review, P2 #9).
  const [refusal, setRefusal] = useState<{ lead: string; problems: DraftProblem[]; unlisted: DraftProblem[] | null; board: DraftBoardData } | null>(null)
  const [published, setPublished] = useState<{ count: number; people: number; withoutEmail: number } | null>(null)
  const [draftOpen, setDraftOpen] = useState<DraftTarget | null>(null)
  const [cellOpen, setCellOpen] = useState<CellTarget | null>(null)
  const [seen, setSeen] = useState<{ id: string; error: string | null } | null>(null)
  const publishKey = useRef<string | null>(null)
  const publishHeading = useRef<HTMLHeadingElement>(null)
  const publishedRef = useRef<HTMLDivElement>(null)
  const refusalRef = useRef<HTMLDivElement>(null)
  const focusAfterClose = useRef<"published" | "refusal" | null>(null)
  const regionRef = useRef<HTMLDivElement>(null)
  const hides = useHidesColumns(regionRef, [board.rows.length, board.dates.length, view])

  const rowsById = useMemo(() => new Map(board.rows.map((r) => [r.volunteerId, r])), [board.rows])
  const { summary } = board
  const blocking = summary.problems.length
  const nothing = summary.selection.length === 0
  const publishBlocked = nothing ? "Aucune affectation en brouillon à publier." : blocking > 0 ? `Réglez d'abord ${blocking > 1 ? `les ${blocking} points listés` : "le point listé"} ci-dessus.` : null

  // A server refusal: its problems the summary does not list are shown in the block itself.
  const listed = useMemo(() => new Set(summary.problems.map(problemKey)), [summary.problems])
  const unlisted = refusal?.unlisted ?? []
  useEffect(() => {
    if (!refusal || refusal.unlisted !== null) return
    const settle = () => {
      focusAfterClose.current = "refusal"
      setRefusal((r) => (r && r.unlisted === null ? { ...r, unlisted: r.problems.filter((p) => !listed.has(problemKey(p))) } : r))
    }
    // The refreshed board has arrived; or, if it never does, the block shows its whole list.
    if (board !== refusal.board) { settle(); return }
    const t = setTimeout(settle, 3000)
    return () => clearTimeout(t)
  }, [board, refusal, listed])

  // After the publication dialog closed: focus on the result block, before ModalShell gives it back to its trigger.
  useLayoutEffect(() => {
    const target = focusAfterClose.current
    if (!target || confirming) return
    focusAfterClose.current = null
    ;(target === "published" ? publishedRef : refusalRef).current?.focus()
  }, [confirming, published, refusal])

  const query = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(scope === "all" ? { scope: "all" } : {}), ...extra })
    const s = p.toString()
    return s ? `${basePath}?${s}` : basePath
  }

  async function publish() {
    if (!confirming || confirming.busy) return
    publishKey.current ??= crypto.randomUUID()
    setConfirming({ busy: true, error: null })
    let res: Response
    let data: { error?: string; code?: string; problems?: DraftProblem[]; published?: number; people?: number } = {}
    try {
      res = await fetch(`/api/admin/events/${eventId}/drafts/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selection: summary.selection, idempotencyKey: publishKey.current }) })
      data = await res.json().catch(() => ({}))
    } catch {
      setConfirming({ busy: false, error: NETWORK_ERROR })
      return
    }
    if (res.ok) {
      publishKey.current = null
      // The block says the result (focused, never also a status: it would be read twice).
      focusAfterClose.current = "published"
      setRefusal(null)
      setPublished({ count: data.published ?? 0, people: data.people ?? 0, withoutEmail: summary.withoutEmail })
      setConfirming(null)
      startTransition(() => router.refresh())
      return
    }
    publishKey.current = null
    if (data.problems && data.problems.length > 0) {
      setPublished(null)
      setRefusal({ lead: data.error ?? "Rien n'a été publié.", problems: data.problems, unlisted: null, board })
      setConfirming(null)
      startTransition(() => router.refresh())
      return
    }
    setConfirming({ busy: false, error: typeof data.error === "string" ? data.error : "La publication n'a pas abouti. Rien n'a été publié." })
  }

  /** A summary link: the visible cell (grid or day list), else the page of that day. */
  function jump(e: React.MouseEvent<HTMLAnchorElement>, volunteerId: string, date: string | null) {
    const candidates = date ? [ids.cell("grid", volunteerId, date), ids.cell("day", volunteerId, date)] : [ids.row("grid", volunteerId), ids.row("day", volunteerId)]
    const target = candidates.map((id) => document.getElementById(id)).find((el) => el && el.offsetParent !== null)
    if (!target) return
    e.preventDefault()
    target.scrollIntoView({ block: "nearest", inline: "center" })
    target.focus()
  }

  /**
   * The link before a problem: the person and the day (their cell), the person (their row), or the
   * day alone (a shift's capacity: the day's places to fill). A link that changes `?day=` targets the
   * day list's id, the layout shown below md (independent review, P2 #11).
   */
  function personLink(volunteerId: string, date: string | null) {
    const row = rowsById.get(volunteerId)
    if (!row) return null
    const text = date ? `${personName(row)}, ${lowerFirst(dayLabel(date))}` : personName(row)
    const sameDay = !date || date === day
    const layout: Layout = view === "day" || !sameDay ? "day" : "grid"
    const href = date ? `${query({ day: date, ...(view === "day" ? { view: "day" } : {}) })}#${ids.cell(layout, row.volunteerId, date)}` : `#${ids.row("grid", row.volunteerId)}`
    return <a href={href} onClick={(e) => jump(e, row.volunteerId, date)} className={linkClass}>{text}</a>
  }
  function problemLink(p: SummaryProblem) {
    if (p.volunteerId) return personLink(p.volunteerId, p.anchor ? p.date : null)
    if (p.date) return <a href={`${query({ day: p.date, view: "day" })}#${COVERAGE_ID}`} className={linkClass}>{dayLabel(p.date)}</a>
    return null
  }

  function afterDraftClose(target: DraftTarget, removed: boolean, text: string | null) {
    if (removed) {
      flushSync(() => setDraftOpen(null))
      focusFirstAvailable([() => document.getElementById(ids.add(target.layout, target.row.volunteerId, target.date)), () => document.getElementById(ids.cell(target.layout, target.row.volunteerId, target.date))])
    } else setDraftOpen(null)
    if (text) later(text)
    startTransition(() => router.refresh())
  }

  /** « Marquer comme vu » (#1146, lot C): the person's flag goes, at the revision shown. */
  async function markSeen(row: BoardRow, layout: Layout) {
    if (row.seenRevision === null) return
    if (seen && !seen.error) { later("Une action est en cours : attendez sa réponse."); return }
    setSeen({ id: row.volunteerId, error: null })
    const res = await requestJson(() => fetch(`/api/admin/events/${eventId}/availability/${row.volunteerId}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: row.seenRevision }) }))
    if (!res.ok) { setSeen({ id: row.volunteerId, error: res.error }); return }
    flushSync(() => setSeen(null))
    document.getElementById(ids.row(layout, row.volunteerId))?.focus()
    later(`Disponibilités ${de(personName(row))} marquées comme vues.`)
    startTransition(() => router.refresh())
  }

  const showDay = view === "day"
  const dayRows = day ? board.rows : []
  const dayCoverage = day ? summary.coverage.find((c) => c.date === day) ?? null : null
  const rowProps = { seen, onSeen: markSeen }

  return (
    <div className="space-y-8">
      <p role="status" className={status ? "text-sm text-gray-800" : "sr-only"}>{status}</p>

      <section aria-labelledby="drafts-publish-heading" className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 id="drafts-publish-heading" ref={publishHeading} tabIndex={-1} className="text-base font-semibold text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Publier les affectations</h2>
        {published && (
          <div ref={publishedRef} tabIndex={-1} role="group" aria-labelledby="drafts-published-heading" aria-describedby="drafts-published-text" className="rounded-lg border border-[#15803d] bg-[#f0fdf4] px-3 py-2 text-sm text-gray-900 outline-none">
            <h3 id="drafts-published-heading" className="font-semibold text-[#15803d]">Publication faite</h3>
            <p id="drafts-published-text">
              {plural(published.count, "affectation publiée", "affectations publiées")} pour {plural(published.people, "personne", "personnes")}. Chaque personne avec une adresse email reçoit un seul email avec ses missions.
              {published.withoutEmail > 0 && ` ${published.withoutEmail > 1 ? `${published.withoutEmail} personnes n'ont pas d'adresse email` : "1 personne n'a pas d'adresse email"} : prévenez-les vous-même.`}
            </p>
            <p className="mt-1"><Link href={`/admin/events/${eventId}/registrations`} className={linkClass}>Voir les inscriptions</Link></p>
          </div>
        )}
        <p className="text-sm text-gray-800" data-drafts-counts="1">
          {nothing ? "Aucune affectation en brouillon pour l'instant." : `${plural(summary.drafts, "affectation en brouillon", "affectations en brouillon")} pour ${plural(summary.people, "personne", "personnes")}`}
          {!nothing && summary.stale > 0 && ` ; ${plural(summary.stale, "à revoir", "à revoir")}`}
          {!nothing && summary.ackMissing > 0 && ` ; ${plural(summary.ackMissing, "confirmation à donner", "confirmations à donner")}`}
          {!nothing && "."}
        </p>
        {summary.toReview.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{summary.toReview.length > 1 ? `${summary.toReview.length} missions à revoir` : "1 mission à revoir"} après une correction des disponibilités</h3>
            <p className="text-sm text-gray-700">Ces missions sont actuellement en dehors des disponibilités corrigées. Personne n&apos;a été déplacé ni désinscrit.</p>
            <ul role="list" className="mt-1 space-y-1 text-sm text-gray-800">
              {summary.toReview.map((m) => <li key={`${m.volunteerId}-${m.date}-${m.name}-${m.time}`}>{personLink(m.volunteerId, m.date)} : <ShiftName name={m.name} />, {m.time}</li>)}
            </ul>
          </div>
        )}
        {blocking > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{blocking > 1 ? `${blocking} points empêchent la publication` : "1 point empêche la publication"}</h3>
            <ul role="list" className="mt-1 space-y-1 text-sm text-gray-800">
              {summary.problems.map((p, i) => {
                const link = problemLink(p)
                return (
                  <li key={`${problemKey(p)}-${i}`}>
                    {link}{link ? " : " : ""}{link && p.volunteerId ? (p.short ?? p.message) : p.message}
                    {p.details && p.details.length > 1 && <ul role="list" className="mt-0.5 list-disc pl-5">{p.details.slice(1).map((d) => <li key={d}>{d}</li>)}</ul>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        {refusal && refusal.unlisted !== null && (
          <div ref={refusalRef} tabIndex={-1} role="group" aria-labelledby="drafts-refusal-heading" aria-describedby="drafts-refusal-lead" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 outline-none">
            <h3 id="drafts-refusal-heading" className="font-semibold">La publication n&apos;a pas eu lieu</h3>
            <p id="drafts-refusal-lead">
              Rien n&apos;a été publié : la situation a changé pendant la confirmation.
              {unlisted.length < refusal.problems.length && " Les points à régler sont listés ci-dessus."}
              {unlisted.length > 0 && ` ${unlisted.length < refusal.problems.length ? "Et aussi" : "Points à régler"} :`}
            </p>
            {unlisted.length > 0 && <ul role="list" className="mt-1 list-disc pl-5 space-y-0.5">{unlisted.map((p, i) => <li key={i}>{p.message}</li>)}</ul>}
          </div>
        )}
        <button
          type="button"
          onClick={() => { if (!publishBlocked) { setRefusal(null); setPublished(null); setConfirming({ busy: false, error: null }) } }}
          aria-disabled={!!publishBlocked || undefined}
          aria-describedby={publishBlocked ? "drafts-publish-blocked" : undefined}
          className={`min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:opacity-60 aria-disabled:cursor-not-allowed ${focusRing}`}
          data-drafts-publish="1"
        >
          Publier les affectations
        </button>
        {publishBlocked && <p id="drafts-publish-blocked" className="text-xs text-gray-700">{publishBlocked}</p>}
        <p className="text-xs text-gray-700">Chaque personne avec une adresse email reçoit un seul email avec toutes ses missions. Les places ne sont prises qu&apos;à la publication.</p>
      </section>

      <section aria-labelledby="drafts-grid-heading" className="space-y-3">
        <h2 id="drafts-grid-heading" className="text-base font-semibold text-gray-900">Planning par personne et par jour</h2>
        <p className="text-sm text-gray-700">
          <span id="drafts-scope">{scope === "all" ? "Tous les membres actifs de l'organisation." : "Les personnes sollicitées pour leurs disponibilités, déjà prévues sur l'événement ou avec un brouillon."}</span>{" "}
          <Link href={scope === "all" ? `${basePath}${view === "day" ? "?view=day" : ""}` : `${basePath}?scope=all${view === "day" ? "&view=day" : ""}`} aria-describedby="drafts-scope" className={linkClass}>
            {scope === "all" ? "Voir seulement les personnes concernées" : "Voir tous les membres actifs"}
          </Link>
        </p>
        <div className="hidden md:block">
          <p id="drafts-view-label" className="text-xs font-medium text-gray-700 mb-1">Affichage</p>
          <div role="group" aria-labelledby="drafts-view-label" className="flex">
            {([["grid", "Tout l'événement"], ["day", "Par jour"]] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}
                className={`min-h-9 border border-gray-500 px-3 py-1.5 text-sm font-medium first:rounded-l-xl last:rounded-r-xl -ml-px first:ml-0 ${view === value ? "bg-blue-50 text-blue-800 border-blue-600 font-semibold ring-2 ring-inset ring-blue-600 relative z-10" : "bg-white text-gray-800 hover:bg-gray-50"} forced-colors:aria-pressed:bg-[Highlight] ${focusRing} focus-visible:relative focus-visible:z-20`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {board.rows.length === 0 ? (
          <p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-xl p-6 text-center">Personne à afficher : demandez d&apos;abord leurs disponibilités, ou voyez tous les membres actifs.</p>
        ) : (
          <>
            {!showDay && (
              <div className="hidden md:block space-y-2">
                <a href="#drafts-after-grid" className={`text-sm ${linkClass}`}>Passer le planning</a>
                {hides && <p id="drafts-grid-hint" className="max-w-[65ch] text-sm text-gray-600">{TABLE_SCROLL_HINT}</p>}
                <div ref={regionRef} role="region" aria-label="Planning des affectations" aria-describedby={hides ? "drafts-grid-hint" : undefined} tabIndex={hides ? 0 : undefined} className={`relative bg-white border border-gray-200 rounded-xl overflow-x-auto ${focusRing}`}>
                  {/* Fixed layout (polish pass): every date column the same width, the table never narrower than its columns. */}
                  <table className="w-full table-fixed text-sm border-collapse" style={{ minWidth: `${21 + board.dates.length * 11}rem` }}>
                    <caption className="sr-only">Affectations par personne et par jour, avec les brouillons et les places à pourvoir</caption>
                    <thead className="bg-gray-50 text-xs text-gray-700">
                      <tr>
                        <th scope="col" className="text-left px-3 py-2 font-medium w-40">Personne</th>
                        <th scope="col" className="text-left px-3 py-2 font-medium w-44">Résumé</th>
                        {board.dates.map((d) => (
                          <th key={d} scope="col" className="text-left px-3 py-2 font-medium whitespace-nowrap">
                            <span aria-hidden="true">{fmtShortDate(d)}</span><span className="sr-only">{dayLabel(d)}</span>
                          </th>
                        ))}
                      </tr>
                      {/* Coverage (PRODUCT.md capability 4): one row, read once with its date (accessibility plan review). */}
                      <tr className="border-t border-gray-200">
                        <th scope="row" className="text-left px-3 py-1.5 font-medium">À pourvoir</th>
                        <td className="px-3 py-1.5 text-gray-700">après les brouillons</td>
                        {summary.coverage.map((c) => (
                          <td key={c.date} className="px-3 py-1.5">
                            {c.missing === 0 ? <span className="text-gray-700">{missingText(0)}</span> : (
                              <a href={`${query({ day: c.date, view: "day" })}#${COVERAGE_ID}`} className={linkClass}>{missingText(c.missing)}<span className="sr-only">, voir les créneaux du {lowerFirst(dayLabel(c.date))}</span></a>
                            )}
                          </td>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 align-top">
                      {board.rows.map((r) => (
                        <tr key={r.volunteerId}>
                          <th scope="row" id={ids.row("grid", r.volunteerId)} tabIndex={-1} className={`text-left px-3 py-2 font-medium text-gray-900 break-words ${targetRing}`}>
                            {personName(r)}
                            {r.sameNameHint && <><span className="sr-only">, </span><span className="block text-xs font-normal text-gray-700 break-all">{r.sameNameHint}</span></>}
                          </th>
                          <td className="px-3 py-2"><RowSummary row={r} layout="grid" {...rowProps} /></td>
                          {r.cells.map((c) => (
                            <td key={c.date} id={ids.cell("grid", r.volunteerId, c.date)} tabIndex={-1} className={`px-3 py-2 break-words ${targetRing}`}>
                              <CellContent eventId={eventId} row={r} cell={c} layout="grid" onDraft={(item) => setDraftOpen({ row: r, date: c.date, item, layout: "grid" })} onAdd={() => setCellOpen({ row: r, date: c.date, layout: "grid" })} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className={showDay ? "space-y-3" : "md:hidden space-y-3"}>
              {day && (
                <form method="get" action={basePath} className="flex flex-wrap items-end gap-3">
                  {scope === "all" && <input type="hidden" name="scope" value="all" />}
                  {showDay && <input type="hidden" name="view" value="day" />}
                  <div className="min-w-0 flex-1 basis-48">
                    <label htmlFor="drafts-day" className="block text-sm font-medium text-gray-700 mb-1">Jour</label>
                    <select id="drafts-day" name="day" defaultValue={day} className="input w-full">
                      {board.dates.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                    </select>
                  </div>
                  <button type="submit" className={`min-h-11 rounded-xl border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 ${focusRing}`}>Afficher</button>
                </form>
              )}
              {day && <h3 className="text-sm font-semibold text-gray-900">{dayLabel(day)}</h3>}
              {dayCoverage && <DayCoverageList coverage={dayCoverage} />}
              <ul role="list" className="space-y-3">
                {dayRows.map((r) => {
                  const c = r.cells.find((x) => x.date === day)!
                  return (
                    <li key={r.volunteerId} id={ids.cell("day", r.volunteerId, day!)} tabIndex={-1} className={`bg-white border border-gray-200 rounded-xl p-3 space-y-2 ${targetRing}`}>
                      <h4 id={ids.row("day", r.volunteerId)} tabIndex={-1} className={`text-sm font-semibold text-gray-900 break-words rounded ${targetRing}`}>
                        {personName(r)}
                        {r.sameNameHint && <><span className="sr-only">, </span><span className="block text-xs font-normal text-gray-700 break-all">{r.sameNameHint}</span></>}
                      </h4>
                      <RowSummary row={r} layout="day" {...rowProps} />
                      <CellContent eventId={eventId} row={r} cell={c} layout="day" onDraft={(item) => setDraftOpen({ row: r, date: c.date, item, layout: "day" })} onAdd={() => setCellOpen({ row: r, date: c.date, layout: "day" })} />
                    </li>
                  )
                })}
              </ul>
            </div>
            <div id="drafts-after-grid" tabIndex={-1} className="outline-hidden" />
          </>
        )}
      </section>

      {confirming && (
        <ConfirmActionModal
          recap={{
            title: "Publier les affectations ?",
            lead: `${plural(summary.drafts, "affectation", "affectations")} pour ${plural(summary.people, "personne", "personnes")} : chaque personne avec une adresse email reçoit un seul email avec ses missions.`,
            lines: [
              "Les places sont prises maintenant ; tout est publié d'un coup, ou rien si un point bloque.",
              ...(summary.withoutEmail > 0 ? [`${summary.withoutEmail > 1 ? `${summary.withoutEmail} personnes n'ont pas d'adresse email` : "1 personne n'a pas d'adresse email"} : elles ne reçoivent rien, prévenez-les vous-même.`] : []),
            ],
            confirmLabel: "Publier",
            danger: false,
          }}
          busy={confirming.busy}
          error={confirming.error}
          onConfirm={() => void publish()}
          onCancel={() => { publishKey.current = null; setConfirming(null) }}
        />
      )}
      {draftOpen && <DraftDialog eventId={eventId} target={draftOpen} live={liveDraft(board, draftOpen.item.draft?.id)} canLock={proposals} onClose={(removed, text) => afterDraftClose(draftOpen, removed, text)} />}
      {cellOpen && <OptionsDialog eventId={eventId} target={cellOpen} onClose={() => { setCellOpen(null); startTransition(() => router.refresh()) }} />}
    </div>
  )
}

/** The day view's places to fill, shift by shift (the capacity and coverage links land here). */
function DayCoverageList({ coverage }: { coverage: DayCoverage }) {
  return (
    <div id={COVERAGE_ID} tabIndex={-1} className={`rounded-xl border border-gray-200 bg-white p-3 text-sm ${targetRing}`}>
      <h4 className="font-semibold text-gray-900">À pourvoir ce jour</h4>
      {coverage.shifts.length === 0 ? <p className="text-gray-700">Tous les créneaux de ce jour sont pourvus, brouillons compris.</p> : (
        <ul role="list" className="mt-1 space-y-0.5 text-gray-800">
          {coverage.shifts.map((s) => <li key={s.shiftId} className="break-words"><ShiftName name={s.name} />, {s.time} : {missingText(s.missing).toLowerCase()}</li>)}
        </ul>
      )}
    </div>
  )
}

function RowSummary({ row, layout, seen, onSeen }: { row: BoardRow; layout: Layout; seen: { id: string; error: string | null } | null; onSeen: (row: BoardRow, layout: Layout) => void }) {
  const errorId = ids.seen(layout, row.volunteerId)
  const mine = seen?.id === row.volunteerId
  const busy = mine && !seen!.error
  const failed = mine && !!seen!.error
  return (
    <div className="space-y-1 text-xs text-gray-700">
      <p>{hoursText(row)}</p>
      {row.reviewTexts.map((t) => <p key={t} className="text-[#92400e]">{t}</p>)}
      {row.seenRevision !== null && (
        <>
          <button type="button" onClick={() => onSeen(row, layout)} aria-disabled={(!!seen && !seen.error) || undefined} aria-busy={busy || undefined} aria-describedby={failed ? errorId : undefined} className={smallButton}>
            {busy ? "Enregistrement…" : "Marquer comme vu"}<span className="sr-only">{` : disponibilités ${de(personName(row))}`}</span>
          </button>
          <p id={errorId} role="alert" className={failed ? "text-red-700" : "sr-only"}>{failed ? seen!.error : null}</p>
        </>
      )}
      {row.markers.map((m) => <p key={m} className="font-medium text-red-800">{m}</p>)}
    </div>
  )
}

/**
 * « Verrouillé » (#1172): a lock and the word, outlined in dark ink, so it never reads as one more
 * grey « Brouillon » or « Proposé » pill, and never in the action blue.
 */
function LockedChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-white px-2 py-0.5 font-medium text-gray-900 forced-colors:border-[CanvasText]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="currentColor"><path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" /></svg>
      Verrouillé
    </span>
  )
}

/** The item's kind, in one word: « Proposé » for a generated draft, never next to « Brouillon ». */
const kindLabel = (item: BoardItem) => (item.draft?.source === "proposal" ? "Proposé" : KIND_BADGE[item.kind].label)

/**
 * One cell (independent review, P1 #5): the shift, then the most important fact, availability
 * outside the answer (a warning line, never a pill), then one pill for the kind and the lock, then
 * what is left to do in short words; the full sentences are in the summary and the dialog.
 */
function CellContent({ eventId, row, cell, layout, onDraft, onAdd }: { eventId: string; row: BoardRow; cell: BoardRow["cells"][number]; layout: Layout; onDraft: (item: BoardItem) => void; onAdd: () => void }) {
  const who = `${personName(row)}${row.sameNameHint ? ` (${row.sameNameHint})` : ""}`
  const date = lowerFirst(dayLabel(cell.date))
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-700">{cell.availability}</p>
      {cell.items.length > 0 && (
        <ul role="list" className="space-y-1">
          {cell.items.map((item) => (
            <li key={`${item.kind}-${item.draft?.id ?? item.shiftId}`}>
              {item.draft ? (
                // The draft itself opens its dialog (density pass): one target per draft, named by
                // the person and the date (sr-only), then everything the item shows.
                <button id={ids.draft(layout, item.draft.id)} type="button" onClick={() => onDraft(item)}
                  className={`block w-full rounded-md border border-gray-500 bg-white px-2 py-1 text-left text-xs text-gray-900 hover:border-blue-600 hover:bg-blue-50 ${focusRing}`}>
                  <span className="sr-only">{who}, {date} : </span>
                  <ItemLines item={item} />
                </button>
              ) : (
                <div className="py-0.5 text-xs text-gray-900">
                  <ItemLines item={item} />
                  {item.registrationId && item.review && (
                    <Link href={registrationHref(eventId, item.shiftId, row)} className={`inline-block min-h-6 ${linkClass}`}>Voir l&apos;inscription<span className="sr-only">, {who}, {spokenName(item.name)}, {date}</span></Link>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <button id={ids.add(layout, row.volunteerId, cell.date)} type="button" onClick={onAdd}
        className={`-ml-1 inline-flex ${layout === "day" ? "min-h-11" : "min-h-6"} items-center rounded px-1 text-xs font-medium text-blue-700 underline-offset-2 hover:underline ${focusRing}`}>
        <span aria-hidden="true">+ </span>Ajouter{" "}<span className="sr-only">une affectation pour {who} le {date}</span>
      </button>
    </div>
  )
}

/**
 * What one mission or draft shows, as spans (they may sit inside a button): the shift, then the
 * most important fact, availability outside the answer (a warning line, never a pill), then one
 * pill for the kind and the lock, then what is left to do in short words.
 */
function ItemLines({ item }: { item: BoardItem }) {
  const outside = !!item.fit && OUTSIDE_FITS.includes(item.fit)
  const warning = item.review ?? (outside ? item.fitLabel : null)
  const pills = (
    <>
      <span className="sr-only">, </span>
      <span className={`${pill} ${KIND_BADGE[item.kind].className}`}>{kindLabel(item)}</span>
      {item.draft?.locked && <><span className="sr-only">, </span><LockedChip /></>}
    </>
  )
  // Distill pass: without a warning, the pills sit on the shift's line (one line less per item);
  // with one, the warning comes first, the most important fact, then the pills.
  return (
    <span className="block space-y-0.5">
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span><span className="font-medium"><ShiftName name={item.name} /></span>, {item.time}</span>
        {!warning && pills}
      </span>
      {warning && (
        <>
          <span className="flex items-start gap-1 font-semibold text-[#92400e]"><span className="sr-only">, </span><WarningIcon /><span>{warning}</span></span>
          <span className="flex flex-wrap items-center gap-1">{pills}</span>
        </>
      )}
      {item.draft?.staleText && <span className="block text-[#92400e]"><span className="sr-only">, </span>{item.draft.staleText}</span>}
      {item.draft && !item.draft.stale && item.draft.ackKey && !item.draft.acked && <span className="block text-[#92400e]"><span className="sr-only">, </span>Confirmation à donner avant publication.</span>}
      {item.draft?.markers.map((m) => <span key={m} className="block font-medium text-red-800"><span className="sr-only">, </span>{m}</span>)}
    </span>
  )
}

/** The draft as the board reads it now (after a refresh), to keep an open dialog in step. */
function liveDraft(board: DraftBoardData, id: string | undefined): { locked: boolean; revision: number } | null {
  if (!id) return null
  for (const r of board.rows) for (const c of r.cells) for (const i of c.items) if (i.draft?.id === id) return { locked: i.draft.locked, revision: i.draft.revision }
  return null
}

function DraftDialog({ eventId, target, live, canLock, onClose }: { eventId: string; target: DraftTarget; live: { locked: boolean; revision: number } | null; canLock: boolean; onClose: (removed: boolean, text: string | null) => void }) {
  const router = useRouter()
  const { row, item, date } = target
  const draft = item.draft!
  const needsAck = !!draft.ackKey && !draft.acked
  const [acked, setAcked] = useState(false)
  const [ackError, setAckError] = useState(false)
  const [busy, setBusy] = useState<"review" | "remove" | "lock" | null>(null)
  // « Retirer ce brouillon » asks first (independent review, P3): a stacked confirmation, Cancel focused.
  const [removing, setRemoving] = useState<{ error: string | null } | null>(null)
  const [locked, setLocked] = useState(draft.locked)
  const [revision, setRevision] = useState(draft.revision)
  // After a refresh (a lock refused because the draft changed elsewhere), the dialog takes the
  // draft's real state, in place: the focused button keeps the focus, its label follows.
  const [dialogStatus, setDialogStatus] = useState("")
  const liveKey = live ? `${live.locked}:${live.revision}` : null
  const [seenLive, setSeenLive] = useState(liveKey)
  if (liveKey !== seenLive) {
    setSeenLive(liveKey)
    if (live) {
      // A label change on the focused button is not reliably voiced: the real state is said.
      if (live.locked !== locked) announce(setDialogStatus, live.locked ? "Ce brouillon est verrouillé." : "Ce brouillon n'est plus verrouillé.")
      setLocked(live.locked)
      setRevision(live.revision)
    }
  }
  const [error, setError] = useState<string | null>(null)
  const who = personName(row)
  const day = lowerFirst(dayLabel(date))
  // The person in the title (independent review, P2 #12), as in the name of the draft's button.
  const title = `Brouillon ${de(who)} : ${spokenName(item.name)}, ${day}, ${item.time}`
  const canReview = draft.stale || needsAck
  // Reviewing a generated draft locks it (#1172): said before the button, not discovered after.
  const reviewLocks = canLock && draft.source === "proposal" && !locked

  async function send(kind: "review" | "remove") {
    if (busy) return
    if (kind === "review" && needsAck && !acked) {
      flushSync(() => setAckError(true))
      document.getElementById("draft-ack")?.focus()
      return
    }
    setBusy(kind)
    if (kind === "review") setError(null)
    const fail = (text: string) => {
      setBusy(null)
      if (kind === "remove") setRemoving({ error: text })
      else setError(text)
    }
    try {
      const url = `/api/admin/events/${eventId}/drafts/${draft.id}`
      const res = kind === "review"
        ? await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, ackKey: acked ? draft.ackKey : null }) })
        : await fetch(`${url}?revision=${revision}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { fail(typeof data.error === "string" ? data.error : "L'action n'a pas abouti."); return }
    } catch {
      fail(NETWORK_ERROR)
      return
    }
    const what = `${who}, ${spokenName(item.name)}, ${day}`
    onClose(kind === "remove", kind === "remove" ? `Brouillon retiré : ${what}.` : reviewLocks ? `Relecture enregistrée, brouillon verrouillé : ${what}.` : `Relecture enregistrée : ${what}.`)
  }

  /** « Verrouiller » / « Déverrouiller » (#1172): the dialog stays open, its own status says the result. */
  async function toggleLock() {
    if (busy) return
    setBusy("lock")
    setError(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/drafts/${draft.id}/lock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, locked: !locked }) })
      const data = await res.json().catch(() => ({}))
      setBusy(null)
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "L'action n'a pas abouti.")
        startTransition(() => router.refresh())
        return
      }
      setLocked(!!data.draft?.locked)
      setRevision(data.draft?.revision ?? revision + 1)
      announce(setDialogStatus, data.draft?.locked ? "Brouillon verrouillé." : "Brouillon déverrouillé.")
      startTransition(() => router.refresh())
    } catch {
      setBusy(null)
      setError(NETWORK_ERROR)
    }
  }

  return (
    <>
      <ModalShell title={title} onClose={() => onClose(false, null)} busy={!!busy}>
        <div className="space-y-3 text-sm text-gray-800">
          <p>{who}{row.sameNameHint ? ` (${row.sameNameHint})` : ""}. {draft.source === "proposal" ? "Brouillon venu d'une proposition." : "Brouillon préparé par l'organisation."} Il ne prend aucune place et n&apos;envoie rien avant la publication.</p>
          {item.fitLabel && (
            <p id="draft-fit" className={item.fit && OUTSIDE_FITS.includes(item.fit) ? "flex items-start gap-1 text-[#92400e]" : undefined}>
              {item.fit && OUTSIDE_FITS.includes(item.fit) && <WarningIcon />}
              <span><span className="font-semibold">{item.fitLabel}.</span> {item.fitDetail}</span>
            </p>
          )}
          {draft.staleText && <p className="text-[#92400e]">{draft.staleText} Relisez-le, puis enregistrez la relecture.</p>}
          {draft.problems.length > 0 && (
            <div className="text-red-800">
              <p className="font-medium">Empêche la publication :</p>
              <ul role="list" className="space-y-0.5">{draft.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {draft.acked && !draft.stale && <p>Affectation confirmée malgré les disponibilités indiquées.</p>}
          {canLock && <p>{locked ? "Ce brouillon est verrouillé." : "Ce brouillon n'est pas verrouillé."} <span id="draft-lock-hint">Une nouvelle proposition ne remplace jamais un brouillon verrouillé.</span></p>}
          {canReview && reviewLocks && <p id="draft-review-locks">Enregistrer la relecture verrouille ce brouillon : une nouvelle proposition ne le remplacera pas.</p>}
          <p role="status" className="sr-only">{dialogStatus}</p>
          {needsAck && (
            <label className="flex min-h-11 items-start gap-2 py-1 cursor-pointer">
              <input id="draft-ack" type="checkbox" checked={acked} onChange={(e) => { setAcked(e.target.checked); if (e.target.checked) setAckError(false) }}
                aria-invalid={ackError || undefined}
                aria-describedby={[ackError && "draft-ack-error", item.fitLabel && "draft-fit"].filter(Boolean).join(" ") || undefined}
                className="mt-0.5 h-6 w-6 shrink-0 accent-blue-600" />
              <span>{ackLabel(who, "Garder")}</span>
            </label>
          )}
          {needsAck && ackError && <p id="draft-ack-error" className="text-red-700">Cochez cette case pour garder ce brouillon malgré ses disponibilités.</p>}
          {/* Mounted from the start, filled on error: an alert that appears with its text is not always read. */}
          <p role="alert" className={error ? "text-red-700" : "sr-only"}>{error}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {canReview && (
              <button type="button" onClick={() => void send("review")} aria-disabled={!!busy || undefined} aria-busy={busy === "review" || undefined} aria-describedby={reviewLocks ? "draft-review-locks" : undefined} className={`min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:opacity-60 ${focusRing}`}>
                {busy === "review" ? "Enregistrement…" : "Enregistrer la relecture"}
              </button>
            )}
            {canLock && (
              <button type="button" onClick={() => void toggleLock()} aria-describedby="draft-lock-hint" aria-disabled={!!busy || undefined} aria-busy={busy === "lock" || undefined} className={`min-h-11 rounded-xl border border-gray-500 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 aria-disabled:opacity-60 ${focusRing}`}>
                {busy === "lock" ? "Enregistrement…" : locked ? "Déverrouiller" : "Verrouiller"}
              </button>
            )}
            <button type="button" onClick={() => { if (!busy) setRemoving({ error: null }) }} aria-disabled={!!busy || undefined} className={`min-h-11 rounded-xl border border-[#b91c1c] bg-white px-4 py-2 text-sm font-medium text-[#b91c1c] hover:bg-red-50 aria-disabled:opacity-60 ${focusRing}`}>
              Retirer ce brouillon
            </button>
          </div>
        </div>
      </ModalShell>
      {removing && (
        <ConfirmActionModal
          recap={{
            title: "Retirer ce brouillon ?",
            lead: `${who}, ${spokenName(item.name)}, ${day} : le brouillon disparaît du planning. Rien n'a été publié ni envoyé.`,
            lines: [],
            confirmLabel: "Retirer le brouillon",
            danger: true,
          }}
          busy={busy === "remove"}
          error={removing.error}
          onConfirm={() => void send("remove")}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}

type OptionState = { option: DraftOption; added: boolean; acked: boolean; ackError: boolean; error: string | null }

function OptionsDialog({ eventId, target, onClose }: { eventId: string; target: CellTarget; onClose: () => void }) {
  const { row, date } = target
  const who = personName(row)
  const [items, setItems] = useState<OptionState[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const day = lowerFirst(dayLabel(date))

  useEffect(() => {
    let live = true
    announce(setStatus, "Chargement…")
    fetch(`/api/admin/events/${eventId}/drafts/options?volunteerId=${encodeURIComponent(row.volunteerId)}&date=${date}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!live) return
        if (!ok) { setLoadError(typeof data.error === "string" ? data.error : "Les créneaux n'ont pas pu être lus."); setStatus(""); return }
        const options = (data.options ?? []) as DraftOption[]
        setItems(options.map((option) => ({ option, added: false, acked: false, ackError: false, error: null })))
        announce(setStatus, options.length === 0 ? `Aucun créneau le ${day}.` : `${plural(options.length, "créneau", "créneaux")} le ${day}.`)
      })
      .catch(() => { if (live) { setLoadError(NETWORK_ERROR); setStatus("") } })
    return () => { live = false }
  }, [eventId, row.volunteerId, date, day])

  const update = (shiftId: string, patch: Partial<OptionState>) => setItems((list) => list?.map((x) => (x.option.shiftId === shiftId ? { ...x, ...patch } : x)) ?? null)

  async function add(it: OptionState) {
    if (busy) { announce(setStatus, "Un ajout est en cours : attendez sa réponse."); return }
    const o = it.option
    if (o.ackKey && !it.acked) {
      flushSync(() => update(o.shiftId, { ackError: true }))
      document.getElementById(`option-ack-${o.shiftId}`)?.focus()
      return
    }
    setBusy(o.shiftId)
    update(o.shiftId, { error: null })
    let error: string | null = null
    try {
      const res = await fetch(`/api/admin/events/${eventId}/drafts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shiftId: o.shiftId, volunteerId: row.volunteerId, ackKey: o.ackKey && it.acked ? o.ackKey : null }) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        error = typeof data.error === "string" ? data.error : "Le brouillon n'a pas été ajouté."
      }
    } catch {
      error = NETWORK_ERROR
    }
    setBusy(null)
    if (error) { update(o.shiftId, { error }); return }
    // Said once, by the focused sentence (never also by the status: it was read twice).
    flushSync(() => update(o.shiftId, { added: true }))
    document.getElementById(`option-added-${o.shiftId}`)?.focus()
  }

  return (
    <ModalShell title={`Ajouter une affectation pour ${who}, ${day}`} onClose={onClose} busy={!!busy} panelClassName="max-w-2xl">
      <div className="space-y-3 text-sm text-gray-800">
        <p role="status" className={status ? "text-sm text-gray-800" : "sr-only"}>{status}</p>
        <div role="alert">{loadError && <p className="text-red-700">{loadError}</p>}</div>
        {items && items.length > 0 && <p className="text-xs text-gray-700">Un brouillon ne prend une place qu&apos;à la publication : les places prises et les brouillons déjà prévus sont comptés à part.</p>}
        {items && (
          <ul role="list" className="space-y-3">
            {items.map((it) => {
              const o = it.option
              const workloadId = `option-workload-${o.shiftId}`
              return (
                <li key={o.shiftId} className="rounded-xl border border-gray-200 p-3 space-y-1.5">
                  <h3 className="text-sm font-semibold text-gray-900"><ShiftName name={o.name} />, {o.time}</h3>
                  <p className="text-xs text-gray-700">
                    {o.occupied === 0 ? "Aucune place prise" : `${o.occupied} ${o.occupied > 1 ? "places prises" : "place prise"}`} sur {o.capacity}
                    {o.drafted > 0 && ` ; ${plural(o.drafted, "brouillon déjà prévu", "brouillons déjà prévus")}`}
                  </p>
                  {o.fitLabel ? (
                    <p id={`option-fit-${o.shiftId}`} className={`text-xs ${o.fit && OUTSIDE_FITS.includes(o.fit) ? "flex items-start gap-1 text-[#92400e]" : ""}`}>
                      {o.fit && OUTSIDE_FITS.includes(o.fit) && <WarningIcon />}
                      <span><span className="font-semibold">{o.fitLabel}.</span> {o.fitDetail}</span>
                    </p>
                  ) : <p className="text-xs text-gray-700">Pas de disponibilités indiquées.</p>}
                  {o.workload.length > 0 && (
                    <div id={workloadId} className="text-xs text-amber-950 bg-amber-50 border border-amber-300 rounded-lg px-2 py-1">
                      <p className="font-medium">Une fois publié avec ses autres brouillons, ce programme ne respecterait plus les limites :</p>
                      <ul role="list">{o.workload.map((w) => <li key={w}>{w}</li>)}</ul>
                      <p>Le brouillon reste possible ; la publication sera refusée tant que ce point demeure.</p>
                    </div>
                  )}
                  {o.taken === "registered" ? <p className="text-xs text-gray-700">Déjà inscrit·e sur ce créneau.</p>
                    : o.taken === "draft" ? <p className="text-xs text-gray-700">Brouillon déjà prévu sur ce créneau.</p>
                      : it.added ? <p id={`option-added-${o.shiftId}`} tabIndex={-1} className={`text-xs font-medium text-[#15803d] rounded ${focusRing}`}>Brouillon ajouté<span className="sr-only"> : {spokenName(o.name)}, {o.time}</span>.</p>
                        : (
                          <>
                            {o.ackKey && (
                              <div>
                                <label className="flex min-h-11 items-start gap-2 py-1 cursor-pointer">
                                  <input id={`option-ack-${o.shiftId}`} type="checkbox" checked={it.acked} onChange={(e) => update(o.shiftId, { acked: e.target.checked, ...(e.target.checked ? { ackError: false } : {}) })}
                                    aria-invalid={it.ackError || undefined}
                                    aria-describedby={[it.ackError && `option-ack-error-${o.shiftId}`, o.fitLabel && `option-fit-${o.shiftId}`].filter(Boolean).join(" ") || undefined}
                                    className="mt-0.5 h-6 w-6 shrink-0 accent-blue-600" />
                                  <span>{ackLabel(who)}</span>
                                </label>
                                {it.ackError && <p id={`option-ack-error-${o.shiftId}`} className="text-xs text-red-700">Cochez cette case pour préparer ce brouillon malgré ses disponibilités.</p>}
                              </div>
                            )}
                            <button type="button" onClick={() => void add(it)} aria-disabled={!!busy || undefined} aria-describedby={[o.workload.length > 0 && workloadId, it.error && `option-error-${o.shiftId}`].filter(Boolean).join(" ") || undefined}
                              className={`min-h-11 rounded-xl border border-blue-600 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 aria-disabled:opacity-60 ${focusRing}`}>
                              {busy === o.shiftId ? "Ajout en cours…" : "Ajouter en brouillon"}{" "}<span className="sr-only">: {spokenName(o.name)}, {o.time}</span>
                            </button>
                            <p id={it.error ? `option-error-${o.shiftId}` : undefined} role="alert" className={it.error ? "text-xs text-red-700" : "sr-only"}>{it.error}</p>
                          </>
                        )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </ModalShell>
  )
}
