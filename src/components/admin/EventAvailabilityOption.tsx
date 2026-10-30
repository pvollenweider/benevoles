"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react"
import { flushSync } from "react-dom"
import Link from "next/link"
import { announce } from "@/lib/announce"
import Switch from "@/components/public/Switch"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { AVAILABILITY_OPTION_HINT, AVAILABILITY_OPTION_LABEL, deadlineInputIsPast, organiserDeadlineSentence, zoneLabel } from "@/lib/event-availability-text"

type OptionState = { enabled: boolean; deadline: string | null; deadlineInput: string; timeZone: string; open: boolean }

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * « Disponibilités datées » (#1146, beta), on the event's information page, like the swaps card: a
 * switch saved by its own route, which flips only once the server agreed, and the deadline with
 * its own buttons. Turning collection off while links are live asks first (409 with the count).
 * Accessibility review (2026-10-29): labelled deadline field with its zone, error on the field,
 * « Sans date limite » kept on screen (aria-disabled), statuses in regions always mounted.
 */
export default function EventAvailabilityOption({ eventId, initial }: { eventId: string; initial: OptionState }) {
  const [state, setState] = useState(initial)
  const [deadline, setDeadline] = useState(initial.deadlineInput)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [deadlineError, setDeadlineError] = useState("")
  const [confirmOff, setConfirmOff] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  // A deadline already past closes the collection as soon as it is saved: asked first.
  const [confirmPast, setConfirmPast] = useState(false)
  const saveRef = useRef<HTMLButtonElement>(null)
  const switchRef = useRef<HTMLButtonElement>(null)
  const deadlineRef = useRef<HTMLInputElement>(null)

  async function put(body: { enabled?: boolean; deadline?: string | null; confirm?: boolean }) {
    const res = await fetch(`/api/admin/events/${eventId}/availability/mode`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    return { res, data: await res.json().catch(() => ({})) }
  }

  async function toggle() {
    if (saving) return
    setSaving(true); setStatus(""); setError("")
    try {
      const { res, data } = await put({ enabled: !state.enabled })
      setSaving(false)
      if (res.ok) {
        setState(data); setDeadline(data.deadlineInput ?? "")
        announce(setStatus, data.enabled ? "Collecte des disponibilités activée. Demandez-les depuis la page Disponibilités." : "Collecte des disponibilités désactivée.")
        return
      }
      if (res.status === 409 && typeof data.liveLinks === "number") { setConfirmError(null); setConfirmOff(typeof data.error === "string" && data.error ? data.error : "Les liens déjà envoyés cesseront de fonctionner. Les réponses déjà données sont gardées."); return }
      announce(setError, typeof data.error === "string" ? data.error : "Le paramètre n'a pas pu être enregistré. Réessayez.")
    } catch {
      setSaving(false)
      announce(setError, "Le paramètre n'a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.")
    }
  }

  async function confirmSwitchOff() {
    setSaving(true); setConfirmError(null)
    try {
      const { res, data } = await put({ enabled: false, confirm: true })
      setSaving(false)
      if (!res.ok) { setConfirmError(typeof data.error === "string" ? data.error : "Le paramètre n'a pas pu être enregistré. Réessayez."); return }
      setState(data)
      setConfirmOff(null)
      switchRef.current?.focus()
      announce(setStatus, "Collecte arrêtée : les liens envoyés ne fonctionnent plus, les réponses sont gardées.")
    } catch {
      setSaving(false)
      setConfirmError("La connexion a échoué : rien n'a été fait. Réessayez.")
    }
  }

  async function saveDeadline(value: string | null, pastConfirmed = false) {
    if (saving) return
    if (value !== null && !value) { flushSync(() => setDeadlineError("Indiquez une date et une heure, ou choisissez « Sans date limite ».")); deadlineRef.current?.focus(); return }
    if (value !== null && !pastConfirmed && deadlineInputIsPast(value, state.timeZone)) { setDeadlineError(""); setConfirmPast(true); return }
    setConfirmPast(false)
    setSaving(true); setStatus(""); setDeadlineError("")
    try {
      const { res, data } = await put({ deadline: value })
      setSaving(false)
      if (!res.ok) {
        flushSync(() => setDeadlineError(typeof data.error === "string" ? data.error : "La date limite n'a pas pu être enregistrée. Réessayez."))
        deadlineRef.current?.focus()
        return
      }
      setState(data); setDeadline(data.deadlineInput ?? "")
      announce(setStatus, data.deadline ? (data.open ? "Date limite enregistrée." : "Date limite enregistrée : elle est déjà passée, les personnes ne peuvent plus répondre.") : "Pas de date limite : les personnes peuvent répondre tant que la collecte est active.")
    } catch {
      setSaving(false)
      flushSync(() => setDeadlineError("La connexion a échoué : rien n'a été enregistré. Réessayez."))
      deadlineRef.current?.focus()
    }
  }

  const noDeadline = !state.deadline
  return (
    <section aria-labelledby="event-availability-title" className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3" data-event-availability="1">
      <h2 id="event-availability-title" className="text-base font-semibold text-gray-900">
        Disponibilités datées <span className="ml-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">bêta</span>
      </h2>
      <Switch checked={state.enabled} onToggle={() => void toggle()} busy={saving} buttonRef={switchRef} describedBy={error ? "event-availability-hint event-availability-error" : "event-availability-hint"} data-availability-switch="1">
        {AVAILABILITY_OPTION_LABEL}
      </Switch>
      <p id="event-availability-hint" className="text-sm text-gray-600">{AVAILABILITY_OPTION_HINT}</p>
      {state.enabled && (
        <div className="space-y-2">
          <form noValidate className="space-y-2" onSubmit={(e) => { e.preventDefault(); void saveDeadline(deadline) }}>
          <div>
            <label htmlFor="event-availability-deadline" className="block text-sm font-medium text-gray-900">Date limite des réponses (facultatif)</label>
            <p id="event-availability-deadline-hint" className="text-sm text-gray-600">En {zoneLabel(state.timeZone)}. {organiserDeadlineSentence(state.deadline, state.open, state.timeZone)}</p>
            <input
              ref={deadlineRef}
              id="event-availability-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              aria-invalid={deadlineError ? true : undefined}
              aria-describedby={deadlineError ? "event-availability-deadline-hint event-availability-deadline-error" : "event-availability-deadline-hint"}
              className="input mt-1 w-full sm:w-64"
            />
            {deadlineError && <p id="event-availability-deadline-error" className="mt-1 text-sm text-red-800">{deadlineError}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button ref={saveRef} type="submit" aria-disabled={saving || undefined} className={`min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:cursor-wait ${focusRing}`}>
              Enregistrer la date limite
            </button>
            <button
              type="button"
              onClick={() => { if (!noDeadline) void saveDeadline(null) }}
              aria-disabled={noDeadline || saving || undefined}
              aria-describedby={noDeadline ? "event-availability-no-deadline" : undefined}
              className={`min-h-11 rounded-xl border border-gray-500 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 aria-disabled:opacity-60 aria-disabled:cursor-not-allowed ${focusRing}`}
            >
              Sans date limite
            </button>
          </div>
          {noDeadline && <p id="event-availability-no-deadline" className="text-sm text-gray-600">Aucune date limite n&apos;est fixée.</p>}
          </form>
          <p className="text-sm">
            <Link href={`/admin/events/${eventId}/availability`} className={`font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`}>Voir les réponses et demander les disponibilités</Link>
          </p>
        </div>
      )}
      <p role="status" className={status ? "text-sm text-green-800" : "sr-only"}>{status}</p>
      <p id="event-availability-error" role="alert" className={error ? "text-sm text-red-700" : "sr-only"}>{error}</p>
      {confirmPast && (
        <ConfirmActionModal
          recap={{
            title: "Enregistrer une date limite déjà passée ?",
            lead: "Cette date limite est déjà passée : dès l'enregistrement, les personnes ne pourront plus répondre ni changer leurs réponses depuis leur lien.",
            lines: ["Vous pourrez toujours corriger leurs réponses vous-même, ou choisir plus tard une nouvelle date limite pour rouvrir la collecte."],
            confirmLabel: "Enregistrer quand même",
            cancelLabel: "Changer la date",
            danger: false,
          }}
          busy={saving}
          error={null}
          onConfirm={() => void saveDeadline(deadline, true)}
          onCancel={() => { setConfirmPast(false); requestAnimationFrame(() => deadlineRef.current?.focus()) }}
        />
      )}
      {confirmOff !== null && (
        <ConfirmActionModal
          recap={{
            title: "Arrêter de recueillir les disponibilités ?",
            lead: confirmOff,
            lines: ["Si vous réactivez la collecte plus tard, vous retrouverez ces réponses, mais il faudra envoyer de nouveaux liens.", "L'action est journalisée : vous la retrouverez dans le journal de l'événement."],
            confirmLabel: "Arrêter et désactiver les liens",
            cancelLabel: "Continuer à recueillir",
            danger: true,
          }}
          busy={saving}
          error={confirmError}
          onConfirm={() => void confirmSwitchOff()}
          onCancel={() => setConfirmOff(null)}
        />
      )}
    </section>
  )
}
