"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { eventHourSummaries, withinPeriod, type HourEntry } from "@/lib/volunteer-hours"
import { fmtDuration } from "@/lib/signup-recap"
import { announce } from "@/lib/announce"
import { focusFirstAvailableNextFrame, isFocusDropped } from "@/lib/focus-return"

export const CERTIFICATE_NOTE_MAX = 300

type Props = {
  memberId: string
  memberName: string
  organizationName: string
  /** Every counted registration, unfiltered: the period is applied on the client, without a round trip. */
  entries: HourEntry[]
  defaultPeriod: { from: string; to: string }
  generatedAt: string
}

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

/**
 * The form (period, free text, planned-hours checkbox) and the certificate itself, on one page
 * (#556): the form and the on-screen warning are screen-only (`print:hidden`); the certificate
 * prints as shown. Changing the period or the checkbox only recomputes the preview — pure client
 * state, no server round trip — so generation is logged once, on an explicit click, not on every
 * keystroke or re-render.
 */
export default function CertificateView({ memberId, memberName, organizationName, entries, defaultPeriod, generatedAt }: Props) {
  const id = useId()
  const [from, setFrom] = useState(defaultPeriod.from)
  const [to, setTo] = useState(defaultPeriod.to)
  const [note, setNote] = useState("")
  const [includePlanned, setIncludePlanned] = useState(false)
  const [status, setStatus] = useState("")
  const [periodStatus, setPeriodStatus] = useState("")
  const [logging, setLogging] = useState(false)
  // A ref, not just the `logging` state: two clicks fired before React re-renders both close
  // over the same stale `logging === false` (aria-disabled doesn't block activation either), so
  // only a synchronously-updated ref actually stops the second one.
  const loggingRef = useRef(false)
  const generateButtonRef = useRef<HTMLButtonElement>(null)

  const validRange = from <= to
  const period = useMemo(() => (validRange ? { from, to } : { from: to, to: from }), [from, to, validRange])
  const filtered = useMemo(() => entries.filter((e) => withinPeriod(e.localDate, period)), [entries, period])
  const summaries = useMemo(() => eventHourSummaries(filtered), [filtered])
  const unattested = useMemo(() => filtered.filter((e) => !e.attested), [filtered])

  const totalAttested = summaries.reduce((n, s) => n + s.attestedMinutes, 0)
  const totalPlanned = summaries.reduce((n, s) => n + s.plannedWithoutPresenceMinutes, 0)
  const totalShifts = summaries.reduce((n, s) => n + s.shiftsCount, 0)

  // Announced after the period or the planned-hours checkbox changes, never on first render
  // (the document itself already shows these figures; this is only for screen-reader users who
  // don't re-read the whole preview after every change).
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    const shiftsLabel = totalShifts > 1 ? `${totalShifts} créneaux confirmés` : `${totalShifts} créneau confirmé`
    const attestedLabel = `${fmtDuration(totalAttested)} ${totalAttested === 60 ? "attestée" : "attestées"}`
    announce(setPeriodStatus, `${shiftsLabel}, ${attestedLabel}, du ${fmtDay(period.from)} au ${fmtDay(period.to)}.`)
  }, [period.from, period.to, includePlanned, totalShifts, totalAttested])

  // After the print dialog closes, focus can land nowhere (most browsers) or on <body>/<main>
  // (#554 convention, isFocusDropped): bring it back to the button that opened it.
  useEffect(() => {
    const onAfterPrint = () => {
      if (isFocusDropped(document.activeElement)) focusFirstAvailableNextFrame([generateButtonRef.current])
    }
    window.addEventListener("afterprint", onAfterPrint)
    return () => window.removeEventListener("afterprint", onAfterPrint)
  }, [])

  async function handleGenerate() {
    if (loggingRef.current) return
    loggingRef.current = true
    setLogging(true)
    try {
      await fetch(`/api/admin/members/${memberId}/certificate`, { method: "POST" })
    } catch {
      // The print still works even if the log write failed; logOrgEvent itself never throws server-side,
      // only a network error here could reach this catch.
    } finally {
      loggingRef.current = false
      setLogging(false)
      announce(setStatus, "Attestation générée.")
      if (typeof window !== "undefined") window.print()
    }
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby={`${id}-settings`} className="print:hidden bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <h2 id={`${id}-settings`} className="text-base font-semibold text-gray-900">Réglages de l&apos;attestation</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-from`} className="block text-sm font-medium text-gray-800 mb-1">Du</label>
            <input
              id={`${id}-from`}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-invalid={!validRange}
              aria-describedby={!validRange ? `${id}-period-error` : undefined}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            />
          </div>
          <div>
            <label htmlFor={`${id}-to`} className="block text-sm font-medium text-gray-800 mb-1">Au</label>
            <input
              id={`${id}-to`}
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-invalid={!validRange}
              aria-describedby={!validRange ? `${id}-period-error` : undefined}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            />
          </div>
        </div>
        {!validRange && (
          <p id={`${id}-period-error`} role="alert" className="text-sm text-red-700">
            La date de fin précède la date de début : les dates ont été inversées pour l&apos;aperçu.
          </p>
        )}

        <div>
          <label htmlFor={`${id}-note`} className="block text-sm font-medium text-gray-800 mb-1">Texte libre (facultatif)</label>
          <textarea
            id={`${id}-note`}
            rows={3}
            value={note}
            maxLength={CERTIFICATE_NOTE_MAX}
            aria-describedby={`${id}-note-hint`}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          />
          <p id={`${id}-note-hint`} className="text-xs text-gray-600 mt-1">Par exemple le rôle tenu par la personne. {note.length}/{CERTIFICATE_NOTE_MAX} caractères.</p>
        </div>

        <div className="flex items-start gap-2">
          <input
            id={`${id}-planned`}
            type="checkbox"
            checked={includePlanned}
            onChange={(e) => setIncludePlanned(e.target.checked)}
            aria-describedby={`${id}-planned-hint`}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <div>
            <label htmlFor={`${id}-planned`} className="text-sm font-medium text-gray-800">Inclure les heures planifiées sans présence saisie</label>
            <p id={`${id}-planned-hint`} className="text-xs text-gray-600 mt-0.5">Décoché par défaut : seules les heures attestées par une présence enregistrée valent comme preuve. Si coché, les créneaux confirmés sans présence apparaissent en plus, clairement distingués.</p>
          </div>
        </div>

        {unattested.length > 0 && (
          <div role="status" className="border border-amber-300 bg-amber-50 rounded-xl p-3">
            <p className="text-sm font-medium text-amber-900">
              {unattested.length === 1 ? "1 créneau confirmé sur cette période n'a pas de présence enregistrée :" : `${unattested.length} créneaux confirmés sur cette période n'ont pas de présence enregistrée :`}
            </p>
            {/* list-disc keeps the browser's default list markers, so the implicit "list" role isn't stripped (Tailwind's preflight only removes it when list-style is none): no role="list" needed. */}
            <ul className="text-sm text-amber-900 mt-1 space-y-0.5 list-disc list-inside">
              {unattested.map((e) => (
                <li key={e.registrationId}>{e.eventTitle} : {e.roleName}{e.label && e.label !== e.roleName ? ` (${e.label})` : ""}, {fmtDay(e.localDate)}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          ref={generateButtonRef}
          type="button"
          onClick={handleGenerate}
          aria-disabled={logging}
          className={`bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${logging ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Générer et imprimer l&apos;attestation
        </button>
        <p role="status" className="sr-only">{status}</p>
        <p role="status" className="sr-only">{periodStatus}</p>
      </section>

      <article aria-labelledby={`${id}-title`} className="certificate bg-white border border-gray-200 rounded-xl p-6 print:border-0 print:rounded-none print:p-0">
        <style>{`
          @media print {
            @page { size: A4 portrait; margin: 1.6cm; }
            .certificate table { page-break-inside: auto; break-inside: auto; }
            .certificate tr { page-break-inside: avoid; break-inside: avoid; }
            .certificate thead { display: table-header-group; }
          }
        `}</style>
        <h1 id={`${id}-title`} className="text-2xl font-bold text-gray-900">Attestation de bénévolat</h1>
        <p className="text-sm text-gray-800 mt-2">{organizationName}</p>
        <p className="text-sm text-gray-800">Bénévole : <strong>{memberName}</strong></p>
        <p className="text-sm text-gray-800">Période : du {fmtDay(period.from)} au {fmtDay(period.to)}.</p>

        {summaries.length === 0 ? (
          <p className="text-sm text-gray-800 mt-4">Aucun créneau confirmé sur cette période.</p>
        ) : (
          <table className="w-full text-sm border-collapse mt-4">
            <caption className="text-left text-sm font-semibold text-gray-900 mb-2">Détail par événement, du {fmtDay(period.from)} au {fmtDay(period.to)}</caption>
            <thead>
              <tr className="border-b-2 border-gray-400">
                <th scope="col" className="text-left py-1 pr-2">Événement</th>
                <th scope="col" className="text-left py-1 pr-2">Postes</th>
                <th scope="col" className="text-right py-1 pr-2">Créneaux</th>
                <th scope="col" className="text-right py-1 pr-2">Heures attestées</th>
                {includePlanned && <th scope="col" className="text-right py-1">Heures planifiées (sans présence)</th>}
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.eventId} className="border-b border-gray-200 align-top">
                  <td className="py-1 pr-2">{s.eventTitle}</td>
                  <td className="py-1 pr-2">{s.roles.join(", ")}</td>
                  <td className="py-1 pr-2 text-right">{s.shiftsCount}</td>
                  <td className="py-1 pr-2 text-right">
                    {s.noCheckIn ? "présences non saisies pour cet événement" : fmtDuration(s.attestedMinutes)}
                  </td>
                  {includePlanned && <td className="py-1 text-right">{fmtDuration(s.plannedWithoutPresenceMinutes)}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-400 font-semibold">
                <th scope="row" className="py-1 pr-2 text-left font-semibold" colSpan={2}>Total</th>
                <td className="py-1 pr-2 text-right">{totalShifts}</td>
                <td className="py-1 pr-2 text-right">{fmtDuration(totalAttested)}</td>
                {includePlanned && <td className="py-1 text-right">{fmtDuration(totalPlanned)}</td>}
              </tr>
            </tfoot>
          </table>
        )}

        {note.trim() && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold text-gray-900">Remarque</h2>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{note}</p>
          </div>
        )}

        <p className="text-xs text-gray-700 mt-6">Document généré le {generatedAt}.</p>

        <div className="grid gap-6 sm:grid-cols-2 mt-8">
          <div>
            <p className="border-t border-gray-400 pt-1 text-sm text-gray-800 mt-10">Signature</p>
          </div>
          <div>
            <p className="border-t border-gray-400 pt-1 text-sm text-gray-800 mt-10">Nom du signataire</p>
          </div>
        </div>
      </article>
    </div>
  )
}
