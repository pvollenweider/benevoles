"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { startTransition, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { announce } from "@/lib/announce"
import { focusFirstAvailable } from "@/lib/focus-return"
import { NETWORK_ERROR } from "@/lib/use-submit"
import { TABLE_SCROLL_HINT } from "@/lib/table-overflow"
import { fmtShortDate } from "@/lib/registrations-list"
import { dayLabel } from "@/lib/spoken-time"
import { fmtDuration } from "@/lib/signup-recap"
import { ackLabel, type FitState } from "@/lib/availability-assist"
import type { BoardItem, BoardRow, DraftOption } from "@/lib/draft-board"
import type { DraftBoardData } from "@/lib/draft-board-data"
import type { DraftProblem } from "@/lib/draft-assignments"
import { useHidesColumns } from "@/components/admin/members/useHidesColumns"
import ModalShell from "@/components/admin/ModalShell"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const linkClass = `font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`
/** A jump target (the summary's links): a visible mark where focus lands, inset so the scroll region does not clip it. */
const targetRing = "outline-hidden focus:ring-2 focus:ring-inset focus:ring-blue-600"
const smallButton = `min-h-9 rounded-lg border border-gray-500 bg-white px-3 py-1 text-xs font-medium text-gray-900 hover:bg-gray-50 ${focusRing}`

type Layout = "grid" | "day"

/** Status pairs of DESIGN.md §2, never colour alone: the word is always there. */
const KIND_BADGE: Record<BoardItem["kind"], { label: string; className: string }> = {
  confirmed: { label: "Confirmée", className: "bg-[#dcfce7] text-[#15803d]" },
  pending: { label: "En attente", className: "bg-[#fef3c7] text-[#92400e]" },
  draft: { label: "Brouillon", className: "bg-[#f3f4f6] text-[#4b5563]" },
}
const OUTSIDE_FITS: FitState[] = ["partial", "outside"]

const ids = {
  cell: (l: Layout, v: string, d: string) => `${l}-cell-${v}-${d}`,
  add: (l: Layout, v: string, d: string) => `${l}-add-${v}-${d}`,
  draft: (l: Layout, id: string) => `${l}-draft-${id}`,
  row: (l: Layout, v: string) => `${l}-row-${v}`,
}

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

function hoursText(r: BoardRow): string {
  const parts = [r.committedMinutes > 0 ? `${fmtDuration(r.committedMinutes)} confirmées ou en attente` : "Aucune mission", r.draftMinutes > 0 ? `${fmtDuration(r.draftMinutes)} en brouillon` : null]
  return parts.filter(Boolean).join(", ")
}

type DraftTarget = { row: BoardRow; date: string; item: BoardItem; layout: Layout }
type CellTarget = { row: BoardRow; date: string; layout: Layout }

/**
 * « Affectations en brouillon » (#1146, lot C): the summary and « Publier les affectations », then
 * the person × day planning (a captioned table in a labelled scroll region on a wide screen, a day
 * list below md or on demand). Accessibility review (2026-10-30, accessibility-lead): ids prefixed
 * by layout (both are in the DOM, one hidden); the row header holds the name only, hours and
 * findings in a « Résumé » column; short dates shown, full dates read; summary links focus the
 * visible cell; one page-level polite status outside the dialogs; publish confirmation is a plain
 * dialog; a refusal is a focused block, not a live region; focus after every action.
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
  const [status, setStatus] = useState("")
  const [view, setView] = useState<Layout>(initialView)
  const [confirming, setConfirming] = useState<{ busy: boolean; error: string | null } | null>(null)
  const [refusal, setRefusal] = useState<{ lead: string; problems: DraftProblem[] } | null>(null)
  const [draftOpen, setDraftOpen] = useState<DraftTarget | null>(null)
  const [cellOpen, setCellOpen] = useState<CellTarget | null>(null)
  const publishKey = useRef<string | null>(null)
  const publishHeading = useRef<HTMLHeadingElement>(null)
  const refusalHeading = useRef<HTMLHeadingElement>(null)
  const regionRef = useRef<HTMLDivElement>(null)
  const hides = useHidesColumns(regionRef, [board.rows.length, board.dates.length, view])

  const rowsById = useMemo(() => new Map(board.rows.map((r) => [r.volunteerId, r])), [board.rows])
  const { summary } = board
  const blocking = summary.problems.length
  const nothing = summary.selection.length === 0
  const publishBlocked = nothing ? "Aucune affectation en brouillon à publier." : blocking > 0 ? `Réglez d'abord ${blocking > 1 ? `les ${blocking} points listés` : "le point listé"} ci-dessus.` : null

  const query = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(scope === "all" ? { scope: "all" } : {}), ...extra })
    const s = p.toString()
    return s ? `${basePath}?${s}` : basePath
  }

  function publishedText(published: number, people: number) {
    return `${plural(published, "affectation publiée", "affectations publiées")} pour ${plural(people, "personne", "personnes")}.`
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
      flushSync(() => { setConfirming(null); setRefusal(null) })
      publishHeading.current?.focus()
      announce(setStatus, publishedText(data.published ?? 0, data.people ?? 0))
      startTransition(() => router.refresh())
      return
    }
    publishKey.current = null
    if (data.problems && data.problems.length > 0) {
      flushSync(() => { setConfirming(null); setRefusal({ lead: data.error ?? "La publication n'a pas eu lieu.", problems: data.problems! }) })
      refusalHeading.current?.focus()
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

  const problemLink = (p: DraftProblem & { anchor: string | null }) => {
    const row = p.volunteerId ? rowsById.get(p.volunteerId) : undefined
    const date = p.anchor?.match(/(\d{4}-\d{2}-\d{2})$/)?.[1] ?? null
    if (!row) return null
    const text = date ? `${personName(row)}, ${lowerFirst(dayLabel(date))}` : personName(row)
    const href = date ? `${query({ day: date, ...(view === "day" ? { view: "day" } : {}) })}#${ids.cell(view === "day" ? "day" : "grid", row.volunteerId, date)}` : `#${ids.row("grid", row.volunteerId)}`
    return <a href={href} onClick={(e) => jump(e, row.volunteerId, date)} className={linkClass}>{text}</a>
  }

  function afterDraftClose(target: DraftTarget, removed: boolean, text: string | null) {
    if (removed) {
      flushSync(() => setDraftOpen(null))
      focusFirstAvailable([() => document.getElementById(ids.add(target.layout, target.row.volunteerId, target.date)), () => document.getElementById(ids.cell(target.layout, target.row.volunteerId, target.date))])
    } else setDraftOpen(null)
    if (text) announce(setStatus, text)
    startTransition(() => router.refresh())
  }

  const showDay = view === "day"
  const dayRows = day ? board.rows : []

  return (
    <div className="space-y-8">
      <p role="status" className={status ? "text-sm text-gray-800" : "sr-only"}>{status}</p>

      <section aria-labelledby="drafts-publish-heading" className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 id="drafts-publish-heading" ref={publishHeading} tabIndex={-1} className="text-base font-semibold text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Publier les affectations</h2>
        <p className="text-sm text-gray-800" data-drafts-counts="1">
          {nothing ? "Aucune affectation en brouillon pour l'instant." : `${plural(summary.drafts, "affectation en brouillon", "affectations en brouillon")} pour ${plural(summary.people, "personne", "personnes")}`}
          {!nothing && summary.stale > 0 && ` ; ${plural(summary.stale, "à revoir", "à revoir")}`}
          {!nothing && summary.ackMissing > 0 && ` ; ${plural(summary.ackMissing, "confirmation à donner", "confirmations à donner")}`}
          {!nothing && "."}
        </p>
        {blocking > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{blocking > 1 ? `${blocking} points empêchent la publication` : "1 point empêche la publication"}</h3>
            <ul role="list" className="mt-1 space-y-1 text-sm text-gray-800">
              {summary.problems.map((p, i) => <li key={`${p.code}-${p.draftId ?? p.volunteerId ?? p.shiftId}-${i}`}>{problemLink(p)}{problemLink(p) ? " : " : ""}{p.message}</li>)}
            </ul>
          </div>
        )}
        {refusal && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            <h3 ref={refusalHeading} tabIndex={-1} className="font-semibold rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">La publication n&apos;a pas eu lieu</h3>
            <p>{refusal.lead}</p>
            <ul role="list" className="mt-1 list-disc pl-5 space-y-0.5">{refusal.problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul>
          </div>
        )}
        <button
          type="button"
          onClick={() => { if (!publishBlocked) { setRefusal(null); setConfirming({ busy: false, error: null }) } }}
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
          <p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-xl p-6 text-center">Personne à afficher : demandez d&apos;abord leurs disponibilités, ou voyez tous les membres actifs.</p>
        ) : (
          <>
            {!showDay && (
              <div className="hidden md:block space-y-2">
                <a href="#drafts-after-grid" className={`text-sm ${linkClass}`}>Passer le planning</a>
                {hides && <p id="drafts-grid-hint" className="max-w-[65ch] text-sm text-gray-600">{TABLE_SCROLL_HINT}</p>}
                <div ref={regionRef} role="region" aria-label="Planning des affectations" aria-describedby={hides ? "drafts-grid-hint" : undefined} tabIndex={hides ? 0 : undefined} className={`relative bg-white border border-gray-200 rounded-xl overflow-x-auto ${focusRing}`}>
                  <table className="text-sm border-collapse">
                    <caption className="sr-only">Affectations par personne et par jour, avec les brouillons</caption>
                    <thead className="bg-gray-50 text-xs text-gray-700">
                      <tr>
                        <th scope="col" className="text-left px-3 py-2 font-medium min-w-[10rem]">Personne</th>
                        <th scope="col" className="text-left px-3 py-2 font-medium min-w-[12rem]">Résumé</th>
                        {board.dates.map((d) => (
                          <th key={d} scope="col" className="text-left px-3 py-2 font-medium min-w-[11rem] whitespace-nowrap">
                            <span aria-hidden="true">{fmtShortDate(d)}</span><span className="sr-only">{dayLabel(d)}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 align-top">
                      {board.rows.map((r) => (
                        <tr key={r.volunteerId}>
                          <th scope="row" id={ids.row("grid", r.volunteerId)} tabIndex={-1} className={`text-left px-3 py-2 font-medium text-gray-900 ${targetRing}`}>
                            {personName(r)}
                            {r.sameNameHint && <><span className="sr-only">, </span><span className="block text-xs font-normal text-gray-700 break-all">{r.sameNameHint}</span></>}
                          </th>
                          <td className="px-3 py-2"><RowSummary row={r} /></td>
                          {r.cells.map((c) => (
                            <td key={c.date} id={ids.cell("grid", r.volunteerId, c.date)} tabIndex={-1} className={`px-3 py-2 ${targetRing}`}>
                              <CellContent row={r} cell={c} layout="grid" onDraft={(item) => setDraftOpen({ row: r, date: c.date, item, layout: "grid" })} onAdd={() => setCellOpen({ row: r, date: c.date, layout: "grid" })} />
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
              <ul role="list" className="space-y-3">
                {dayRows.map((r) => {
                  const c = r.cells.find((x) => x.date === day)!
                  return (
                    <li key={r.volunteerId} id={ids.cell("day", r.volunteerId, day!)} tabIndex={-1} className={`bg-white border border-gray-200 rounded-xl p-3 space-y-2 ${targetRing}`}>
                      <h4 id={ids.row("day", r.volunteerId)} tabIndex={-1} className={`text-sm font-semibold text-gray-900 break-words rounded ${targetRing}`}>
                        {personName(r)}
                        {r.sameNameHint && <><span className="sr-only">, </span><span className="block text-xs font-normal text-gray-700 break-all">{r.sameNameHint}</span></>}
                      </h4>
                      <RowSummary row={r} />
                      <CellContent row={r} cell={c} layout="day" onDraft={(item) => setDraftOpen({ row: r, date: c.date, item, layout: "day" })} onAdd={() => setCellOpen({ row: r, date: c.date, layout: "day" })} />
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
            title: "Publier les affectations ?",
            lead: `${plural(summary.drafts, "affectation", "affectations")} pour ${plural(summary.people, "personne", "personnes")} : chaque personne avec une adresse email reçoit un seul email avec ses missions.`,
            lines: ["Les places sont prises maintenant ; tout est publié d'un coup, ou rien si un point bloque."],
            confirmLabel: "Publier",
            danger: false,
          }}
          busy={confirming.busy}
          error={confirming.error}
          onConfirm={() => void publish()}
          onCancel={() => { publishKey.current = null; setConfirming(null) }}
        />
      )}
      {draftOpen && <DraftDialog eventId={eventId} target={draftOpen} canLock={proposals} onClose={(removed, text) => afterDraftClose(draftOpen, removed, text)} />}
      {cellOpen && <OptionsDialog eventId={eventId} target={cellOpen} onClose={() => { setCellOpen(null); startTransition(() => router.refresh()) }} />}
    </div>
  )
}

function RowSummary({ row }: { row: BoardRow }) {
  return (
    <div className="space-y-1 text-xs text-gray-700">
      <p>{hoursText(row)}</p>
      {row.reviewTexts.map((t) => <p key={t} className="text-[#92400e]">{t}</p>)}
      {row.findings.length > 0 && (
        <div className="text-red-800">
          <p className="font-medium">Ne peut pas être publié ainsi :</p>
          <ul role="list" className="space-y-0.5">{row.findings.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

function CellContent({ row, cell, layout, onDraft, onAdd }: { row: BoardRow; cell: BoardRow["cells"][number]; layout: Layout; onDraft: (item: BoardItem) => void; onAdd: () => void }) {
  const who = `${personName(row)}${row.sameNameHint ? ` (${row.sameNameHint})` : ""}`
  const date = lowerFirst(dayLabel(cell.date))
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-gray-700">{cell.availability}</p>
      {cell.items.length > 0 && (
        <ul role="list" className="space-y-1.5">
          {cell.items.map((item) => (
            <li key={`${item.kind}-${item.draft?.id ?? item.shiftId}`} className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-900 space-y-1">
              <p><span className="font-medium"><ShiftName name={item.name} /></span>, {item.time}</p>
              <p className="flex flex-wrap gap-1">
                <span className={`inline-block rounded-full border border-transparent px-2 py-0.5 font-medium ${KIND_BADGE[item.kind].className}`}>{KIND_BADGE[item.kind].label}</span>
                {item.fit && OUTSIDE_FITS.includes(item.fit) && <span className="inline-block rounded-full border border-transparent px-2 py-0.5 font-medium bg-[#f3f4f6] text-[#374151]">{item.fitLabel}</span>}
                {item.draft?.source === "proposal" && <span className="inline-block rounded-full border border-transparent px-2 py-0.5 font-medium bg-[#f3f4f6] text-[#4b5563]">Proposé</span>}
                {item.draft?.locked && <span className="inline-block rounded-full border border-transparent px-2 py-0.5 font-medium bg-[#f3f4f6] text-[#4b5563]">Verrouillé</span>}
              </p>
              {item.draft?.staleText && <p className="text-[#92400e]">{item.draft.staleText}</p>}
              {item.draft && !item.draft.stale && item.draft.ackKey && !item.draft.acked && <p className="text-[#92400e]">Confirmation à donner avant publication.</p>}
              {item.draft && item.draft.problems.length > 0 && <p className="text-red-800">{item.draft.problems[0]}</p>}
              {item.draft && (
                <button id={ids.draft(layout, item.draft.id)} type="button" onClick={() => onDraft(item)} className={smallButton}>
                  Voir le brouillon<span className="sr-only">, {who}, {spokenName(item.name)}, {item.time}, {date}{item.draft.source === "proposal" ? ", proposé" : ""}{item.draft.locked ? ", verrouillé" : ""}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <button id={ids.add(layout, row.volunteerId, cell.date)} type="button" onClick={onAdd} className={`${smallButton} ${layout === "day" ? "min-h-11" : ""}`}>
        Ajouter{" "}<span className="sr-only">une affectation pour {who} le {date}</span>
      </button>
    </div>
  )
}

function DraftDialog({ eventId, target, canLock, onClose }: { eventId: string; target: DraftTarget; canLock: boolean; onClose: (removed: boolean, text: string | null) => void }) {
  const router = useRouter()
  const { row, item, date } = target
  const draft = item.draft!
  const needsAck = !!draft.ackKey && !draft.acked
  const [acked, setAcked] = useState(false)
  const [ackError, setAckError] = useState(false)
  const [busy, setBusy] = useState<"review" | "remove" | "lock" | null>(null)
  const [locked, setLocked] = useState(draft.locked)
  const [revision, setRevision] = useState(draft.revision)
  const [dialogStatus, setDialogStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const who = personName(row)
  const title = `Brouillon : ${spokenName(item.name)}, ${lowerFirst(dayLabel(date))}, ${item.time}`
  const canReview = draft.stale || needsAck

  async function send(kind: "review" | "remove") {
    if (busy) return
    if (kind === "review" && needsAck && !acked) {
      flushSync(() => setAckError(true))
      document.getElementById("draft-ack")?.focus()
      return
    }
    setBusy(kind)
    setError(null)
    try {
      const url = `/api/admin/events/${eventId}/drafts/${draft.id}`
      const res = kind === "review"
        ? await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, ackKey: acked ? draft.ackKey : null }) })
        : await fetch(`${url}?revision=${revision}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBusy(null)
        setError(typeof data.error === "string" ? data.error : "L'action n'a pas abouti.")
        return
      }
    } catch {
      setBusy(null)
      setError(NETWORK_ERROR)
      return
    }
    const what = `${who}, ${spokenName(item.name)}, ${lowerFirst(dayLabel(date))}`
    onClose(kind === "remove", kind === "remove" ? `Brouillon retiré : ${what}.` : `Relecture enregistrée : ${what}.`)
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
    <ModalShell title={title} onClose={() => onClose(false, null)} busy={!!busy}>
      <div className="space-y-3 text-sm text-gray-800">
        <p>{who}{row.sameNameHint ? ` (${row.sameNameHint})` : ""}. {draft.source === "proposal" ? "Brouillon venu d'une proposition." : "Brouillon préparé par l'organisation."} Il ne prend aucune place et n&apos;envoie rien avant la publication.</p>
        {item.fitLabel && <p id="draft-fit"><span className="font-medium">{item.fitLabel}.</span> {item.fitDetail}</p>}
        {draft.staleText && <p className="text-[#92400e]">{draft.staleText} Relisez-le, puis enregistrez la relecture.</p>}
        {draft.problems.length > 0 && (
          <div className="text-red-800">
            <p className="font-medium">Empêche la publication :</p>
            <ul role="list" className="space-y-0.5">{draft.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {draft.acked && !draft.stale && <p>Affectation confirmée malgré les disponibilités indiquées.</p>}
        {canLock && <p>{locked ? "Ce brouillon est verrouillé." : "Ce brouillon n'est pas verrouillé."} <span id="draft-lock-hint">Une nouvelle proposition ne remplace jamais un brouillon verrouillé.</span></p>}
        <p role="status" className="sr-only">{dialogStatus}</p>
        {needsAck && (
          <label className="flex min-h-11 items-start gap-2 py-1 cursor-pointer">
            <input id="draft-ack" type="checkbox" checked={acked} onChange={(e) => { setAcked(e.target.checked); if (e.target.checked) setAckError(false) }}
              aria-invalid={ackError || undefined}
              aria-describedby={[ackError && "draft-ack-error", item.fitLabel && "draft-fit"].filter(Boolean).join(" ") || undefined}
              className="mt-0.5 h-6 w-6 shrink-0 accent-blue-600" />
            <span>{ackLabel(who, "Publier")}</span>
          </label>
        )}
        {needsAck && ackError && <p id="draft-ack-error" className="text-red-700">Cochez cette case pour enregistrer la relecture malgré ses disponibilités.</p>}
        {/* Mounted from the start, filled on error: an alert that appears with its text is not always read. */}
        <p role="alert" className={error ? "text-red-700" : "sr-only"}>{error}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {canReview && (
            <button type="button" onClick={() => void send("review")} aria-disabled={!!busy || undefined} aria-busy={busy === "review" || undefined} className={`min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:opacity-60 ${focusRing}`}>
              {busy === "review" ? "Enregistrement…" : "Enregistrer la relecture"}
            </button>
          )}
          {canLock && (
            <button type="button" onClick={() => void toggleLock()} aria-describedby="draft-lock-hint" aria-disabled={!!busy || undefined} aria-busy={busy === "lock" || undefined} className={`min-h-11 rounded-xl border border-gray-500 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 aria-disabled:opacity-60 ${focusRing}`}>
              {busy === "lock" ? "Enregistrement…" : locked ? "Déverrouiller" : "Verrouiller"}
            </button>
          )}
          <button type="button" onClick={() => void send("remove")} aria-disabled={!!busy || undefined} aria-busy={busy === "remove" || undefined} className={`min-h-11 rounded-xl border border-[#b91c1c] bg-white px-4 py-2 text-sm font-medium text-[#b91c1c] hover:bg-red-50 aria-disabled:opacity-60 ${focusRing}`}>
            {busy === "remove" ? "Retrait…" : "Retirer ce brouillon"}
          </button>
        </div>
      </div>
    </ModalShell>
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
    if (busy) { announce(setStatus, "Un ajout est en cours : attendez sa réponse."); return }
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
    flushSync(() => update(o.shiftId, { added: true }))
    document.getElementById(`option-added-${o.shiftId}`)?.focus()
    announce(setStatus, `Brouillon ajouté : ${who} sur ${spokenName(o.name)}. Il ne prend pas de place avant la publication.`)
  }

  return (
    <ModalShell title={`Ajouter une affectation pour ${who}, ${day}`} onClose={onClose} busy={!!busy} panelClassName="max-w-2xl">
      <div className="space-y-3 text-sm text-gray-800">
        <p role="status" className={status ? "text-sm text-gray-800" : "sr-only"}>{status}</p>
        <div role="alert">{loadError && <p className="text-red-700">{loadError}</p>}</div>
        {items && items.length > 0 && <p className="text-xs text-gray-700">Les places indiquées ne comptent que les inscriptions : les brouillons ne prennent pas de place.</p>}
        {items && (
          <ul role="list" className="space-y-3">
            {items.map((it) => {
              const o = it.option
              const workloadId = `option-workload-${o.shiftId}`
              return (
                <li key={o.shiftId} className="rounded-xl border border-gray-200 p-3 space-y-1.5">
                  <h3 className="text-sm font-semibold text-gray-900"><ShiftName name={o.name} />, {o.time}</h3>
                  <p className="text-xs text-gray-700">{o.occupied === 0 ? "Aucune place prise" : `${o.occupied} ${o.occupied > 1 ? "places prises" : "place prise"}`} sur {o.capacity}</p>
                  {o.fitLabel ? <p id={`option-fit-${o.shiftId}`} className="text-xs"><span className="font-medium">{o.fitLabel}.</span> {o.fitDetail}</p> : <p className="text-xs text-gray-700">Pas de disponibilités indiquées.</p>}
                  {o.workload.length > 0 && (
                    <div id={workloadId} className="text-xs text-amber-950 bg-amber-50 border border-amber-300 rounded-lg px-2 py-1">
                      <p className="font-medium">Une fois publié avec ses autres brouillons, ce programme ne respecterait plus les limites :</p>
                      <ul role="list">{o.workload.map((w) => <li key={w}>{w}</li>)}</ul>
                      <p>Le brouillon reste possible ; la publication sera refusée tant que ce point demeure.</p>
                    </div>
                  )}
                  {o.taken === "registered" ? <p className="text-xs text-gray-700">Déjà inscrit·e sur ce créneau.</p>
                    : o.taken === "draft" ? <p className="text-xs text-gray-700">Brouillon déjà prévu sur ce créneau.</p>
                      : it.added ? <p id={`option-added-${o.shiftId}`} tabIndex={-1} className={`text-xs font-medium text-[#15803d] rounded ${focusRing}`}>Brouillon ajouté.</p>
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
