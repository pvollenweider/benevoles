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
import { dayLabel } from "@/lib/spoken-time"
import { fmtDuration } from "@/lib/signup-recap"
import { staleSentence, type InputPart, type ProposalConfig } from "@/lib/proposal-config"
import { assignmentSentence, gapSentence, personSentence, stateSentence, type ProposalReport } from "@/lib/proposal-explanations"
import { droppedSentence, formatHours, formToConfig, posteChoicesFrom, runStateLabel, scopeShiftIds, type FormProblem, type PersonChoice, type PosteChoice } from "@/lib/proposal-view"
import type { ProposalPageData } from "@/lib/proposal-page-data"
import { useHidesColumns } from "@/components/admin/members/useHidesColumns"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const linkClass = `font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`
const smallButton = `min-h-11 rounded-lg border border-gray-500 bg-white px-3 py-1 text-sm font-medium text-gray-900 hover:bg-gray-50 ${focusRing}`
const primaryButton = `min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:opacity-60 ${focusRing}`
const input = `min-h-11 rounded-lg border border-gray-500 bg-white px-2 py-1 text-sm text-gray-900 ${focusRing}`
const POLL_MS = 1_500

type Run = NonNullable<ProposalPageData["run"]>
type Written = { created?: { shiftId: string; volunteerId: string }[]; dropped?: { shiftId: string; volunteerId: string; reason: string }[]; replaced?: string[]; staleAtWrite?: InputPart[]; error?: string } | null

/** Status pairs of DESIGN.md §2, the word always written. */
function stateBadge(run: { status: string; outcome: string | null }) {
  const label = runStateLabel(run)
  const cls = run.status !== "finished" ? "bg-[#f3f4f6] text-[#4b5563]" : run.outcome === "complete" ? "bg-[#dbeafe] text-[#1d4ed8]" : run.outcome === "proven_impossible" ? "bg-[#fee2e2] text-[#b91c1c]" : "bg-[#fef3c7] text-[#92400e]"
  return <span className={`inline-block rounded px-2 py-0.5 text-sm font-medium ${cls}`}>{label}</span>
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
const isDone = (r: { status: string } | null) => !!r && r.status !== "queued" && r.status !== "running"
const runDate = (d: Date | string) => new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Zurich", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })

/** What is announced when a run changes state: its state and, once done, the key counts. */
function doneText(r: Run): string {
  if (!isDone(r)) return `Proposition : ${runStateLabel(r).toLowerCase()}.`
  const cov = r.report?.coverage
  const parts = [`Proposition terminée : ${runStateLabel(r).toLowerCase()}.`]
  if (cov) parts.push(`${cov.filled} places couvertes sur ${cov.seats}.`)
  if (r.writtenAt) parts.push(`${plural(r.writtenCount, "affectation écrite", "affectations écrites")} en brouillon.`)
  return parts.join(" ")
}

/**
 * « Proposition d'affectations » (#1172): choose the scope, the targets and the rotation, launch a
 * computation, follow it, read its result. A proposal only ever writes draft assignments; nothing
 * is published here. Accessibility review (2026-10-31, accessibility-lead): one page-level polite
 * status written only on state changes; focus to the result heading after a launch; the launch
 * button stays focusable when it cannot be used (aria-disabled with the reason); people and postes
 * as tables from md up, one fieldset per row below; hours as text fields (comma or point).
 */
export default function ProposalWorkspace({ data, suggestedSeed, eventInfoHref, draftsHref, basePath }: {
  data: ProposalPageData
  suggestedSeed: number
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
      targetHours: p.targetMinutes != null ? formatHours(p.targetMinutes) : "",
      prefer: prefOf.get(p.volunteerId)?.prefer?.[0] ?? "",
      avoid: prefOf.get(p.volunteerId)?.avoid?.[0] ?? "",
    }))
  })
  const [posteChoices, setPosteChoices] = useState<PosteChoice[]>(() => posteChoicesFrom(last, pageShifts, data.postes.map((p) => p.roleName)))
  const [maxConsecutive, setMaxConsecutive] = useState(last?.rotation ? (last.rotation.maxConsecutiveDays == null ? "" : String(last.rotation.maxConsecutiveDays)) : "")
  const [maxNights, setMaxNights] = useState(last?.rotation ? (last.rotation.maxNightAddOns == null ? "" : String(last.rotation.maxNightAddOns)) : "")
  const [seed, setSeed] = useState(String(last?.seed ?? suggestedSeed))
  const [problems, setProblems] = useState<FormProblem[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  const [run, setRun] = useState<Run | null>(data.run)
  const lastState = useRef(data.run ? `${data.run.status}:${data.run.outcome}` : "")
  const pollFailed = useRef(false)
  // The page keeps this component mounted (stable key): another run from the server (a link of
  // « Propositions précédentes ») replaces the one shown, and the result heading takes the focus.
  const shownId = useRef(data.run?.id ?? null)
  useEffect(() => {
    if (!data.run || data.run.id === shownId.current) return
    shownId.current = data.run.id
    lastState.current = `${data.run.status}:${data.run.outcome}`
    flushSync(() => setRun(data.run))
    resultHeading.current?.focus()
  }, [data.run])
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState<"cancel" | "write" | null>(null)
  const [confirmWrite, setConfirmWrite] = useState<{ error: string | null } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const launchKey = useRef<string | null>(null)
  const errorHeading = useRef<HTMLHeadingElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const detailsRef = useRef<HTMLDetailsElement>(null)
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
  const launchBlocked = !protectionOn ? "La protection des pauses et de la charge n'est pas activée et complète : activez-la dans les informations de l'événement." : active ? "Une proposition est en cours : attendez qu'elle finisse ou arrêtez-la." : null

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
        pollFailed.current = false
        const next = body.run
        const state = `${next.status}:${next.outcome}`
        if (state !== lastState.current) {
          lastState.current = state
          const hadFocus = document.activeElement?.id === "proposal-cancel"
          flushSync(() => setRun(next))
          if (hadFocus && isDone(next)) focusFirstAvailable([() => document.getElementById("proposal-write"), resultHeading.current])
          announce(setStatus, doneText(next))
          if (isDone(next)) startTransition(() => router.refresh())
        } else setRun(next)
      } catch {
        if (!pollFailed.current) { pollFailed.current = true; announce(setStatus, "Le suivi est interrompu : rechargez la page.") }
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [run, data.eventId, router])



  const updatePerson = (id: string, patch: Partial<PersonChoice>) => setPeople((list) => list.map((p) => (p.volunteerId === id ? { ...p, ...patch } : p)))
  const updatePoste = (roleName: string, patch: Partial<PosteChoice>) => setPosteChoices((list) => list.map((p) => (p.roleName === roleName ? { ...p, ...patch } : p)))
  /** The reserve field: a whole number is kept as a number, anything else as text for the check. */
  const reserveChange = (text: string): Partial<PosteChoice> => (/^\d{1,3}$/.test(text.trim()) ? { reserve: Number(text.trim()), reserveText: undefined } : { reserveText: text })
  const problemOf = (field: string) => problems.find((p) => p.field === field)?.message ?? null

  function applySuggestion() {
    let changed = 0
    const next = people.map((p) => {
      if (!p.included) return p
      const s = data.people.find((x) => x.volunteerId === p.volunteerId)!
      const value = formatHours(s.suggestionMinutes)
      if (p.targetHours === value) return p
      changed++
      return { ...p, targetHours: value }
    })
    setPeople(next)
    const included = next.filter((p) => p.included).length
    announce(setStatus, changed === 0 ? "Aucun objectif modifié : la suggestion est déjà appliquée." : `Objectif rempli pour ${plural(changed, "personne", "personnes")} ; ${included - changed} inchangé${included - changed > 1 ? "s" : ""}.`)
  }

  function applyRotationSuggestion() {
    setMaxConsecutive("2")
    setMaxNights("2")
    announce(setStatus, "Au plus 2 jours d'affilée sur une même catégorie et 2 ajouts de nuit par personne.")
  }

  async function launch() {
    if (launching) return
    if (launchBlocked) { announce(setStatus, launchBlocked); return }
    const form = formToConfig({ dates, postes, people, posteChoices, maxConsecutiveDays: maxConsecutive, maxNightAddOns: maxNights, seed }, pageShifts, nameOf)
    if (!form.ok) {
      flushSync(() => { setProblems(form.problems); setServerError(null) })
      errorHeading.current?.focus()
      return
    }
    setProblems([])
    setServerError(null)
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
      launchKey.current = null
      if (!res.ok) return fail(typeof body.error === "string" ? body.error : "La proposition n'a pas pu être lancée.")
      const read = await fetch(`/api/admin/events/${data.eventId}/proposals/${body.runId}`, { cache: "no-store" })
      const next = read.ok ? ((await read.json()) as { run: Run }).run : null
      setLaunching(false)
      if (!next) return
      lastState.current = `${next.status}:${next.outcome}`
      shownId.current = next.id
      flushSync(() => setRun(next))
      resultHeading.current?.focus()
      announce(setStatus, body.notice ? `Proposition lancée. ${body.notice}` : "Proposition lancée : calcul en attente.")
      startTransition(() => router.refresh())
    } catch {
      fail(NETWORK_ERROR)
    }
    function fail(text: string) {
      setLaunching(false)
      flushSync(() => setServerError(text))
      errorHeading.current?.focus()
    }
  }

  async function cancel() {
    if (!run || busy) return
    setBusy("cancel")
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/events/${data.eventId}/proposals/${run.id}/cancel`, { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) setActionError(typeof body.error === "string" ? body.error : "L'arrêt n'a pas abouti.")
      else announce(setStatus, "Arrêt demandé : la recherche s'arrête dans quelques secondes.")
    } catch {
      setActionError(NETWORK_ERROR)
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
      resultHeading.current?.focus()
      announce(setStatus, `${plural(body.written ?? 0, "affectation écrite", "affectations écrites")} en brouillon.`)
      startTransition(() => router.refresh())
    } catch {
      setBusy(null)
      setConfirmWrite({ error: NETWORK_ERROR })
    }
  }

  const toggle = (list: string[], value: string, on: boolean) => (on ? [...new Set([...list, value])] : list.filter((v) => v !== value))
  const posteNames = data.postes.map((p) => p.roleName)
  const sectors = [...new Set(data.postes.map((p) => p.sector))]
  const report = run?.report ?? null
  const written = (run?.written ?? null) as Written

  return (
    <div className="space-y-8">
      <p role="status" className="sr-only">{status}</p>
      {run && (
        <p className="text-sm text-gray-800">
          {isDone(run) ? "Proposition affichée" : "Proposition en cours"} : lancée le {runDate(run.createdAt)}, {runStateLabel(run).toLowerCase()}{run.writtenAt ? `, ${plural(run.writtenCount, "affectation écrite", "affectations écrites")}` : ""}.{" "}
          <a href="#proposal-result" className={linkClass} onClick={(e) => { e.preventDefault(); resultHeading.current?.scrollIntoView({ block: "start" }); resultHeading.current?.focus() }}>Aller au résultat</a>
        </p>
      )}

      <section aria-labelledby="proposal-checks" className="space-y-1">
        <h2 id="proposal-checks" className="text-base font-semibold text-gray-900">Ce qui est vérifié</h2>
        <p className="max-w-[75ch] text-sm text-gray-800">La proposition ne place une personne que sur un créneau couvert entièrement par ses disponibilités, et respecte les places, l&apos;âge, les postes réservés, les chevauchements, les limites par poste et la protection des pauses et de la charge. Les inscriptions et les brouillons manuels ou verrouillés restent tels quels.</p>
        {protectionOn
          ? <p className="text-sm text-gray-800">Protection des pauses et de la charge : activée.</p>
          : <p className="text-sm text-[#b91c1c]">Protection des pauses et de la charge : {data.protection === "off" ? "désactivée" : "incomplète"}. <Link href={eventInfoHref} className={linkClass}>Activer la protection dans les informations de l&apos;événement</Link></p>}
      </section>

      <section aria-labelledby="proposal-scope" className="space-y-4">
        <h2 id="proposal-scope" className="text-base font-semibold text-gray-900">Périmètre</h2>
        <fieldset id="proposal-dates" tabIndex={-1} aria-describedby={problemOf("proposal-dates") ? "proposal-dates-error" : undefined} className="space-y-1">
          <legend className="text-sm font-medium text-gray-900">Dates (au moins une)</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={smallButton} onClick={() => setDates(openDates)}>Tout cocher<span className="sr-only"> les dates</span></button>
            <button type="button" className={smallButton} onClick={() => setDates([])}>Tout décocher<span className="sr-only"> les dates</span></button>
          </div>
          <ul role="list" className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {openDates.map((d) => (
              <li key={d}><label className="flex min-h-11 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-6 w-6 accent-blue-600" checked={dates.includes(d)} onChange={(e) => setDates(toggle(dates, d, e.target.checked))} />{dayLabel(d)}</label></li>
            ))}
          </ul>
          {problemOf("proposal-dates") && <p id="proposal-dates-error" className="text-sm text-red-700">{problemOf("proposal-dates")}</p>}
        </fieldset>
        <fieldset id="proposal-postes" tabIndex={-1} aria-describedby={problemOf("proposal-postes") ? "proposal-postes-error" : undefined} className="space-y-1">
          <legend className="text-sm font-medium text-gray-900">Postes (au moins un)</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={smallButton} onClick={() => setPostes(posteNames)}>Tout cocher<span className="sr-only"> les postes</span></button>
            <button type="button" className={smallButton} onClick={() => setPostes([])}>Tout décocher<span className="sr-only"> les postes</span></button>
          </div>
          {sectors.map((sector) => {
            const list = data.postes.filter((p) => p.sector === sector)
            const boxes = (
              <ul role="list" className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((p) => <li key={p.roleName}><label className="flex min-h-11 items-center gap-2 text-sm text-gray-900 break-words"><input type="checkbox" className="h-6 w-6 shrink-0 accent-blue-600" checked={postes.includes(p.roleName)} onChange={(e) => setPostes(toggle(postes, p.roleName, e.target.checked))} />{p.roleName}</label></li>)}
              </ul>
            )
            return sectors.length > 1 || sector ? (
              <fieldset key={sector ?? "none"} className="mt-2">
                <legend className="text-sm text-gray-700">{sector ?? "Sans secteur"}</legend>
                {boxes}
              </fieldset>
            ) : <div key="all">{boxes}</div>
          })}
          {problemOf("proposal-postes") && <p id="proposal-postes-error" className="text-sm text-red-700">{problemOf("proposal-postes")}</p>}
        </fieldset>
        <p className="text-sm font-medium text-gray-900">{countLine}</p>
      </section>

      <section aria-labelledby="proposal-people" className="space-y-3">
        <h2 id="proposal-people" tabIndex={-1} className="text-base font-semibold text-gray-900 rounded focus:outline-none">Personnes et objectifs d&apos;heures</h2>
        <p className="max-w-[75ch] text-sm text-gray-700">L&apos;objectif est l&apos;engagement de chaque personne, en heures sur l&apos;événement (0 pour aucun objectif) : la proposition compare la charge de chacun à son propre objectif, sans chercher l&apos;égalité. Les valeurs d&apos;une personne non incluse sont gardées mais ne servent pas.</p>
        <button type="button" className={smallButton} onClick={applySuggestion}>Appliquer la suggestion : 6 h par date où la personne a indiqué une plage libre</button>
        <p id="target-hint" className="text-sm text-gray-600">En heures, par exemple 12 ou 7,5. Suggestion plafonnée par le maximum de l&apos;événement{data.maxEventMinutes ? ` (${fmtDuration(data.maxEventMinutes)})` : ""}.</p>
        {problemOf("proposal-people") && <p className="text-sm text-red-700">{problemOf("proposal-people")}</p>}
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
                        {err && <p id={`target-err-${p.volunteerId}`} className="mt-1 max-w-[30ch] text-xs text-red-700">{err}</p>}
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
                        {avoidErr && <p id={`avoid-err-${p.volunteerId}`} className="mt-1 max-w-[30ch] text-xs text-red-700">{avoidErr}</p>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Below md: one fieldset per person (the same state). */}
        <ul role="list" className="md:hidden space-y-3">
          {data.people.map((p) => {
            const c = people.find((x) => x.volunteerId === p.volunteerId)!
            const err = problemOf(`target-${p.volunteerId}`)
            return (
              <li key={p.volunteerId}>
                <fieldset className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                  <legend className="px-1 text-sm font-medium text-gray-900 break-words">{p.firstName} {p.lastName}</legend>
                  <label className="flex min-h-11 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-6 w-6 accent-blue-600" checked={c.included} onChange={(e) => updatePerson(p.volunteerId, { included: e.target.checked })} />Inclure</label>
                  <p className="text-sm text-gray-800">{p.answered ? "A répondu" : "Sans réponse"}. Suggestion : {formatHours(p.suggestionMinutes)} heure{p.suggestionMinutes > 60 ? "s" : ""}.</p>
                  <div>
                    <label htmlFor={`m-target-${p.volunteerId}`} className="block text-sm font-medium text-gray-900">Objectif d&apos;heures</label>
                    <input id={`m-target-${p.volunteerId}`} type="text" inputMode="decimal" autoComplete="off" className={`${input} w-28`} aria-describedby={[err && `m-target-err-${p.volunteerId}`, "target-hint"].filter(Boolean).join(" ")} aria-invalid={err ? true : undefined} value={c.targetHours} onChange={(e) => updatePerson(p.volunteerId, { targetHours: e.target.value })} />
                    {err && <p id={`m-target-err-${p.volunteerId}`} className="mt-1 text-xs text-red-700">{err}</p>}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`m-prefer-${p.volunteerId}`} className="block text-sm font-medium text-gray-900">Poste souhaité</label>
                      <select id={`m-prefer-${p.volunteerId}`} className={`${input} w-full`} value={c.prefer} onChange={(e) => updatePerson(p.volunteerId, { prefer: e.target.value })}>
                        <option value="">Aucun</option>
                        {posteNames.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`m-avoid-${p.volunteerId}`} className="block text-sm font-medium text-gray-900">Poste à éviter</label>
                      <select id={`m-avoid-${p.volunteerId}`} className={`${input} w-full`} aria-describedby={problemOf(`avoid-${p.volunteerId}`) ? `m-avoid-err-${p.volunteerId}` : undefined} aria-invalid={problemOf(`avoid-${p.volunteerId}`) ? true : undefined} value={c.avoid} onChange={(e) => updatePerson(p.volunteerId, { avoid: e.target.value })}>
                        <option value="">Aucun</option>
                        {posteNames.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      {problemOf(`avoid-${p.volunteerId}`) && <p id={`m-avoid-err-${p.volunteerId}`} className="mt-1 text-xs text-red-700">{problemOf(`avoid-${p.volunteerId}`)}</p>}
                    </div>
                  </div>
                </fieldset>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="proposal-rotation" className="space-y-3">
        <h2 id="proposal-rotation" className="text-base font-semibold text-gray-900">Rotation, nuit et réserve</h2>
        <p id="category-hint" className="max-w-[75ch] text-sm text-gray-700">Catégorie de rotation : même nom, même catégorie ; vide : le poste forme sa propre catégorie. La proposition évite de laisser une personne trop de jours d&apos;affilée dans la même catégorie.</p>
        <p id="night-hint" className="max-w-[75ch] text-sm text-gray-700">Ajout de nuit : une mission courte après une soirée, répartie entre les personnes. Réserve : des personnes présentes et disponibles sur place, gardées en priorité comme un minimum.</p>
        <div className="hidden md:block space-y-1">
          {hidesPostes && <p id="poste-scroll-hint" className="text-sm text-gray-600">{TABLE_SCROLL_HINT}</p>}
          <div ref={posteRegion} role="region" aria-label="Rotation, nuit et réserve par poste" aria-describedby={hidesPostes ? "poste-scroll-hint" : undefined} tabIndex={hidesPostes ? 0 : undefined} className={`relative overflow-x-auto rounded-xl border border-gray-200 bg-white ${focusRing}`}>
            <table className="text-sm border-collapse min-w-full">
              <caption className="sr-only">Catégorie de rotation, ajout de nuit et réserve de chaque poste</caption>
              <thead className="bg-gray-50 text-xs text-gray-700">
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
                  return (
                    <tr key={p.roleName} className="border-t border-gray-100">
                      <th scope="row" id={rowId} className="px-3 py-2 text-left font-medium text-gray-900 break-words">{p.roleName}</th>
                      <td className="px-3 py-2"><input type="text" autoComplete="off" className={`${input} w-48`} aria-labelledby={`col-category ${rowId}`} aria-describedby="category-hint" value={c.category} onChange={(e) => updatePoste(p.roleName, { category: e.target.value })} /></td>
                      <td className="px-3 py-2"><input type="checkbox" className="h-6 w-6 accent-blue-600" aria-labelledby={`col-night ${rowId}`} aria-describedby="night-hint" checked={c.night} onChange={(e) => updatePoste(p.roleName, { night: e.target.checked })} /></td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <input id={`reserve-${i}`} type="text" inputMode="numeric" autoComplete="off" className={`${input} w-16`} aria-labelledby={`col-reserve ${rowId}`} aria-describedby={[`reserve-cap-${i}`, reserveErr && `reserve-err-${i}`].filter(Boolean).join(" ")} aria-invalid={reserveErr ? true : undefined} value={c.reserveText ?? String(c.reserve)} onChange={(e) => updatePoste(p.roleName, reserveChange(e.target.value))} />
                          <span id={`reserve-cap-${i}`} className="text-gray-700">0 à {p.capacity}</span>
                        </span>
                        {reserveErr && <p id={`reserve-err-${i}`} className="mt-1 text-xs text-red-700">{reserveErr}</p>}
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
            const key = String(i)
            const reserveErr = problemOf(`reserve-${i}`)
            return (
              <li key={p.roleName}>
                <fieldset className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                  <legend className="px-1 text-sm font-medium text-gray-900 break-words">{p.roleName}</legend>
                  <div>
                    <label htmlFor={`m-category-${key}`} className="block text-sm font-medium text-gray-900">Catégorie de rotation</label>
                    <input id={`m-category-${key}`} type="text" autoComplete="off" className={`${input} w-full`} aria-describedby="category-hint" value={c.category} onChange={(e) => updatePoste(p.roleName, { category: e.target.value })} />
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-6 w-6 accent-blue-600" aria-describedby="night-hint" checked={c.night} onChange={(e) => updatePoste(p.roleName, { night: e.target.checked })} />Ajout de nuit</label>
                  <div>
                    <label htmlFor={`m-reserve-${key}`} className="block text-sm font-medium text-gray-900">Réserve à garder par créneau</label>
                    <span className="flex items-center gap-2">
                      <input id={`m-reserve-${key}`} type="text" inputMode="numeric" autoComplete="off" className={`${input} w-16`} aria-describedby={[`m-reserve-cap-${key}`, reserveErr && `m-reserve-err-${key}`].filter(Boolean).join(" ")} aria-invalid={reserveErr ? true : undefined} value={c.reserveText ?? String(c.reserve)} onChange={(e) => updatePoste(p.roleName, reserveChange(e.target.value))} />
                      <span id={`m-reserve-cap-${key}`} className="text-sm text-gray-700">0 à {p.capacity}</span>
                    </span>
                    {reserveErr && <p id={`m-reserve-err-${key}`} className="mt-1 text-xs text-red-700">{reserveErr}</p>}
                  </div>
                </fieldset>
              </li>
            )
          })}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
          <div>
            <label htmlFor="proposal-consecutive" className="block text-sm font-medium text-gray-900">Jours d&apos;affilée sur une même catégorie, au plus</label>
            <input id="proposal-consecutive" type="text" inputMode="numeric" autoComplete="off" className={`${input} w-20`} aria-describedby={["rotation-hint", problemOf("proposal-consecutive") && "proposal-consecutive-error"].filter(Boolean).join(" ")} aria-invalid={problemOf("proposal-consecutive") ? true : undefined} value={maxConsecutive} onChange={(e) => setMaxConsecutive(e.target.value)} />
            {problemOf("proposal-consecutive") && <p id="proposal-consecutive-error" className="text-xs text-red-700">{problemOf("proposal-consecutive")}</p>}
          </div>
          <div>
            <label htmlFor="proposal-nights" className="block text-sm font-medium text-gray-900">Ajouts de nuit par personne, au plus</label>
            <input id="proposal-nights" type="text" inputMode="numeric" autoComplete="off" className={`${input} w-20`} aria-describedby={["rotation-hint", problemOf("proposal-nights") && "proposal-nights-error"].filter(Boolean).join(" ")} aria-invalid={problemOf("proposal-nights") ? true : undefined} value={maxNights} onChange={(e) => setMaxNights(e.target.value)} />
            {problemOf("proposal-nights") && <p id="proposal-nights-error" className="text-xs text-red-700">{problemOf("proposal-nights")}</p>}
          </div>
        </div>
        <p id="rotation-hint" className="text-sm text-gray-600">Laissez vide pour ne pas en tenir compte.</p>
        <button type="button" className={smallButton} onClick={applyRotationSuggestion}>Utiliser 2 jours et 2 ajouts de nuit</button>
      </section>

      <details ref={detailsRef} className="rounded-xl border border-gray-200 bg-white p-3">
        <summary className={`min-h-11 cursor-pointer py-2 text-sm font-medium text-gray-900 rounded ${focusRing}`}>Paramètres de calcul</summary>
        <div className="mt-2">
          <label htmlFor="proposal-seed" className="block text-sm font-medium text-gray-900">Graine</label>
          <input id="proposal-seed" type="text" inputMode="numeric" autoComplete="off" className={`${input} w-36`} aria-describedby={["seed-hint", problemOf("proposal-seed") && "proposal-seed-error"].filter(Boolean).join(" ")} aria-invalid={problemOf("proposal-seed") ? true : undefined} value={seed} onChange={(e) => setSeed(e.target.value)} />
          <p id="seed-hint" className="text-sm text-gray-600">Même graine, mêmes données : même proposition. Changez-la pour obtenir une autre répartition aussi bonne selon les mêmes critères.</p>
          {problemOf("proposal-seed") && <p id="proposal-seed-error" className="text-xs text-red-700">{problemOf("proposal-seed")}</p>}
        </div>
      </details>

      <div className="space-y-2">
        {(problems.length > 0 || serverError) && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            <h2 ref={errorHeading} tabIndex={-1} className="font-semibold rounded focus:outline-none">{serverError ? "La proposition n'a pas été lancée" : problems.length > 1 ? `${problems.length} points à corriger` : "1 point à corriger"}</h2>
            {serverError && <p>{serverError}</p>}
            {problems.length > 0 && (
              <ul role="list" className="mt-1 list-disc pl-5 space-y-0.5">
                {problems.map((p) => (
                  <li key={p.field + p.message}>
                    <a href={`#${p.field}`} className={linkClass} onClick={(e) => {
                      const target = (document.getElementById(p.field)?.offsetParent ? document.getElementById(p.field) : document.getElementById(`m-${p.field}`)) ?? (p.field === "proposal-people" ? document.getElementById("proposal-people") : null)
                      if (!target) return
                      e.preventDefault()
                      if (p.field === "proposal-seed" && detailsRef.current) detailsRef.current.open = true
                      target.scrollIntoView({ block: "center", inline: "center" })
                      target.focus()
                    }}>{p.message}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button type="button" onClick={() => void launch()} aria-disabled={launching || !!launchBlocked || undefined} aria-busy={launching || undefined} aria-describedby={launchBlocked ? "proposal-blocked" : "proposal-launch-hint"} className={primaryButton}>
          {launching ? "Lancement…" : "Générer une proposition"}
        </button>
        {launchBlocked ? <p id="proposal-blocked" className="text-sm text-gray-800">{launchBlocked}</p> : <p id="proposal-launch-hint" className="text-sm text-gray-700">La proposition est écrite dans les affectations en brouillon et remplace les brouillons proposés non verrouillés de ce périmètre. Rien n&apos;est publié et personne n&apos;est prévenu.</p>}
      </div>

      {run && (
        <section aria-labelledby="proposal-result" className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h2 id="proposal-result" ref={resultHeading} tabIndex={-1} className="text-base font-semibold text-gray-900 rounded focus:outline-none">{isDone(run) ? "Résultat de la proposition" : "Proposition en cours"}</h2>
          <p className="text-sm text-gray-800">Lancée le {runDate(run.createdAt)}, graine {run.seed}. {stateBadge(run)}</p>
          {!isDone(run) && (
            <>
              <p id="proposal-progress" className="text-sm text-gray-800">{run.status === "queued" ? "En attente d'une place de calcul." : `Calcul en cours${(run.progress as { evaluations?: number } | null)?.evaluations ? ` : ${(run.progress as { evaluations: number }).evaluations.toLocaleString("fr-FR")} évaluations` : ""}.`}{run.cancelRequested ? " Arrêt demandé." : ""}</p>
              <button id="proposal-cancel" type="button" onClick={() => void cancel()} aria-describedby={run.cancelRequested ? "proposal-progress" : undefined} aria-disabled={busy === "cancel" || run.cancelRequested || undefined} aria-busy={busy === "cancel" || undefined} className={smallButton}>{busy === "cancel" ? "Arrêt…" : "Arrêter la recherche"}</button>
              <p role="alert" className={actionError ? "text-sm text-red-700" : "sr-only"}>{actionError}</p>
            </>
          )}
          {isDone(run) && (
            <>
              {report && <p className="max-w-[75ch] text-sm text-gray-800">{stateSentence({ outcome: report.outcome, execution: run.status === "interrupted" ? "interrupted" : "finished", stopReason: (run.stopReason ?? "budget") as ProposalReport["stopReason"] })}</p>}
              {run.status === "failed" && <p className="text-sm text-gray-800">Le calcul a échoué ; rien n&apos;a été écrit. Relancez la proposition.</p>}
              {run.stopReason === "lease_expired" && <p className="text-sm text-gray-800">Le calcul a été interrompu par un redémarrage du service ; rien n&apos;a été écrit. Relancez la proposition avec la même graine pour obtenir le même résultat.</p>}
              {run.stale.length > 0 && <p className="max-w-[75ch] text-sm text-[#92400e]">{staleSentence(run.stale)}</p>}
              <ul role="list" className="text-sm text-gray-800 space-y-0.5">
                {report && <li>{report.coverage.filled} places couvertes sur {report.coverage.seats}</li>}
                {report && <li>Minimums{"\u00a0"}: {report.coverage.criticalFilled} sur {report.coverage.criticalSeats}{report.coverage.reserveSeats > 0 ? ` ; réserve\u00a0: ${report.coverage.reserveFilled} sur ${report.coverage.reserveSeats}` : ""}</li>}
                {run.writtenAt && <li>{plural(run.writtenCount, "affectation écrite", "affectations écrites")} dans les brouillons{written?.replaced?.length ? ` ; ${plural(written.replaced.length, "brouillon proposé remplacé", "brouillons proposés remplacés")}` : ""}.</li>}
                {written?.dropped && droppedSentence(written.dropped) && <li>{droppedSentence(written.dropped)}</li>}
                {written?.error && <li className="text-[#b91c1c]">{written.error}</li>}
                {!run.writtenAt && run.status === "interrupted" && report && <li>Rien n&apos;a été écrit dans les brouillons.</li>}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Link href={draftsHref} className={`inline-flex min-h-11 items-center text-sm ${linkClass}`}>Voir les affectations en brouillon</Link>
                {!run.writtenAt && report && (run.status === "interrupted" || run.status === "finished") && report.assignments.length > 0 && (
                  <button id="proposal-write" type="button" onClick={() => setConfirmWrite({ error: null })} aria-disabled={!!busy || undefined} className={smallButton}>Utiliser ce résultat partiel</button>
                )}
              </div>
              {report && report.gaps.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Places restées vides ({report.gaps.length})</h3>
                  <ul role="list" className="mt-1 space-y-1 text-sm text-gray-800">
                    {report.gaps.map((g) => <li key={g.shiftId}><span className="font-medium">{data.shiftWords[g.shiftId] ?? "Créneau"}</span> : {gapSentence(g)}</li>)}
                  </ul>
                </div>
              )}
              {report && report.people.length > 0 && <PeopleLoad report={report} nameOf={nameOf} />}
              {report && report.assignments.length > 0 && (
                <details className="rounded-lg border border-gray-200 p-2">
                  <summary className={`min-h-11 cursor-pointer py-2 text-sm font-medium text-gray-900 rounded ${focusRing}`}>Affectations proposées ({report.assignments.length})</summary>
                  <ul role="list" className="mt-2 space-y-2 text-sm text-gray-800">
                    {report.assignments.map((a) => <li key={`${a.shiftId}-${a.volunteerId}`}><span className="font-medium">{nameOf(a.volunteerId)}</span>, {data.shiftWords[a.shiftId] ?? "créneau"} : {assignmentSentence(a)}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
      )}

      {data.runs.length > 0 && (
        <section aria-labelledby="proposal-history">
          <h2 id="proposal-history" className="text-base font-semibold text-gray-900">Propositions précédentes</h2>
          <ul role="list" className="mt-1 space-y-1 text-sm">
            {data.runs.map((r) => {
              const current = run?.id === r.id
              return (
                <li key={r.id}>
                  <Link href={`${basePath}?run=${r.id}`} aria-current={current ? "page" : undefined} className={`${linkClass} ${current ? "font-bold" : ""}`}>
                    {runDate(r.createdAt)} : {runStateLabel(r).toLowerCase()}{r.writtenAt ? `, ${plural(r.writtenCount, "affectation écrite", "affectations écrites")}` : ", rien d'écrit"}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {confirmWrite && report && (
        <ConfirmActionModal
          recap={{
            title: "Utiliser ce résultat partiel ?",
            lead: `${plural(report.assignments.length, "affectation sera écrite", "affectations seront écrites")} dans les brouillons, après une nouvelle vérification ; les brouillons proposés non verrouillés de ce périmètre seront remplacés. Les brouillons verrouillés et manuels ne changent pas.`,
            lines: ["Rien n'est publié et personne n'est prévenu."],
            confirmLabel: "Écrire dans les brouillons",
            danger: false,
          }}
          busy={busy === "write"}
          error={confirmWrite.error}
          onConfirm={() => void writePartial()}
          onCancel={() => setConfirmWrite(null)}
        />
      )}
    </div>
  )
}

/** Each person's target against what is planned, a table in a scroll region. */
function PeopleLoad({ report, nameOf }: { report: ProposalReport; nameOf: (id: string) => string }) {
  const region = useRef<HTMLDivElement>(null)
  const hides = useHidesColumns(region, [report.people.length])
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-gray-900">Charge par personne</h3>
      <a href="#proposal-after-load" className={`text-sm ${linkClass}`}>Passer le tableau</a>
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
                <td className="px-3 py-2 text-gray-800">{p.categories.length === 0 ? "Aucune mission" : `${p.categories.length} ${p.categories.length > 1 ? "activités" : "activité"}${p.nightAddOns > 0 ? `, ${p.nightAddOns} ${p.nightAddOns > 1 ? "ajouts de nuit" : "ajout de nuit"}` : ""}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span id="proposal-after-load" tabIndex={-1} />
    </div>
  )
}
