"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useParams } from "next/navigation"
import PublicFooter from "@/components/PublicFooter"
import OrgUnavailableNotice from "@/components/public/OrgUnavailableNotice"
import AvailabilityEditor, { type SaveOutcome } from "@/components/AvailabilityEditor"
import { announce } from "@/lib/announce"
import { isOrgUnavailable, orgUnavailableContact } from "@/lib/org-lifecycle"
import { orgPageFooterSite } from "@/lib/urls"
import { isTokenShaped, tokenPath } from "@/lib/token-path"
import { dayLabel } from "@/lib/spoken-time"
import { dayAnswerText, datesCountText, nbspQuotes } from "@/lib/availability-editor"
import { answerState, type AnswerState, type DayAnswerInput } from "@/lib/event-availability"
import {
  AVAILABILITY_LINK_NOTICE, CORRECTION_NOTICE, CORRECTION_SAVED_TEXT, DEADLINE_PASSED_ERROR, LINK_NOT_FOUND_ERROR,
  closedNowSentence, contactLine, correctionDeadlineSentence, deadlineSentence, myAvailabilityTitle, savedSentence,
} from "@/lib/event-availability-text"

type View = {
  event: { title: string; organizationName: string; datesLabel: string }
  timeZone: string
  dates: string[]
  deadline: string | null
  open: boolean
  state: AnswerState
  days: { date: string; ranges: { startTime: string; endTime: string }[] }[]
  /** A mission given by a publication (#1146, lot C): corrections stay possible, they cancel nothing. */
  correction?: { published: boolean; viaCorrection: boolean; until: string | null }
  contactEmail?: string | null
}

/** Why the page cannot show the answers: each with its own words (independent review, #1146). */
type Failure =
  | { kind: "not_found"; organizationName: string | null }
  | { kind: "too_many" }
  | { kind: "offline" }

const LINK = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/** Where the answer stands, in words: « Réponse partielle : 3 dates sur 11 ». */
function stateLine(v: View): string {
  const answered = v.days.filter((d) => v.dates.includes(d.date)).length
  switch (v.state) {
    case "none": return "Tu n'as pas encore répondu."
    case "partial": return `Réponse partielle : ${datesCountText(answered, v.dates.length)}.`
    case "complete": return "Tu as répondu pour toutes les dates."
    default: return "Tu as indiqué n'être disponible à aucune date."
  }
}

function Contact({ organizationName, email }: { organizationName: string | null; email: string | null }) {
  const line = contactLine(organizationName, email)
  return (
    <p className="text-sm text-gray-700" data-availability-contact="1">
      {line.lead}
      {line.email && <>{" "}<a href={`mailto:${line.email}`} className={LINK}>{line.email}</a></>}
    </p>
  )
}

/**
 * « Mes disponibilités pour [événement] » (#1146), the page of the link « Indiquer mes
 * disponibilités »: no account, phone first. The person's own answer only, never anyone else's.
 * After the deadline (owner decision 2), the answers are listed as text, not as disabled fields,
 * with whom to write to. A link that does not work, too many attempts and a lost connection each
 * say so in their own words (independent review).
 */
export default function MyAvailabilityPage() {
  const params = useParams()
  const token = params.token as string
  const [view, setView] = useState<View | null>(null)
  const [loading, setLoading] = useState(() => isTokenShaped(token))
  const [failure, setFailure] = useState<Failure | null>(() => (isTokenShaped(token) ? null : { kind: "not_found", organizationName: null }))
  const [orgUnavailable, setOrgUnavailable] = useState<{ contact: string | null } | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [retryStatus, setRetryStatus] = useState("")
  const [retried, setRetried] = useState(false)
  // The deadline passed while the page was open: said once, with focus on that sentence.
  const [closedNow, setClosedNow] = useState<{ lost: boolean } | null>(null)
  const closedRef = useRef<HTMLParagraphElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const url = tokenPath("/api/public/availability", token)

  /** What the link gives: the page, or why not; nothing is set here, so it can run from an effect. */
  type Loaded = { view: View } | { failure: Failure } | { orgUnavailable: { contact: string | null } }
  const fetchPage = useCallback(async (): Promise<Loaded> => {
    try {
      const r = await fetch(url!, { cache: "no-store" })
      const data = await r.json().catch(() => ({}))
      if (isOrgUnavailable(data)) return { orgUnavailable: { contact: orgUnavailableContact(data) } }
      if (r.status === 429) return { failure: { kind: "too_many" } }
      if (!r.ok) return { failure: { kind: "not_found", organizationName: typeof data.organizationName === "string" ? data.organizationName : null } }
      return { view: data as View }
    } catch {
      return { failure: { kind: "offline" } }
    }
  }, [url])

  const apply = useCallback((loaded: Loaded) => {
    if ("view" in loaded) { setFailure(null); setView(loaded.view) }
    else if ("failure" in loaded) setFailure(loaded.failure)
    else setOrgUnavailable(loaded.orgUnavailable)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!url) return
    let live = true
    void fetchPage().then((loaded) => { if (live) apply(loaded) })
    return () => { live = false }
  }, [url, fetchPage, apply])

  useEffect(() => {
    if (view) document.title = `${myAvailabilityTitle(view.event.title)} — Bénévoles`
    else if (failure?.kind === "not_found") document.title = "Lien introuvable — Bénévoles"
    else if (failure?.kind === "too_many") document.title = "Trop de tentatives — Bénévoles"
    else if (failure?.kind === "offline") document.title = "Connexion impossible — Bénévoles"
  }, [view, failure])

  async function retry() {
    if (retrying) return
    setRetrying(true)
    setRetried(true)
    setRetryStatus("")
    const loaded = await fetchPage()
    // Rendered now, so the focus below finds the new page's title.
    flushSync(() => { apply(loaded); setRetrying(false) })
    const ok = !("failure" in loaded) || loaded.failure.kind === "not_found"
    // The page that replaced the button (answers, dead link, closed space): focus on its title.
    if (ok) { (titleRef.current ?? document.querySelector<HTMLElement>("main h1"))?.focus(); return }
    announce(setRetryStatus, "Toujours impossible de charger la page. Réessaie dans un moment.")
  }

  /** Shows the answers read-only (the form leaves under focus): focus on why, and what was kept. */
  function showClosed(next: View, lost: boolean) {
    flushSync(() => { setView(next); setClosedNow({ lost }) })
    closedRef.current?.focus()
  }

  async function save(days: DayAnswerInput[]): Promise<SaveOutcome> {
    const res = await fetch(url!, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 409 && data.error === DEADLINE_PASSED_ERROR) {
        const fresh = await fetch(url!, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        if (fresh && fresh.open === false) { showClosed(fresh as View, true); return { ok: true } }
      }
      if (res.status === 429) return { ok: false, error: "Trop de tentatives : rien n'a été enregistré. Attends quelques minutes, puis réessaie." }
      return { ok: false, error: typeof data.error === "string" ? data.error : "Tes disponibilités n'ont pas pu être enregistrées. Réessaie.", at: data.at }
    }
    if ((data as View).open === false) { showClosed(data as View, false); return { ok: true } }
    setView((v) => (v ? { ...v, ...(data as View) } : (data as View)))
    return { ok: true }
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><p role="status" className="text-gray-700">Chargement…</p></main>
  if (orgUnavailable) return <OrgUnavailableNotice audience="volunteer" contact={orgUnavailable.contact} focusHeading={retried} />
  if (failure || !view) {
    const f: Failure = failure ?? { kind: "not_found", organizationName: null }
    const title = f.kind === "not_found" ? "Lien introuvable" : f.kind === "too_many" ? "Trop de tentatives" : "Connexion impossible"
    return (
      <>
        <main className="flex-1 bg-gray-50 flex items-center justify-center px-4 py-12">
          <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 space-y-3" data-availability-failure={f.kind}>
            <h1 ref={titleRef} tabIndex={-1} className="text-lg font-semibold text-gray-900 outline-none">{title}</h1>
            {f.kind === "not_found" && (
              <>
                <p className="text-sm text-gray-700">{LINK_NOT_FOUND_ERROR} Il a peut-être été remplacé par un plus récent, ou la collecte est terminée.</p>
                <Contact organizationName={f.organizationName} email={null} />
              </>
            )}
            {f.kind !== "not_found" && (
              <>
                <p className="text-sm text-gray-700">
                  {f.kind === "too_many"
                    ? "Ce lien a été ouvert trop de fois en peu de temps. Attends quelques minutes, puis réessaie."
                    : "La page n'a pas pu être chargée : vérifie ta connexion à internet, puis réessaie. Tes réponses déjà enregistrées ne sont pas perdues."}
                </p>
                <button
                  type="button"
                  onClick={() => void retry()}
                  aria-disabled={retrying || undefined}
                  className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  {retrying ? "Nouvelle tentative…" : "Réessayer"}
                </button>
                <p role="status" className={retryStatus ? "text-sm text-gray-800" : "sr-only"}>{retryStatus}</p>
              </>
            )}
          </div>
        </main>
        <div className="px-4"><PublicFooter site={orgPageFooterSite()} /></div>
      </>
    )
  }

  const byDate = new Map(view.days.map((d) => [d.date, d]))
  const published = !!view.correction?.published
  const correctionUntil = view.correction?.viaCorrection && view.correction.until ? view.correction.until : null
  const deadline = correctionUntil
    ? correctionDeadlineSentence(new Date(correctionUntil), view.timeZone)
    : deadlineSentence(view.deadline, view.open, view.timeZone)
  // The state is shown from what is stored, so it follows each save.
  const state = answerState(view.dates, view.days.map((d) => ({ date: d.date, rangeCount: d.ranges.length })))
  const savedText = published ? CORRECTION_SAVED_TEXT : savedSentence(correctionUntil ?? view.deadline, view.timeZone)

  return (
    <>
      <main className="flex-1 bg-gray-50 px-4 py-8">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="space-y-1">
            <h1 ref={titleRef} tabIndex={-1} className="text-xl font-bold text-gray-900 outline-none">{myAvailabilityTitle(view.event.title)}</h1>
            <p className="text-sm text-gray-700">{view.event.organizationName} · {view.event.datesLabel.charAt(0).toUpperCase() + view.event.datesLabel.slice(1)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2 text-sm text-gray-800">
            {view.open && <p>{nbspQuotes("Pour chaque date, indique les heures où tu es libre, ou « Pas disponible ». Un horaire du soir peut finir le lendemain matin, par exemple de 20h à 3h. Pas besoin de compte. Seule l'organisation voit tes réponses.")}</p>}
            {/* Said once: after a deadline that just passed, the sentence under « Tes réponses » says it. */}
            {deadline && !closedNow && <p className="font-medium text-gray-900">{deadline}</p>}
            {published && view.open && <p data-availability-correction="1">{CORRECTION_NOTICE}</p>}
            <p className="text-gray-700">{view.open ? AVAILABILITY_LINK_NOTICE : "Ce lien est personnel : ne le transmets pas. Seule l'organisation voit tes réponses."}</p>
          </div>
          <section aria-labelledby="my-availability-answers" className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
            <h2 id="my-availability-answers" className="text-base font-semibold text-gray-900">Tes réponses</h2>
            {closedNow && <p ref={closedRef} tabIndex={-1} className="text-sm font-medium text-gray-900 outline-none" data-availability-closed-now={closedNow.lost ? "lost" : "saved"}>{closedNowSentence(published, closedNow.lost)}</p>}
            <p className="text-sm text-gray-700" data-availability-state={state}>{stateLine({ ...view, state })}</p>
            {view.open ? (
              <AvailabilityEditor
                idPrefix="my-av"
                dates={view.dates}
                initialDays={view.days}
                voice="tu"
                submitLabel="Enregistrer mes disponibilités"
                savedText={savedText}
                onSave={save}
              />
            ) : (
              <>
                <ul role="list" className="space-y-1 text-sm text-gray-900" data-availability-readonly="1">
                  {view.dates.map((date) => (
                    <li key={date}><span className="font-medium">{dayLabel(date)}</span> : {dayAnswerText(byDate.get(date))}</li>
                  ))}
                </ul>
                <Contact organizationName={view.event.organizationName} email={view.contactEmail ?? null} />
              </>
            )}
          </section>
        </div>
      </main>
      <div className="px-4"><PublicFooter site={orgPageFooterSite()} /></div>
    </>
  )
}
