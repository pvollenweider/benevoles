"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { dayOffset, DEFAULT_COPY, duplicateSummary, type CopyChoices, type DuplicateCounts } from "@/lib/event-duplicate"

type Props = {
  eventId: string
  sourceTitle: string
  /** "YYYY-MM-DD" */
  sourceStart: string
  counts: DuplicateCounts
}

const CHOICES: { key: keyof CopyChoices; label: string; hint: (c: DuplicateCounts) => string }[] = [
  { key: "shifts", label: "Les créneaux", hint: (c) => `${c.shifts} créneau${c.shifts > 1 ? "x" : ""}, avec leurs postes, horaires, places, listes d'attente et infos pratiques. Rouverts, sans inscriptions.` },
  { key: "settings", label: "Les messages et réglages d'inscription", hint: () => "Instructions publiques, message de confirmation, rappels, téléphone obligatoire, contact le jour J, programme des spectacles." },
  { key: "pages", label: "Les pages personnalisées", hint: (c) => (c.pages ? `${c.pages} page${c.pages > 1 ? "s" : ""}.` : "Aucune page sur l'événement d'origine.") },
  { key: "leaders", label: "Les responsables de secteur", hint: (c) => (c.leaders ? `${c.leaders} responsable${c.leaders > 1 ? "s" : ""} : chacun reçoit tout de suite un email avec son lien pour la copie.` : "Aucun responsable sur l'événement d'origine.") },
]

/** Duplication with explicit choices (#378): title, new start date, what follows, a summary, then the copy. */
export default function DuplicateEventForm({ eventId, sourceTitle, sourceStart, counts }: Props) {
  const id = useId()
  const router = useRouter()
  const [title, setTitle] = useState(`${sourceTitle} (copie)`)
  const [startDate, setStartDate] = useState(sourceStart)
  const [copy, setCopy] = useState<CopyChoices>(DEFAULT_COPY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One sentence for screen readers, set only on a checkbox change or when the date field is
  // left: the visible list below changes on every keystroke, too chatty to be live itself.
  const [announce, setAnnounce] = useState("")
  const titleRef = useRef<HTMLInputElement>(null)
  const startRef = useRef<HTMLInputElement>(null)

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(startDate)
  const offsetDays = validDate ? dayOffset(new Date(`${sourceStart}T00:00:00Z`), startDate) : 0
  const summary = duplicateSummary(counts, copy, offsetDays).filter((l) => validDate || !l.startsWith("Mêmes dates"))
  const titleBad = title.trim().length === 0
  const announceSummary = (c: CopyChoices, days: number) => setAnnounce(`Résumé mis à jour : ${duplicateSummary(counts, c, days).slice(0, 2).join(" ")}`)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (titleBad) { titleRef.current?.focus(); return }
    if (!validDate) { startRef.current?.focus(); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), startDate, copy }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "La copie n'a pas pu être créée. Réessayez.")
        return
      }
      const created: { id: string } = await res.json()
      setAnnounce("Copie créée, ouverture de l'événement.")
      router.push(`/admin/events/${created.id}`)
      router.refresh()
    } catch {
      setError("Connexion impossible. Vérifiez votre réseau et réessayez.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div className="space-y-4 bg-white border border-gray-200 rounded-xl p-5">
        <div>
          <label htmlFor={`${id}-title`} className="block text-sm font-medium text-gray-700 mb-1">Titre de la copie</label>
          <input
            id={`${id}-title`}
            ref={titleRef}
            type="text"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={titleBad || undefined}
            aria-describedby={titleBad ? `${id}-title-error` : undefined}
            className="input"
          />
          {titleBad && <p id={`${id}-title-error`} className="text-sm text-red-700 mt-1">Indiquez un titre.</p>}
        </div>
        <div>
          <label htmlFor={`${id}-start`} className="block text-sm font-medium text-gray-700 mb-1">Premier jour de la copie</label>
          <input
            id={`${id}-start`}
            ref={startRef}
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            onBlur={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && announceSummary(copy, dayOffset(new Date(`${sourceStart}T00:00:00Z`), e.target.value))}
            aria-invalid={!validDate || undefined}
            aria-describedby={`${id}-start-hint${validDate ? "" : ` ${id}-start-error`}`}
            className="input"
          />
          <p id={`${id}-start-hint`} className="text-xs text-gray-600 mt-1">
            Toutes les dates (fin, créneaux, spectacles) sont décalées d&apos;autant de jours. L&apos;original commence le {new Date(`${sourceStart}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })}.
          </p>
          {!validDate && <p id={`${id}-start-error`} className="text-sm text-red-700 mt-1">Indiquez une date.</p>}
        </div>
      </div>

      <fieldset className="space-y-3 bg-white border border-gray-200 rounded-xl p-5">
        <legend className="text-sm font-semibold text-gray-900 px-1">Ce qui est copié</legend>
        {CHOICES.map((c) => (
          <div key={c.key} className="flex items-start gap-3">
            <input
              id={`${id}-${c.key}`}
              type="checkbox"
              checked={copy[c.key]}
              onChange={(e) => {
                const next = { ...copy, [c.key]: e.target.checked }
                setCopy(next)
                announceSummary(next, offsetDays)
              }}
              aria-describedby={`${id}-${c.key}-hint`}
              className="mt-0.5 h-4 w-4"
            />
            <div>
              <label htmlFor={`${id}-${c.key}`} className="text-sm font-medium text-gray-800">{c.label}</label>
              <p id={`${id}-${c.key}-hint`} className="text-xs text-gray-600">{c.hint(counts)}</p>
            </div>
          </div>
        ))}
      </fieldset>

      <section aria-labelledby={`${id}-summary-title`} className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h2 id={`${id}-summary-title`} className="text-sm font-semibold text-gray-900">Ce que vous allez créer</h2>
        <ul className="mt-2 text-sm text-gray-800 space-y-1 list-disc pl-5">
          {summary.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          aria-disabled={submitting || titleBad || !validDate}
          aria-busy={submitting || undefined}
          className={`bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${submitting || titleBad || !validDate ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {submitting ? "Création…" : "Créer la copie"}
        </button>
        <span className="text-sm text-gray-600">La copie s&apos;ouvre ensuite, en brouillon.</span>
      </div>
    </form>
  )
}
