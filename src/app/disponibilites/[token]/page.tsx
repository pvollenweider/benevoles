"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useParams } from "next/navigation"
import PublicFooter from "@/components/PublicFooter"
import OrgUnavailableNotice from "@/components/public/OrgUnavailableNotice"
import AvailabilityEditor, { type SaveOutcome } from "@/components/AvailabilityEditor"
import { isOrgUnavailable, orgUnavailableContact } from "@/lib/org-lifecycle"
import { orgPageFooterSite } from "@/lib/urls"
import { isTokenShaped, tokenPath } from "@/lib/token-path"
import { dayLabel } from "@/lib/spoken-time"
import { dayAnswerText, datesCountText } from "@/lib/availability-editor"
import { answerState, type AnswerState, type DayAnswerInput } from "@/lib/event-availability"
import { AVAILABILITY_LINK_NOTICE, DEADLINE_PASSED_ERROR, LINK_NOT_FOUND_ERROR, deadlineSentence, myAvailabilityTitle } from "@/lib/event-availability-text"

type View = {
  event: { title: string; organizationName: string; datesLabel: string }
  timeZone: string
  dates: string[]
  deadline: string | null
  open: boolean
  state: AnswerState
  days: { date: string; ranges: { startTime: string; endTime: string }[] }[]
}

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

/**
 * « Mes disponibilités pour [événement] » (#1146), the page of the link « Indiquer mes
 * disponibilités »: no account, phone first. The person's own answer only, never anyone else's.
 * After the deadline (owner decision 2), the answers are listed as text, not as disabled fields.
 */
export default function MyAvailabilityPage() {
  const params = useParams()
  const token = params.token as string
  const [view, setView] = useState<View | null>(null)
  const [loading, setLoading] = useState(() => isTokenShaped(token))
  const [notFound, setNotFound] = useState(() => !isTokenShaped(token))
  const [orgUnavailable, setOrgUnavailable] = useState<{ contact: string | null } | null>(null)
  // The deadline passed while the page was open: said once, focus on the answers' heading.
  const [closedNow, setClosedNow] = useState(false)
  const answersHeading = useRef<HTMLHeadingElement>(null)
  const url = tokenPath("/api/public/availability", token)

  useEffect(() => {
    if (!url) return
    fetch(url, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (isOrgUnavailable(data)) setOrgUnavailable({ contact: orgUnavailableContact(data) })
        else if (!ok) setNotFound(true)
        else setView(data as View)
        setLoading(false)
      })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [url])

  useEffect(() => {
    if (view) document.title = `${myAvailabilityTitle(view.event.title)} — Bénévoles`
    else if (notFound) document.title = "Lien introuvable — Bénévoles"
  }, [view, notFound])

  /** Shows the answers read-only (the form leaves under focus): focus to their heading, and why. */
  function showClosed(next: View) {
    flushSync(() => { setView(next); setClosedNow(true) })
    answersHeading.current?.focus()
  }

  async function save(days: DayAnswerInput[]): Promise<SaveOutcome> {
    const res = await fetch(url!, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 409 && data.error === DEADLINE_PASSED_ERROR) {
        const fresh = await fetch(url!, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        if (fresh && fresh.open === false) { showClosed(fresh as View); return { ok: true } }
      }
      return { ok: false, error: typeof data.error === "string" ? data.error : "Tes disponibilités n'ont pas pu être enregistrées. Réessaie.", at: data.at }
    }
    if ((data as View).open === false) { showClosed(data as View); return { ok: true } }
    setView((v) => (v ? { ...v, ...(data as View) } : (data as View)))
    return { ok: true }
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><p role="status" className="text-gray-700">Chargement…</p></main>
  if (orgUnavailable) return <OrgUnavailableNotice audience="volunteer" contact={orgUnavailable.contact} />
  if (notFound || !view) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-2">
          <h1 className="text-lg font-semibold text-gray-900">Lien introuvable</h1>
          <p className="text-sm text-gray-700">{LINK_NOT_FOUND_ERROR} Il a peut-être été remplacé par un plus récent, ou la collecte est terminée. Demande un nouveau lien à l&apos;organisation.</p>
        </div>
      </main>
    )
  }

  const byDate = new Map(view.days.map((d) => [d.date, d]))
  const deadline = deadlineSentence(view.deadline, view.open, view.timeZone)
  // The state is shown from what is stored, so it follows each save.
  const state = answerState(view.dates, view.days.map((d) => ({ date: d.date, rangeCount: d.ranges.length })))

  return (
    <>
      <main className="flex-1 bg-gray-50 px-4 py-8">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-gray-900">{myAvailabilityTitle(view.event.title)}</h1>
            <p className="text-sm text-gray-700">{view.event.organizationName} · {view.event.datesLabel.charAt(0).toUpperCase() + view.event.datesLabel.slice(1)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2 text-sm text-gray-800">
            {view.open && <p>Pour chaque date, indique tes plages libres ou « Pas disponible ». Une plage du soir peut finir le lendemain matin (par exemple de 20h à 3h). Seule l&apos;organisation voit tes réponses.</p>}
            {deadline && <p className="font-medium text-gray-900">{deadline}</p>}
            <p className="text-gray-700">{view.open ? AVAILABILITY_LINK_NOTICE : "Ce lien est personnel : ne le transmets pas. Seule l'organisation voit tes réponses."}</p>
          </div>
          <section aria-labelledby="my-availability-answers" className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
            <h2 ref={answersHeading} tabIndex={-1} id="my-availability-answers" className="text-base font-semibold text-gray-900 focus:outline-none">Tes réponses</h2>
            {closedNow && <p className="text-sm font-medium text-gray-900" data-availability-closed-now="1">La date limite vient de passer : tes réponses ne peuvent plus être changées ici. Voici ce que l&apos;organisation a reçu.</p>}
            <p className="text-sm text-gray-700" data-availability-state={state}>{stateLine({ ...view, state })}</p>
            {view.open ? (
              <AvailabilityEditor
                idPrefix="my-av"
                dates={view.dates}
                initialDays={view.days}
                voice="tu"
                submitLabel="Enregistrer mes disponibilités"
                savedText="Disponibilités enregistrées. Tu peux les changer jusqu'à la date limite."
                onSave={save}
              />
            ) : (
              <ul role="list" className="space-y-1 text-sm text-gray-900" data-availability-readonly="1">
                {view.dates.map((date) => (
                  <li key={date}><span className="font-medium">{dayLabel(date)}</span> : {dayAnswerText(byDate.get(date))}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
      <div className="px-4"><PublicFooter site={orgPageFooterSite()} /></div>
    </>
  )
}
