"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { startTransition, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { flushSync } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { announce } from "@/lib/announce"
import { NETWORK_ERROR } from "@/lib/use-submit"
import { TABLE_SCROLL_HINT } from "@/lib/table-overflow"
import { dayLabel } from "@/lib/spoken-time"
import { fmtDuration } from "@/lib/signup-recap"
import { staleSentence, type InputPart, type ProposalConfig } from "@/lib/proposal-config"
import { assignmentSentence, gapSentence, personSentence, stateSentence, type ProposalReport } from "@/lib/proposal-explanations"
import {
  ANOTHER_HINT, anotherOffer, anotherReplaceRecap, coverageDetails, coverageLine, droppedSentence, fillMissingTargets, formatHours, formToConfig, historyEntry, ONLY_ONE_SENTENCE,
  posteChoicesFrom, replacedDraftCount, rotationSummary, runLine, runStateLabel, runTone, sameAsSentence, scopeShiftIds, summaryProblems, TARGET_FIELD_ERROR, withoutProblem,
  type FormProblem, type PersonChoice, type PosteChoice, type RunTone,
} from "@/lib/proposal-view"
import type { ProposalPageData } from "@/lib/proposal-page-data"
import { useHidesColumns } from "@/components/admin/members/useHidesColumns"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const linkClass = `font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`
const smallButton = `min-h-11 rounded-lg border border-gray-500 bg-white px-3 py-1 text-sm font-medium text-gray-900 hover:bg-gray-50 aria-disabled:opacity-60 ${focusRing}`
const primaryButton = `min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:opacity-60 ${focusRing}`
const input = `min-h-11 rounded-lg border border-gray-500 bg-white px-2 py-1 text-sm text-gray-900 ${focusRing}`
const summaryClass = `min-h-11 cursor-pointer py-2 text-sm font-medium text-gray-900 rounded ${focusRing}`
const POLL_MS = 1_500
const WIDE = "(min-width: 768px)"

type Run = NonNullable<ProposalPageData["run"]>
type Written = { created?: { shiftId: string; volunteerId: string }[]; dropped?: { shiftId: string; volunteerId: string; reason: string }[]; replaced?: string[]; staleAtWrite?: InputPart[]; error?: string } | null

/** Status pairs of DESIGN.md §2, the word always written; red only for a real failure. */
const TONE_CLASS: Record<RunTone, string> = {
  neutral: "bg-[#f3f4f6] text-[#374151]",
  complete: "bg-[#dbeafe] text-[#1d4ed8]",
  warning: "bg-[#fef3c7] text-[#92400e]",
  error: "bg-[#fee2e2] text-[#b91c1c]",
}
function StateBadge({ run }: { run: { status: string; outcome: string | null } }) {
  return <span className={`inline-block rounded-full border border-transparent px-2 py-0.5 text-xs font-medium ${TONE_CLASS[runTone(run)]}`}>{runStateLabel(run)}</span>
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
const isDone = (r: { status: string } | null) => !!r && r.status !== "queued" && r.status !== "running"
const runDate = (d: Date | string) => new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Zurich", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })

/** What is announced when a run changes state: its state and, once done, the key counts. */
function doneText(r: Run): string {
  if (!isDone(r)) return `Proposition : ${runStateLabel(r).toLowerCase()}.`
  const cov = r.report?.coverage
  const parts = [`Proposition terminée : ${runStateLabel(r).toLowerCase()}.`]
  if (cov) parts.push(`${coverageLine(cov)}.`)
  if (r.writtenAt) parts.push(`${plural(r.writtenCount, "affectation écrite", "affectations écrites")} en brouillon.`)
  // Said once the run ends, as the page shows it under the result.
  if (r.sameAs) parts.push(sameAsSentence(r.sameAs))
  else if (anotherOffer(r) === "only_one") parts.push(ONLY_ONE_SENTENCE)
  return parts.join(" ")
}

/** The field an error link leads to: the variant shown at this width (table from md up, cards below), opened if folded. */
function problemTarget(field: string): HTMLElement | null {
  const wide = typeof window.matchMedia === "function" ? window.matchMedia(WIDE).matches : true
  const shown = document.getElementById(wide ? field : `m-${field}`) ?? document.getElementById(wide ? `m-${field}` : field) ?? document.getElementById(field)
  return shown
}
/** Opens the folded settings that hold a field with a problem, so the field and its error show. */
function openFoldsOf(problems: readonly FormProblem[]) {
  for (const p of problems) for (const id of [p.field, `m-${p.field}`]) {
    const details = document.getElementById(id)?.closest("details")
    if (details) details.open = true
  }
}

/**
 * « Proposition d'affectations » (#1172): when a run is shown, its result comes first; then
 * « Nouvelle proposition »: what is checked, the scope, the targets, the folded rotation and
 * computation settings, and the launch. A proposal only ever writes draft assignments; nothing is
 * published here. Accessibility reviews (accessibility-lead, 2026-10-31 and 2026-10-30): one
 * page-level polite status; one always-mounted alert for the follow-up; focus on the result
 * heading after a launch, a stop that ends, or a partial write; the launch button stays focusable
 * when it cannot be used (aria-disabled with the reason); people and postes as tables from md up,
 * one fieldset per row below, each control named with its person or poste; an error link opens the
 * folded settings and focuses the field shown at this width; several people without a target are
 * one error item with its own « Appliquer la suggestion » button. « Proposer une autre répartition »
 * (owner decision 2026-10-31, replacing the seed field): under a finished result, the stored choices
 * of that run again with another seed, never the form's; its own confirmation when it replaces
 * proposed drafts, its failures in the page's alert, the focus kept on it (accessibility review).
 */
export default function ProposalWorkspace({ data, eventInfoHref, draftsHref, basePath }: {
  data: ProposalPageData
  eventInfoHref: string
  draftsHref: string
  basePath: string
}) {
  const router = useRouter()
  const last = (data.lastConfiguration ?? null) as Partial<ProposalConfig> | null
  const shiftById = useMemo(() => new Map(data.shifts.map((s) => [s.id, s])), [data.shifts])
  const pageShifts = useMemo(() => data.shifts.map((s) => ({ id: s.id, roleName: s.roleName, date: s.date, capacity: s.capacity, open: s.open })), [data.shifts])
  const openDates = useMemo(() => data.dates.filter((d) => data.shifts.some((s) => s.date === d && s.open)), [data.dates, data.shifts])

  const [dates, setDates] = useState<string[]>(() => {
    const fromLast = (last?.scope?.shiftIds ?? []).map((id) => shiftById.get(id)?.date).filter((d): d is string => !!d && openDates.includes(d))
    return fromLast.length > 0 ? [...new Set(fromLast)] : openDates
  })
  const [postes, setPostes] = useState<string[]>(() => {
    const fromLast = (last?.scope?.shiftIds ?? []).map((id) => shiftById.get(id)?.roleName).filter((r): r is string => !!r)
    return fromLast.length > 0 ? [...new Set(fromLast)] : data.postes.map((p) => p.roleName)
  })
  const [people, setPeople] = useState<PersonChoice[]>(() => {
    const included = last?.scope?.volunteerIds ? new Set(last.scope.volunteerIds) : null
    const prefOf = new Map((last?.preferences ?? []).map((p) => [p.volunteerId, p]))
    return data.people.map((p) => ({
      volunteerId: p.volunteerId,
      included: included ? included.has(p.volunteerId) : p.answered,
      // Never a hidden default: an empty target stays empty until the organiser fills it (P14).
      targetHours: p.targetMinutes != null ? formatHours(p.targetMinutes) : "",
      prefer: prefOf.get(p.volunteerId)?.prefer?.[0] ?? "",
      avoid: prefOf.get(p.volunteerId)?.avoid?.[0] ?? "",
    }))
  })
  const [posteChoices, setPosteChoices] = useState<PosteChoice[]>(() => posteChoicesFrom(last, pageShifts, data.postes.map((p) => p.roleName)))
  const [maxConsecutive, setMaxConsecutive] = useState(last?.rotation ? (last.rotation.maxConsecutiveDays == null ? "" : String(last.rotation.maxConsecutiveDays)) : "")
  const [maxNights, setMaxNights] = useState(last?.rotation ? (last.rotation.maxNightAddOns == null ? "" : String(last.rotation.maxNightAddOns)) : "")
  const [problems, setProblems] = useState<FormProblem[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  const [run, setRun] = useState<Run | null>(data.run)
  const lastState = useRef(data.run ? `${data.run.status}:${data.run.outcome}` : "")
  const pollFailed = useRef(false)
  const resultHeading = useRef<HTMLHeadingElement>(null)
  // The page keeps this component mounted (stable key): another run from the server (a link of
  // « Propositions précédentes », or the refresh after a launch whose follow-up failed) replaces
  // the one shown, and the result heading takes the focus.
  const shownId = useRef(data.run?.id ?? null)
  useEffect(() => {
    if (!data.run || data.run.id === shownId.current) return
    shownId.current = data.run.id
    lastState.current = `${data.run.status}:${data.run.outcome}`
    flushSync(() => { setRun(data.run); setAlert(null) })
    resultHeading.current?.focus()
  }, [data.run])
  const [status, setStatus] = useState("")
  /** The follow-up's one visible alert (a failed stop, a lost follow-up); `reload`: offer to reload. */
  const [alert, setAlert] = useState<{ text: string; reload: boolean } | null>(null)
  const [busy, setBusy] = useState<"cancel" | "write" | null>(null)
  const [confirmWrite, setConfirmWrite] = useState<{ error: string | null } | null>(null)
  const [confirmRelaunch, setConfirmRelaunch] = useState<number | null>(null)
  const [confirmAnother, setConfirmAnother] = useState<{ count: number; runId: string; ordinal: number } | null>(null)
  const launchKey = useRef<string | null>(null)
  /** The key of one « another » request, kept through a retry: the same run comes back. */
  const anotherKey = useRef<{ runId: string; key: string } | null>(null)
  const errorHeading = useRef<HTMLHeadingElement>(null)
  const peopleHeading = useRef<HTMLHeadingElement>(null)
  const newHeading = useRef<HTMLHeadingElement>(null)
  const launchButton = useRef<HTMLButtonElement>(null)
  const peopleRegion = useRef<HTMLDivElement>(null)
  const posteRegion = useRef<HTMLDivElement>(null)
  const hidesPeople = useHidesColumns(peopleRegion, [people.length])
  const hidesPostes = useHidesColumns(posteRegion, [posteChoices.length])

  const nameOf = (id: string) => data.names[id] ?? "Personne retirée"
  const scope = scopeShiftIds(pageShifts, dates, postes)
  const seats = scope.reduce((n, id) => { const s = shiftById.get(id)!; return n + Math.max(0, s.capacity - s.held) }, 0)
  const countLine = `${plural(scope.length, "créneau", "créneaux")}, ${plural(seats, "place à pourvoir", "places à pourvoir")}`
  const protectionOn = data.protection === "on"
  const active = !!run && !isDone(run)
  const launchBlocked = !protectionOn ? "La protection des pauses et de la charge n'est pas activée et complète : activez-la dans les informations de l'événement." : active ? "Une proposition est en cours : attendez qu'elle finisse ou arrêtez-la." : null
  const items = summaryProblems(problems)
  const suggestionOf = (id: string) => data.people.find((x) => x.volunteerId === id)?.suggestionMinutes ?? 0

  // The count line, announced once the choices settle.
  const firstCount = useRef(true)
  useEffect(() => {
    if (firstCount.current) { firstCount.current = false; return }
    const t = setTimeout(() => announce(setStatus, countLine), 800)
    return () => clearTimeout(t)
  }, [countLine])

  // Following a run: poll while it waits or computes; announce each change of state, once.
  useEffect(() => {
    if (!run || isDone(run)) return
    const id = run.id
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/events/${data.eventId}/proposals/${id}`, { cache: "no-store" })
        if (!res.ok) throw new Error("poll")
        const body = (await res.json()) as { run: Run }
        if (pollFailed.current) { pollFailed.current = false; setAlert(null) }
        const next = body.run
        const state = `${next.status}:${next.outcome}`
        if (state !== lastState.current) {
          lastState.current = state
          // The stop button goes away with the computation: its focus moves to the result heading,
          // never away from anything else the organiser is on.
          const focusLeft = document.activeElement?.id === "proposal-cancel" || document.activeElement === document.body
          flushSync(() => setRun(next))
          if (focusLeft && isDone(next)) resultHeading.current?.focus()
          announce(setStatus, doneText(next))
          if (isDone(next)) startTransition(() => router.refresh())
        } else setRun(next)
      } catch {
        // Said once, visibly; it goes away as soon as a reading succeeds again.
        if (!pollFailed.current) { pollFailed.current = true; setAlert({ text: "Le suivi du calcul est interrompu : rechargez la page pour voir où il en est.", reload: true }) }
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [run, data.eventId, router])

  const clear = (field: string) => setProblems((list) => withoutProblem(list, field))
  const updatePerson = (id: string, patch: Partial<PersonChoice>) => {
    setPeople((list) => list.map((p) => (p.volunteerId === id ? { ...p, ...patch } : p)))
    if ("targetHours" in patch) clear(`target-${id}`)
    if ("prefer" in patch || "avoid" in patch) clear(`avoid-${id}`)
    if ("included" in patch) { clear("proposal-people"); if (!patch.included) clear(`target-${id}`) }
  }
  const updatePoste = (i: number, roleName: string, patch: Partial<PosteChoice>) => {
    setPosteChoices((list) => list.map((p) => (p.roleName === roleName ? { ...p, ...patch } : p)))
    if ("category" in patch) clear(`category-${i}`)
    if ("reserve" in patch || "reserveText" in patch) clear(`reserve-${i}`)
  }
  /** The reserve field: a whole number is kept as a number, anything else as text for the check. */
  const reserveChange = (text: string): Partial<PosteChoice> => (/^\d{1,3}$/.test(text.trim()) ? { reserve: Number(text.trim()), reserveText: undefined } : { reserveText: text })
  const problemOf = (field: string) => problems.find((p) => p.field === field) ?? null

  function applySuggestion() {
    let changed = 0
    const next = people.map((p) => {
      if (!p.included) return p
      const value = formatHours(suggestionOf(p.volunteerId))
      if (p.targetHours === value) return p
      changed++
      return { ...p, targetHours: value }
    })
    setPeople(next)
    setProblems((list) => list.filter((p) => !p.field.startsWith("target-") || next.find((x) => `target-${x.volunteerId}` === p.field && x.targetHours.trim() === "")))
    const included = next.filter((p) => p.included).length
    announce(setStatus, changed === 0 ? "Aucun objectif modifié : la suggestion est déjà appliquée." : `Objectif rempli pour ${plural(changed, "personne", "personnes")} ; ${included - changed} inchangé${included - changed > 1 ? "s" : ""}.`)
  }

  /** From the error summary: the suggestion for the people without a target only, never over a typed value. */
  function fillMissing() {
    const r = fillMissingTargets(people, suggestionOf)
    const rest = problems.filter((p) => p.kind !== "target_missing")
    flushSync(() => { setPeople(r.people); setProblems(rest) })
    if (rest.length > 0 || serverError) errorHeading.current?.focus()
    else peopleHeading.current?.focus()
    announce(setStatus, `Objectif suggéré appliqué à ${plural(r.filled, "personne", "personnes")}. Vérifiez-le, puis générez la proposition.`)
  }

  function applyRotationSuggestion() {
    setMaxConsecutive("2")
    setMaxNights("2")
    setProblems((list) => withoutProblem(withoutProblem(list, "proposal-consecutive"), "proposal-nights"))
    announce(setStatus, "Au plus 2 jours d'affilée sur une même catégorie et 2 ajouts de nuit par personne.")
  }

  function checkForm() {
    return formToConfig({ dates, postes, people, posteChoices, maxConsecutiveDays: maxConsecutive, maxNightAddOns: maxNights }, pageShifts, nameOf)
  }

  /** « Générer une proposition »: checks the form, then asks first when proposed drafts would be replaced. */
  function requestLaunch() {
    if (launching) return
    if (launchBlocked) { announce(setStatus, launchBlocked); return }
    const form = checkForm()
    if (!form.ok) {
      flushSync(() => { setProblems(form.problems); setServerError(null) })
      openFoldsOf(form.problems)
      errorHeading.current?.focus()
      return
    }
    const replaced = replacedDraftCount(data.proposedByShift ?? {}, form.config.scope.shiftIds)
    if (replaced > 0) { setConfirmRelaunch(replaced); return }
    void launch()
  }

  async function launch() {
    const form = checkForm()
    if (!form.ok) return
    setProblems([])
    setServerError(null)
    setAlert(null)
    setLaunching(true)
    try {
      // The targets first: a run reads them from the database.
      const changes = form.targets.filter((t) => data.people.find((p) => p.volunteerId === t.volunteerId)?.targetMinutes !== t.targetMinutes)
        .map((t) => ({ ...t, revision: data.people.find((p) => p.volunteerId === t.volunteerId)?.targetRevision ?? null }))
      if (changes.length > 0) {
        const res = await fetch(`/api/admin/events/${data.eventId}/proposal-targets`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets: changes }) })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          return fail(`${typeof body.error === "string" ? body.error : "Les objectifs d'heures n'ont pas été enregistrés."} Aucune proposition n'a été lancée.`)
        }
      }
      launchKey.current ??= crypto.randomUUID()
      const res = await fetch(`/api/admin/events/${data.eventId}/proposals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: launchKey.current, configuration: form.config }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { launchKey.current = null; return fail(typeof body.error === "string" ? body.error : "La proposition n'a pas pu être lancée.") }
      launchKey.current = null
      await follow(body.runId, body.notice ? `Proposition lancée. ${body.notice}` : "Proposition lancée : calcul en attente.")
    } catch {
      fail(NETWORK_ERROR)
    }
    function fail(text: string) {
      setLaunching(false)
      flushSync(() => setServerError(text))
      errorHeading.current?.focus()
      announce(setStatus, text)
    }
  }

  /** After a launch: the new run is read and shown, the focus on its heading, its state announced. */
  async function follow(runId: string, said: string) {
    let next: Run | null = null
    try {
      const read = await fetch(`/api/admin/events/${data.eventId}/proposals/${runId}`, { cache: "no-store" })
      next = read.ok ? ((await read.json()) as { run: Run }).run : null
    } catch { next = null }
    setLaunching(false)
    if (!next) {
      // Launched, but its follow-up could not be read: said visibly, and the page reloads its data.
      flushSync(() => setAlert({ text: "La proposition est lancée, mais son suivi ne s'affiche pas : rechargez la page pour voir où elle en est.", reload: true }))
      document.getElementById("proposal-alert-reload")?.focus()
      startTransition(() => router.refresh())
      return
    }
    lastState.current = `${next.status}:${next.outcome}`
    shownId.current = next.id
    flushSync(() => setRun(next))
    resultHeading.current?.focus()
    announce(setStatus, said)
    startTransition(() => router.refresh())
  }

  /**
   * « Proposer une autre répartition »: the shown run's stored choices with another seed (the server
   * picks it). Never the form: nothing is checked or saved there. Asks first when proposed drafts
   * of that scope would be replaced.
   */
  function requestAnother() {
    if (launching || !run) return
    if (launchBlocked) { announce(setStatus, launchBlocked); return }
    const scope = ((run.configuration as Partial<ProposalConfig> | null)?.scope?.shiftIds) ?? []
    const replaced = replacedDraftCount(data.proposedByShift ?? {}, scope)
    if (replaced > 0) { setConfirmAnother({ count: replaced, runId: run.id, ordinal: run.ordinal }); return }
    void launchAnother(run.id)
  }

  async function launchAnother(runId: string) {
    setAlert(null)
    setLaunching(true)
    if (anotherKey.current?.runId !== runId) anotherKey.current = { runId, key: crypto.randomUUID() }
    try {
      const res = await fetch(`/api/admin/events/${data.eventId}/proposals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: anotherKey.current.key, anotherOf: runId }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        anotherKey.current = null
        setLaunching(false)
        // In the page's alert, above the result; the focus stays on the button (no second announcement).
        setAlert({ text: `${typeof body.error === "string" ? body.error : "L'autre répartition n'a pas pu être lancée."} Rien n'a été remplacé.`, reload: false })
        return
      }
      anotherKey.current = null
      await follow(body.runId, body.notice ? `Autre répartition demandée. ${body.notice}` : "Autre répartition demandée : calcul en attente.")
    } catch {
      // A network failure keeps the key: trying again returns the same run if it was recorded.
      setLaunching(false)
      setAlert({ text: NETWORK_ERROR, reload: false })
    }
  }

  async function cancel() {
    if (!run || busy) return
    setBusy("cancel")
    setAlert((a) => (a?.reload ? a : null))
    try {
      const res = await fetch(`/api/admin/events/${data.eventId}/proposals/${run.id}/cancel`, { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (res.ok) announce(setStatus, "Arrêt demandé : la recherche s'arrête dans quelques secondes.")
      else {
        // Refused because the computation ended meanwhile: show that end, not a stale refusal.
        const read = await fetch(`/api/admin/events/${data.eventId}/proposals/${run.id}`, { cache: "no-store" }).catch(() => null)
        const next = read?.ok ? ((await read.json()) as { run: Run }).run : null
        if (next && isDone(next)) {
          lastState.current = `${next.status}:${next.outcome}`
          flushSync(() => setRun(next))
          resultHeading.current?.focus()
          announce(setStatus, doneText(next))
          startTransition(() => router.refresh())
        } else setAlert({ text: typeof body.error === "string" ? body.error : "L'arrêt n'a pas abouti.", reload: false })
      }
    } catch {
      setAlert({ text: NETWORK_ERROR, reload: false })
    }
    setBusy(null)
  }

  async function writePartial() {
    if (!run || busy) return
    setBusy("write")
    try {
      const res = await fetch(`/api/admin/events/${data.eventId}/proposals/${run.id}/write`, { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setBusy(null); setConfirmWrite({ error: typeof body.error === "string" ? body.error : "L'écriture n'a pas abouti. Rien n'a été écrit." }); return }
      const read = await fetch(`/api/admin/events/${data.eventId}/proposals/${run.id}`, { cache: "no-store" })
      const next = read.ok ? ((await read.json()) as { run: Run }).run : run
      setBusy(null)
      flushSync(() => { setConfirmWrite(null); setRun(next) })
      // The dialog gave the focus back while unmounting (flushSync): now the heading of what changed.
      resultHeading.current?.focus()
      const written = body.written ?? 0
      announce(setStatus, written === 0 ? "Aucune affectation écrite : toutes ont été écartées, les données ayant changé. Relancez la proposition." : `${plural(written, "affectation écrite", "affectations écrites")} en brouillon.`)
      startTransition(() => router.refresh())
    } catch {
      setBusy(null)
      setConfirmWrite({ error: NETWORK_ERROR })
    }
  }

  /** « Relancer la proposition » from the partial-result dialog: the dialog closes, then the usual launch. */
  function relaunchFromDialog() {
    flushSync(() => setConfirmWrite(null))
    requestLaunch()
  }

  function goToForm(e: MouseEvent) {
    e.preventDefault()
    newHeading.current?.scrollIntoView({ block: "start" })
    newHeading.current?.focus()
  }

  const toggle = (list: string[], value: string, on: boolean) => (on ? [...new Set([...list, value])] : list.filter((v) => v !== value))
  const posteNames = data.postes.map((p) => p.roleName)
  const sectors = [...new Set(data.postes.map((p) => p.sector))]
  const report = run?.report ?? null
  const written = (run?.written ?? null) as Written
  const recap = rotationSummary(posteChoices, maxConsecutive, maxNights)
  const offer = run ? anotherOffer(run) : null
  const canWritePartial = !!run && !run.writtenAt && !!report && (run.status === "interrupted" || run.status === "finished") && report.assignments.length > 0

  return (
    <div className="space-y-10">
      <p role="status" className="sr-only">{status}</p>

      {/* Mounted from the start, filled on a problem: an alert that appears with its text is not always read. */}
      <div role="alert" className={alert ? "rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 space-y-2" : "sr-only"}>
        {alert && <p className="max-w-[75ch]">{alert.text}</p>}
        {alert?.reload && <button id="proposal-alert-reload" type="button" className={smallButton} onClick={() => window.location.reload()}>Recharger la page</button>}
      </div>

      {run && (
        <section aria-labelledby="proposal-result" className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4">
          <div className="space-y-1">
            <h2 id="proposal-result" ref={resultHeading} tabIndex={-1} className="text-base font-semibold text-gray-900 rounded focus:outline-none">{isDone(run) ? "Résultat de la proposition" : "Proposition en cours"}</h2>
            {isDone(run) && report && <p className="text-lg font-semibold text-gray-900">{coverageLine(report.coverage)}</p>}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700"><StateBadge run={run} /><span>{runLine(run.ordinal, runDate(run.createdAt))}</span></p>
          </div>
          {!isDone(run) && (
            <div className="space-y-2">
              <p id="proposal-progress" className="text-sm text-gray-800">{run.status === "queued" ? "En attente d'une place de calcul." : `Calcul en cours${(run.progress as { evaluations?: number } | null)?.evaluations ? ` : ${(run.progress as { evaluations: number }).evaluations.toLocaleString("fr-FR")} essais` : ""}.`}{run.cancelRequested ? " Arrêt demandé." : ""}</p>
              <button id="proposal-cancel" type="button" onClick={() => void cancel()} aria-describedby={run.cancelRequested ? "proposal-progress" : undefined} aria-disabled={busy === "cancel" || run.cancelRequested || undefined} aria-busy={busy === "cancel" || undefined} className={smallButton}>{busy === "cancel" ? "Arrêt…" : "Arrêter la recherche"}</button>
            </div>
          )}
          {isDone(run) && (
            <>
              {report && <p className="max-w-[75ch] text-sm text-gray-800">{stateSentence({ outcome: report.outcome, execution: run.status === "interrupted" ? "interrupted" : "finished", stopReason: (run.stopReason ?? "budget") as ProposalReport["stopReason"] })}</p>}
              {run.status === "failed" && <p className="max-w-[75ch] text-sm text-gray-800">Le calcul a échoué ; rien n&apos;a été écrit. Relancez la proposition.</p>}
              {run.stopReason === "lease_expired" && <p className="max-w-[75ch] text-sm text-gray-800">Le calcul a été interrompu par un redémarrage du service ; rien n&apos;a été écrit. Relancez un calcul depuis Nouvelle proposition.</p>}
              {run.stale.length > 0 && <p className="max-w-[75ch] text-sm text-[#92400e]">{staleSentence(run.stale)}</p>}
              {run.writtenAt && run.writtenCount === 0 && (
                <p className="max-w-[75ch] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 forced-colors:border-[CanvasText]">Aucune affectation n&apos;a été écrite : toutes ont été écartées à l&apos;écriture, les données ayant changé. Relancez la proposition pour tenir compte des données actuelles.</p>
              )}
              <ul role="list" className="max-w-[75ch] text-sm text-gray-800 space-y-0.5">
                {report && coverageDetails(report.coverage).map((line) => <li key={line}>{line}</li>)}
                {run.writtenAt && run.writtenCount > 0 && <li>{plural(run.writtenCount, "affectation écrite", "affectations écrites")} dans les brouillons{written?.replaced?.length ? ` ; ${plural(written.replaced.length, "brouillon proposé remplacé", "brouillons proposés remplacés")}` : ""}.</li>}
                {written?.dropped && droppedSentence(written.dropped) && <li>{droppedSentence(written.dropped)}</li>}
                {written?.error && <li className="text-[#b91c1c]">{written.error}</li>}
                {!run.writtenAt && run.status === "interrupted" && report && <li>Rien n&apos;a été écrit dans les brouillons.</li>}
              </ul>
              {offer === "only_one" && !run.sameAs && <p className="max-w-[75ch] text-sm text-gray-800">{ONLY_ONE_SENTENCE}</p>}
              {run.sameAs && <p className="max-w-[75ch] text-sm text-gray-800">{sameAsSentence(run.sameAs)}</p>}
              {offer === "button" && (
                <div className="space-y-1">
                  <button id="proposal-another" type="button" onClick={requestAnother} aria-disabled={launching || !!launchBlocked || undefined} aria-busy={launching || undefined} aria-describedby={launchBlocked ? "proposal-another-hint proposal-another-blocked" : "proposal-another-hint"} className={smallButton}>
                    {launching ? "Lancement…" : "Proposer une autre répartition"}
                  </button>
                  <p id="proposal-another-hint" className="max-w-[75ch] text-sm text-gray-700">{ANOTHER_HINT}</p>
                  {launchBlocked && <p id="proposal-another-blocked" className="max-w-[75ch] text-sm text-gray-800">{launchBlocked}</p>}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {canWritePartial && <button id="proposal-write" type="button" onClick={() => setConfirmWrite({ error: null })} aria-disabled={!!busy || undefined} className={smallButton}>Utiliser ce résultat partiel</button>}
                <Link href={draftsHref} className={`inline-flex min-h-11 items-center text-sm ${linkClass}`}>Voir les affectations en brouillon</Link>
                <a href="#proposal-new" onClick={goToForm} className={`inline-flex min-h-11 items-center text-sm ${linkClass}`}>Préparer une nouvelle proposition</a>
              </div>
              {report && report.gaps.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-gray-900">Places restées vides ({report.gaps.length})</h3>
                  <ul role="list" className="max-w-[75ch] space-y-1 text-sm text-gray-800">
                    {report.gaps.map((g) => <li key={g.shiftId}><span className="font-medium">{data.shiftWords[g.shiftId] ?? "Créneau"}</span> : {gapSentence(g)}</li>)}
                  </ul>
                </div>
              )}
              {report && report.people.length > 0 && <PeopleLoad report={report} nameOf={nameOf} skipTo={report.assignments.length > 0 ? "proposal-assignments" : null} />}
              {report && report.assignments.length > 0 && (
                <div className="space-y-1">
                  <h3 id="proposal-assignments" tabIndex={-1} className="text-sm font-semibold text-gray-900 rounded focus:outline-none">Affectations proposées ({report.assignments.length})</h3>
                  <details>
                    <summary className={summaryClass}>Afficher chaque affectation et sa raison</summary>
                    <ul role="list" className="mt-1 max-w-[75ch] space-y-2 text-sm text-gray-800">
                      {report.assignments.map((a) => <li key={`${a.shiftId}-${a.volunteerId}`}><span className="font-medium">{nameOf(a.volunteerId)}</span>, {data.shiftWords[a.shiftId] ?? "créneau"} : {assignmentSentence(a)}</li>)}
                    </ul>
                  </details>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <section aria-labelledby="proposal-new" className="space-y-8">
        <h2 id="proposal-new" ref={newHeading} tabIndex={-1} className="text-lg font-semibold text-gray-900 rounded focus:outline-none">Nouvelle proposition</h2>

        <section aria-labelledby="proposal-checks" className="space-y-1">
          <h3 id="proposal-checks" className="text-base font-semibold text-gray-900">Ce qui est vérifié</h3>
          <p className="max-w-[75ch] text-sm text-gray-800">La proposition ne place une personne que sur un créneau couvert entièrement par ses disponibilités, et respecte les places, l&apos;âge, les postes réservés, les chevauchements, les limites par poste et la protection des pauses et de la charge. Les inscriptions et les brouillons manuels ou verrouillés restent tels quels.</p>
          {protectionOn
            ? <p className="text-sm text-gray-800">Protection des pauses et de la charge : activée.</p>
            : <p className="text-sm text-[#b91c1c]">Protection des pauses et de la charge : {data.protection === "off" ? "désactivée" : "incomplète"}. <Link href={eventInfoHref} className={linkClass}>Activer la protection dans les informations de l&apos;événement</Link></p>}
        </section>

        <section aria-labelledby="proposal-scope" className="space-y-4">
          <h3 id="proposal-scope" className="text-base font-semibold text-gray-900">Périmètre</h3>
          <fieldset id="proposal-dates" tabIndex={-1} aria-describedby={problemOf("proposal-dates") ? "proposal-dates-error" : undefined} className="space-y-1">
            <legend className="text-sm font-medium text-gray-900">Dates (au moins une)</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={smallButton} onClick={() => { setDates(openDates); clear("proposal-dates") }}>Tout cocher<span className="sr-only"> les dates</span></button>
              <button type="button" className={smallButton} onClick={() => setDates([])}>Tout décocher<span className="sr-only"> les dates</span></button>
            </div>
            <ul role="list" className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
              {openDates.map((d) => (
                <li key={d}><label className="flex min-h-11 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-6 w-6 accent-blue-600" checked={dates.includes(d)} onChange={(e) => { setDates(toggle(dates, d, e.target.checked)); clear("proposal-dates"); clear("proposal-postes") }} />{dayLabel(d)}</label></li>
              ))}
            </ul>
            {problemOf("proposal-dates") && <p id="proposal-dates-error" className="text-sm text-red-700">{problemOf("proposal-dates")!.message}</p>}
          </fieldset>
          <fieldset id="proposal-postes" tabIndex={-1} aria-describedby={problemOf("proposal-postes") ? "proposal-postes-error" : undefined} className="space-y-1">
            <legend className="text-sm font-medium text-gray-900">Postes (au moins un)</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={smallButton} onClick={() => { setPostes(posteNames); clear("proposal-postes") }}>Tout cocher<span className="sr-only"> les postes</span></button>
              <button type="button" className={smallButton} onClick={() => setPostes([])}>Tout décocher<span className="sr-only"> les postes</span></button>
            </div>
            {sectors.map((sector) => {
              const list = data.postes.filter((p) => p.sector === sector)
              const boxes = (
                <ul role="list" className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((p) => <li key={p.roleName}><label className="flex min-h-11 items-center gap-2 text-sm text-gray-900 break-words"><input type="checkbox" className="h-6 w-6 shrink-0 accent-blue-600" checked={postes.includes(p.roleName)} onChange={(e) => { setPostes(toggle(postes, p.roleName, e.target.checked)); clear("proposal-postes") }} />{p.roleName}</label></li>)}
                </ul>
              )
              return sectors.length > 1 || sector ? (
                <fieldset key={sector ?? "none"} className="mt-2">
                  <legend className="text-sm text-gray-700">{sector ?? "Sans secteur"}</legend>
                  {boxes}
                </fieldset>
              ) : <div key="all">{boxes}</div>
            })}
            {problemOf("proposal-postes") && <p id="proposal-postes-error" className="text-sm text-red-700">{problemOf("proposal-postes")!.message}</p>}
          </fieldset>
          <p className="text-sm font-medium text-gray-900">{countLine}</p>
        </section>

        <section aria-labelledby="proposal-people" className="space-y-3">
          <h3 id="proposal-people" ref={peopleHeading} tabIndex={-1} className="text-base font-semibold text-gray-900 rounded focus:outline-none">Personnes et objectifs d&apos;heures</h3>
          <p className="max-w-[75ch] text-sm text-gray-700">L&apos;objectif est l&apos;engagement de chaque personne, en heures sur l&apos;événement (0 pour aucun objectif) : la proposition compare la charge de chacun à son propre objectif, sans chercher l&apos;égalité. Les valeurs d&apos;une personne non incluse sont gardées mais ne servent pas.</p>
          <button type="button" className={smallButton} onClick={applySuggestion}>Appliquer la suggestion : 6 h par date où la personne a indiqué une plage libre</button>
          <p id="target-hint" className="max-w-[75ch] text-sm text-gray-600">En heures, par exemple 12 ou 7,5. Suggestion plafonnée par le maximum de l&apos;événement{data.maxEventMinutes ? ` (${fmtDuration(data.maxEventMinutes)})` : ""}.</p>
          {problemOf("proposal-people") && <p className="text-sm text-red-700">{problemOf("proposal-people")!.message}</p>}
          {data.people.length === 0 && <p className="text-sm text-gray-800">Personne n&apos;a encore été sollicité pour ses disponibilités sur cet événement.</p>}

          {/* From md up: a table in a labelled scroll region. */}
          <div className="hidden md:block space-y-1">
            {hidesPeople && <p id="people-scroll-hint" className="text-sm text-gray-600">{TABLE_SCROLL_HINT}</p>}
            <div ref={peopleRegion} role="region" aria-label="Personnes et objectifs d'heures" aria-describedby={hidesPeople ? "people-scroll-hint" : undefined} tabIndex={hidesPeople ? 0 : undefined} className={`relative overflow-x-auto rounded-xl border border-gray-200 bg-white ${focusRing}`}>
              <table className="text-sm border-collapse min-w-full">
                <caption className="sr-only">Personnes à inclure, leur réponse, leur objectif d&apos;heures et leurs postes souhaités ou à éviter</caption>
                <thead className="bg-gray-50 text-xs text-gray-700">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">Nom</th>
                    <th scope="col" id="col-include" className="px-3 py-2 text-left">Inclure</th>
                    <th scope="col" className="px-3 py-2 text-left">Réponse</th>
                    <th scope="col" id="col-target" className="px-3 py-2 text-left">Objectif d&apos;heures</th>
                    <th scope="col" className="px-3 py-2 text-left">Suggestion</th>
                    <th scope="col" id="col-prefer" className="px-3 py-2 text-left">Poste souhaité</th>
                    <th scope="col" id="col-avoid" className="px-3 py-2 text-left">Poste à éviter</th>
                  </tr>
                </thead>
                <tbody>
                  {data.people.map((p) => {
                    const c = people.find((x) => x.volunteerId === p.volunteerId)!
                    const err = problemOf(`target-${p.volunteerId}`)
                    const avoidErr = problemOf(`avoid-${p.volunteerId}`)
                    const rowId = `pt-name-${p.volunteerId}`
                    return (
                      <tr key={p.volunteerId} className="border-t border-gray-100 align-top">
                        <th scope="row" id={rowId} className="px-3 py-2 text-left font-medium text-gray-900 break-words">{p.firstName} {p.lastName}</th>
                        <td className="px-3 py-2"><input type="checkbox" className="h-6 w-6 accent-blue-600" aria-labelledby={`col-include ${rowId}`} checked={c.included} onChange={(e) => updatePerson(p.volunteerId, { included: e.target.checked })} /></td>
                        <td className="px-3 py-2 text-gray-800">{p.answered ? "A répondu" : "Sans réponse"}</td>
                        <td className="px-3 py-2">
                          <input id={`target-${p.volunteerId}`} type="text" inputMode="decimal" autoComplete="off" className={`${input} w-24`} aria-labelledby={`col-target ${rowId}`} aria-describedby={[err && `target-err-${p.volunteerId}`, "target-hint"].filter(Boolean).join(" ")} aria-invalid={err ? true : undefined} value={c.targetHours} onChange={(e) => updatePerson(p.volunteerId, { targetHours: e.target.value })} />
                          {err && <p id={`target-err-${p.volunteerId}`} className="mt-1 max-w-[30ch] text-xs text-red-700">{targetError(err, p.suggestionMinutes)}</p>}
                        </td>
                        <td className="px-3 py-2 text-gray-800">{formatHours(p.suggestionMinutes)}<span aria-hidden="true">{" h"}</span><span className="sr-only"> heures suggérées</span></td>
                        <td className="px-3 py-2">
                          <select className={input} aria-labelledby={`col-prefer ${rowId}`} value={c.prefer} onChange={(e) => updatePerson(p.volunteerId, { prefer: e.target.value })}>
                            <option value="">Aucun</option>
                            {posteNames.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select id={`avoid-${p.volunteerId}`} className={input} aria-labelledby={`col-avoid ${rowId}`} aria-describedby={avoidErr ? `avoid-err-${p.volunteerId}` : undefined} aria-invalid={avoidErr ? true : undefined} value={c.avoid} onChange={(e) => updatePerson(p.volunteerId, { avoid: e.target.value })}>
                            <option value="">Aucun</option>
                            {posteNames.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                          {avoidErr && <p id={`avoid-err-${p.volunteerId}`} className="mt-1 max-w-[30ch] text-xs text-red-700">{avoidErr.message}</p>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Below md: one fieldset per person (the same state), each control named with the person. */}
          <ul role="list" className="md:hidden space-y-3">
            {data.people.map((p) => {
              const c = people.find((x) => x.volunteerId === p.volunteerId)!
              const err = problemOf(`target-${p.volunteerId}`)
              const avoidErr = problemOf(`avoid-${p.volunteerId}`)
              const who = `${p.firstName} ${p.lastName}`
              return (
                <li key={p.volunteerId}>
                  <fieldset className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                    <legend className="px-1 text-sm font-medium text-gray-900 break-words">{who}</legend>
                    <label className="flex min-h-11 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-6 w-6 accent-blue-600" checked={c.included} onChange={(e) => updatePerson(p.volunteerId, { included: e.target.checked })} />Inclure{" "}<span className="sr-only">{who}</span></label>
                    <p className="text-sm text-gray-800">{p.answered ? "A répondu" : "Sans réponse"}. Suggestion : {formatHours(p.suggestionMinutes)} heure{p.suggestionMinutes >= 120 ? "s" : ""}.</p>
                    <div>
                      <label htmlFor={`m-target-${p.volunteerId}`} className="block text-sm font-medium text-gray-900">Objectif d&apos;heures{" "}<span className="sr-only">{who}</span></label>
                      <input id={`m-target-${p.volunteerId}`} type="text" inputMode="decimal" autoComplete="off" className={`${input} w-28`} aria-describedby={[err && `m-target-err-${p.volunteerId}`, "target-hint"].filter(Boolean).join(" ")} aria-invalid={err ? true : undefined} value={c.targetHours} onChange={(e) => updatePerson(p.volunteerId, { targetHours: e.target.value })} />
                      {err && <p id={`m-target-err-${p.volunteerId}`} className="mt-1 text-xs text-red-700">{targetError(err, p.suggestionMinutes)}</p>}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`m-prefer-${p.volunteerId}`} className="block text-sm font-medium text-gray-900">Poste souhaité{" "}<span className="sr-only">{who}</span></label>
                        <select id={`m-prefer-${p.volunteerId}`} className={`${input} w-full`} value={c.prefer} onChange={(e) => updatePerson(p.volunteerId, { prefer: e.target.value })}>
                          <option value="">Aucun</option>
                          {posteNames.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`m-avoid-${p.volunteerId}`} className="block text-sm font-medium text-gray-900">Poste à éviter{" "}<span className="sr-only">{who}</span></label>
                        <select id={`m-avoid-${p.volunteerId}`} className={`${input} w-full`} aria-describedby={avoidErr ? `m-avoid-err-${p.volunteerId}` : undefined} aria-invalid={avoidErr ? true : undefined} value={c.avoid} onChange={(e) => updatePerson(p.volunteerId, { avoid: e.target.value })}>
                          <option value="">Aucun</option>
                          {posteNames.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        {avoidErr && <p id={`m-avoid-err-${p.volunteerId}`} className="mt-1 text-xs text-red-700">{avoidErr.message}</p>}
                      </div>
                    </div>
                  </fieldset>
                </li>
              )
            })}
          </ul>
        </section>

        <details id="proposal-rotation" className="group rounded-xl border border-gray-200 bg-white px-3 sm:px-4">
          <summary className={summaryClass}>
            Rotation, nuit et réserve (facultatif)
            <span className="block text-sm font-normal text-gray-700">{recap}</span>
          </summary>
          <div className="space-y-3 pb-4 pt-1">
            <ul role="list" className="max-w-[75ch] space-y-1 text-sm text-gray-700">
              <li id="category-hint"><span className="font-medium text-gray-900">Catégorie de rotation</span> : les postes au même nom comptent ensemble ; vide, le poste est seul dans la sienne (80 caractères au plus).</li>
              <li id="night-hint"><span className="font-medium text-gray-900">Ajout de nuit</span> : une mission courte après une soirée, répartie entre les personnes.</li>
              <li id="reserve-hint"><span className="font-medium text-gray-900">Réserve</span> : des personnes présentes sur place, gardées en priorité comme un minimum.</li>
            </ul>
            <div className="hidden md:block space-y-1">
              {hidesPostes && <p id="poste-scroll-hint" className="text-sm text-gray-600">{TABLE_SCROLL_HINT}</p>}
              <div ref={posteRegion} role="region" aria-label="Rotation, nuit et réserve par poste" aria-describedby={hidesPostes ? "poste-scroll-hint" : undefined} tabIndex={hidesPostes ? 0 : undefined} className={`relative overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 ${focusRing}`}>
                <table className="text-sm border-collapse min-w-full">
                  <caption className="sr-only">Catégorie de rotation, ajout de nuit et réserve de chaque poste</caption>
                  <thead className="text-xs text-gray-700">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left">Poste</th>
                      <th scope="col" id="col-category" className="px-3 py-2 text-left">Catégorie de rotation</th>
                      <th scope="col" id="col-night" className="px-3 py-2 text-left">Ajout de nuit</th>
                      <th scope="col" id="col-reserve" className="px-3 py-2 text-left">Réserve à garder par créneau</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.postes.map((p, i) => {
                      const c = posteChoices.find((x) => x.roleName === p.roleName)!
                      const rowId = `pp-name-${i}`
                      const reserveErr = problemOf(`reserve-${i}`)
                      const categoryErr = problemOf(`category-${i}`)
                      return (
                        <tr key={p.roleName} className="border-t border-gray-200 align-top">
                          <th scope="row" id={rowId} className="px-3 py-2 text-left font-medium text-gray-900 break-words">{p.roleName}</th>
                          <td className="px-3 py-2">
                            <input id={`category-${i}`} type="text" autoComplete="off" maxLength={80} className={`${input} w-48`} aria-labelledby={`col-category ${rowId}`} aria-describedby={["category-hint", categoryErr && `category-err-${i}`].filter(Boolean).join(" ")} aria-invalid={categoryErr ? true : undefined} value={c.category} onChange={(e) => updatePoste(i, p.roleName, { category: e.target.value })} />
                            {categoryErr && <p id={`category-err-${i}`} className="mt-1 max-w-[30ch] text-xs text-red-700">{categoryErr.message}</p>}
                          </td>
                          <td className="px-3 py-2"><input type="checkbox" className="h-6 w-6 accent-blue-600" aria-labelledby={`col-night ${rowId}`} aria-describedby="night-hint" checked={c.night} onChange={(e) => updatePoste(i, p.roleName, { night: e.target.checked })} /></td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-2">
                              <input id={`reserve-${i}`} type="text" inputMode="numeric" autoComplete="off" className={`${input} w-16`} aria-labelledby={`col-reserve ${rowId}`} aria-describedby={[`reserve-cap-${i}`, "reserve-hint", reserveErr && `reserve-err-${i}`].filter(Boolean).join(" ")} aria-invalid={reserveErr ? true : undefined} value={c.reserveText ?? String(c.reserve)} onChange={(e) => updatePoste(i, p.roleName, reserveChange(e.target.value))} />
                              <span id={`reserve-cap-${i}`} className="text-gray-700">0 à {p.capacity}</span>
                            </span>
                            {reserveErr && <p id={`reserve-err-${i}`} className="mt-1 text-xs text-red-700">{reserveErr.message}</p>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <ul role="list" className="md:hidden space-y-3">
              {data.postes.map((p, i) => {
                const c = posteChoices.find((x) => x.roleName === p.roleName)!
                const reserveErr = problemOf(`reserve-${i}`)
                const categoryErr = problemOf(`category-${i}`)
                return (
                  <li key={p.roleName}>
                    <fieldset className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                      <legend className="px-1 text-sm font-medium text-gray-900 break-words">{p.roleName}</legend>
                      <div>
                        <label htmlFor={`m-category-${i}`} className="block text-sm font-medium text-gray-900">Catégorie de rotation{" "}<span className="sr-only">{p.roleName}</span></label>
                        <input id={`m-category-${i}`} type="text" autoComplete="off" maxLength={80} className={`${input} w-full`} aria-describedby={["category-hint", categoryErr && `m-category-err-${i}`].filter(Boolean).join(" ")} aria-invalid={categoryErr ? true : undefined} value={c.category} onChange={(e) => updatePoste(i, p.roleName, { category: e.target.value })} />
                        {categoryErr && <p id={`m-category-err-${i}`} className="mt-1 text-xs text-red-700">{categoryErr.message}</p>}
                      </div>
                      <label className="flex min-h-11 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-6 w-6 accent-blue-600" aria-describedby="night-hint" checked={c.night} onChange={(e) => updatePoste(i, p.roleName, { night: e.target.checked })} />Ajout de nuit{" "}<span className="sr-only">{p.roleName}</span></label>
                      <div>
                        <label htmlFor={`m-reserve-${i}`} className="block text-sm font-medium text-gray-900">Réserve à garder par créneau{" "}<span className="sr-only">{p.roleName}</span></label>
                        <span className="flex items-center gap-2">
                          <input id={`m-reserve-${i}`} type="text" inputMode="numeric" autoComplete="off" className={`${input} w-16`} aria-describedby={[`m-reserve-cap-${i}`, "reserve-hint", reserveErr && `m-reserve-err-${i}`].filter(Boolean).join(" ")} aria-invalid={reserveErr ? true : undefined} value={c.reserveText ?? String(c.reserve)} onChange={(e) => updatePoste(i, p.roleName, reserveChange(e.target.value))} />
                          <span id={`m-reserve-cap-${i}`} className="text-sm text-gray-700">0 à {p.capacity}</span>
                        </span>
                        {reserveErr && <p id={`m-reserve-err-${i}`} className="mt-1 text-xs text-red-700">{reserveErr.message}</p>}
                      </div>
                    </fieldset>
                  </li>
                )
              })}
            </ul>
            <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
              <div>
                <label htmlFor="proposal-consecutive" className="block text-sm font-medium text-gray-900">Jours d&apos;affilée sur une même catégorie, au plus</label>
                <input id="proposal-consecutive" type="text" inputMode="numeric" autoComplete="off" className={`${input} w-20`} aria-describedby={["rotation-hint", problemOf("proposal-consecutive") && "proposal-consecutive-error"].filter(Boolean).join(" ")} aria-invalid={problemOf("proposal-consecutive") ? true : undefined} value={maxConsecutive} onChange={(e) => { setMaxConsecutive(e.target.value); clear("proposal-consecutive") }} />
                {problemOf("proposal-consecutive") && <p id="proposal-consecutive-error" className="text-xs text-red-700">{problemOf("proposal-consecutive")!.message}</p>}
              </div>
              <div>
                <label htmlFor="proposal-nights" className="block text-sm font-medium text-gray-900">Ajouts de nuit par personne, au plus</label>
                <input id="proposal-nights" type="text" inputMode="numeric" autoComplete="off" className={`${input} w-20`} aria-describedby={["rotation-hint", problemOf("proposal-nights") && "proposal-nights-error"].filter(Boolean).join(" ")} aria-invalid={problemOf("proposal-nights") ? true : undefined} value={maxNights} onChange={(e) => { setMaxNights(e.target.value); clear("proposal-nights") }} />
                {problemOf("proposal-nights") && <p id="proposal-nights-error" className="text-xs text-red-700">{problemOf("proposal-nights")!.message}</p>}
              </div>
            </div>
            <p id="rotation-hint" className="text-sm text-gray-600">Laissez vide pour ne pas en tenir compte.</p>
            <button type="button" className={smallButton} onClick={applyRotationSuggestion}>Remplir avec 2 jours d&apos;affilée et 2 ajouts de nuit au plus</button>
          </div>
        </details>

        <section aria-labelledby="proposal-launch" className="space-y-2">
          <h3 id="proposal-launch" className="text-base font-semibold text-gray-900">Lancer le calcul</h3>
          {(items.length > 0 || serverError) && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 space-y-1">
              <h4 ref={errorHeading} tabIndex={-1} className="font-semibold rounded focus:outline-none">{serverError ? "La proposition n'a pas été lancée" : items.length > 1 ? `${items.length} points à corriger` : "1 point à corriger"}</h4>
              {serverError && <p className="max-w-[75ch]">{serverError}</p>}
              {items.length > 0 && (
                <ul role="list" className="list-disc pl-5 space-y-1">
                  {items.map((p) => (
                    <li key={p.field + p.message}>
                      <a href={`#${p.field}`} className={linkClass} onClick={(e) => {
                        openFoldsOf([p])
                        const target = problemTarget(p.field) ?? (p.field === "proposal-people" ? peopleHeading.current : null)
                        if (!target) return
                        e.preventDefault()
                        target.scrollIntoView({ block: "center", inline: "center" })
                        target.focus()
                      }}>{p.message}</a>
                      {p.missingTargets && (
                        <div className="mt-1 mb-1">
                          <button type="button" className={smallButton} onClick={fillMissing}>Appliquer la suggestion aux {p.missingTargets} personnes sans objectif</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <button ref={launchButton} type="button" onClick={requestLaunch} aria-disabled={launching || !!launchBlocked || undefined} aria-busy={launching || undefined} aria-describedby={launchBlocked ? "proposal-blocked" : "proposal-launch-hint"} className={primaryButton}>
            {launching ? "Lancement…" : "Générer une proposition"}
          </button>
          {launchBlocked ? <p id="proposal-blocked" className="max-w-[75ch] text-sm text-gray-800">{launchBlocked}</p> : <p id="proposal-launch-hint" className="max-w-[75ch] text-sm text-gray-700">La proposition est écrite dans les affectations en brouillon et remplace les brouillons proposés non verrouillés de ce périmètre. Rien n&apos;est publié et personne n&apos;est prévenu.</p>}
        </section>
      </section>

      {data.runs.length > 0 && (
        <section aria-labelledby="proposal-history" className="space-y-1">
          <h2 id="proposal-history" className="text-base font-semibold text-gray-900">Propositions précédentes</h2>
          <ul role="list" className="space-y-1 text-sm">
            {data.runs.map((r) => {
              const current = run?.id === r.id
              return (
                <li key={r.id}>
                  <Link href={`${basePath}?run=${r.id}`} aria-current={current ? "page" : undefined} className={`inline-block py-1.5 ${current ? linkClass.replace("font-medium", "font-bold") : linkClass}`}>
                    {historyEntry(r, runDate(r.createdAt))}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {confirmRelaunch !== null && (
        <ConfirmActionModal
          recap={{
            title: `Remplacer ${plural(confirmRelaunch, "brouillon proposé", "brouillons proposés")} ?`,
            lead: `La nouvelle proposition remplace ${confirmRelaunch > 1 ? `les ${confirmRelaunch} brouillons proposés non verrouillés` : "le brouillon proposé non verrouillé"} de ce périmètre.`,
            lines: ["Les brouillons verrouillés et manuels ne changent pas.", "Rien n'est publié et personne n'est prévenu."],
            confirmLabel: "Remplacer et générer",
            danger: true,
          }}
          busy={false}
          onConfirm={() => { flushSync(() => setConfirmRelaunch(null)); void launch() }}
          onCancel={() => setConfirmRelaunch(null)}
        />
      )}

      {confirmAnother && (
        <ConfirmActionModal
          recap={anotherReplaceRecap(confirmAnother.count, confirmAnother.ordinal)}
          busy={false}
          onConfirm={() => { const id = confirmAnother.runId; flushSync(() => setConfirmAnother(null)); void launchAnother(id) }}
          onCancel={() => setConfirmAnother(null)}
        />
      )}

      {confirmWrite && report && run && (
        run.stale.length > 0 ? (
          <ConfirmActionModal
            recap={{
              title: "Les données ont changé depuis ce calcul",
              lead: "Relancez la proposition pour tenir compte des données actuelles.",
              warning: `${staleSentence(run.stale)} Si vous écrivez ce résultat quand même, chaque affectation est vérifiée de nouveau et celles qui ne conviennent plus sont écartées.`,
              lines: ["Rien n'est publié et personne n'est prévenu."],
              confirmLabel: "Relancer la proposition",
              danger: false,
            }}
            busy={busy === "write"}
            error={confirmWrite.error}
            onConfirm={relaunchFromDialog}
            secondaryAction={{ label: "Écrire quand même", onClick: () => void writePartial(), busy: busy === "write", failed: !!confirmWrite.error }}
            onCancel={() => setConfirmWrite(null)}
          />
        ) : (
          <ConfirmActionModal
            recap={{
              title: "Utiliser ce résultat partiel ?",
              lead: `${plural(report.assignments.length, "affectation sera écrite", "affectations seront écrites")} dans les brouillons, après une nouvelle vérification ; les brouillons proposés non verrouillés de ce périmètre seront remplacés. Les brouillons verrouillés et manuels ne changent pas.`,
              lines: ["Rien n'est publié et personne n'est prévenu."],
              confirmLabel: "Écrire dans les brouillons",
              danger: false,
            }}
            busy={busy === "write"}
            error={confirmWrite.error}
            onConfirm={() => void writePartial()}
            onCancel={() => setConfirmWrite(null)}
          />
        )
      )}
    </div>
  )
}

/** The error under a target field: short, with the suggested value when the field is empty. */
function targetError(p: FormProblem, suggestionMinutes: number): string {
  if (p.kind !== "target_missing") return p.message
  return `${TARGET_FIELD_ERROR} Suggestion : ${formatHours(suggestionMinutes)} h.`
}

/** Each person's target against what is planned: a table from md up, a list below (no sideways scroll at 320 px). */
function PeopleLoad({ report, nameOf, skipTo }: { report: ProposalReport; nameOf: (id: string) => string; skipTo: string | null }) {
  const region = useRef<HTMLDivElement>(null)
  const hides = useHidesColumns(region, [report.people.length])
  const activities = (p: ProposalReport["people"][number]) => p.categories.length === 0 ? "Aucune mission" : `${p.categories.length} ${p.categories.length > 1 ? "activités" : "activité"}${p.nightAddOns > 0 ? `, ${p.nightAddOns} ${p.nightAddOns > 1 ? "ajouts de nuit" : "ajout de nuit"}` : ""}`
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-gray-900">Charge par personne</h3>
      <div className="hidden md:block space-y-1">
        {skipTo && <a href={`#${skipTo}`} className={`text-sm ${linkClass}`} onClick={(e) => { const t = document.getElementById(skipTo); if (!t) return; e.preventDefault(); t.focus() }}>Passer le tableau de charge</a>}
        {hides && <p id="load-scroll-hint" className="text-sm text-gray-600">{TABLE_SCROLL_HINT}</p>}
        <div ref={region} role="region" aria-label="Charge par personne" aria-describedby={hides ? "load-scroll-hint" : undefined} tabIndex={hides ? 0 : undefined} className={`relative overflow-x-auto rounded-lg border border-gray-200 ${focusRing}`}>
          <table className="text-sm border-collapse min-w-full">
            <caption className="sr-only">Objectif, heures prévues et écart de chaque personne, avec ses activités</caption>
            <thead className="bg-gray-50 text-xs text-gray-700">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">Nom</th>
                <th scope="col" className="px-3 py-2 text-left">Charge</th>
                <th scope="col" className="px-3 py-2 text-left">Activités</th>
              </tr>
            </thead>
            <tbody>
              {report.people.map((p) => (
                <tr key={p.volunteerId} className="border-t border-gray-100 align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-gray-900 break-words">{nameOf(p.volunteerId)}</th>
                  <td className="px-3 py-2 text-gray-800">{personSentence(p)}</td>
                  <td className="px-3 py-2 text-gray-800">{activities(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ul role="list" aria-label="Charge par personne" className="md:hidden divide-y divide-gray-200 rounded-lg border border-gray-200">
        {report.people.map((p) => (
          <li key={p.volunteerId} className="px-3 py-2 text-sm">
            <p className="font-medium text-gray-900 break-words">{nameOf(p.volunteerId)}</p>
            <p className="text-gray-800">{personSentence(p)} {activities(p)}.</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
