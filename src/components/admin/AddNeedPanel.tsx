"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Ajouter un besoin » on « Jour J » (#1304): the need in one short form, then « Prévenir » with
 * the existing « Chercher des bénévoles » list for the shift just created. Two separate actions:
 * the shift exists before anything is sent, so a failed or retried send never creates another one.
 */

import { useId, useRef, useState } from "react"
import Link from "next/link"
import { toMin } from "@/lib/gantt-utils"
import { isValidClock } from "@/lib/shift-time"
import { normalizeTime } from "@/lib/shifts-admin"
import { fmtHour } from "@/lib/registrations-list"
import { defaultNeedWindow, notificationBlockedText, NEED_CAPACITY_DEFAULT } from "@/lib/day-of-need"
import { shiftName, type DayOfShift } from "@/lib/day-of"
import { registrationState, type RegistrationWindow } from "@/lib/registration-window"
import type { OpenShift } from "@/lib/open-shifts"
import OpenShiftsFinder from "./OpenShiftsFinder"

type CreatedShift = {
  id: string
  roleName: string
  label: string
  startTime: string
  endTime: string
  capacity: number
  assignedOnly?: boolean
  sectorId: string | null
}

type Context = {
  shift: OpenShift
  shifts: OpenShift[]
  eventShifts: {
    id: string; roleName: string; label: string; date: string | Date
    startTime: string; endTime: string; overlapAllowed?: boolean
  }[]
  members: {
    id: string; firstName: string; lastName: string; hasEmail: boolean; active: boolean; tags: string[]
    availabilityPeriods?: string[] | null; availabilityNote?: string | null; birthDate?: string | null
  }[]
  registrations: { volunteerId: string; shiftId: string; status: string }[]
  invites: { volunteerId: string; declined: boolean }[]
  declines: { volunteerId: string; shiftId: string; declinedAt: string }[]
  tags: string[]
}

type Props = {
  eventId: string
  /** "YYYY-MM-DD" in the organisation's zone. */
  today: string
  timeZone: string
  event: RegistrationWindow
  /** The event's existing postes, offered in the field. */
  roles: string[]
  /** A new need on the board: inserted at once, announced, and the visible notice returned. */
  onCreated: (shift: DayOfShift, sectorId: string | null) => string
}

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

const fieldClass = "input w-full min-h-11"

const people = (n: number) => `${n} personne${n > 1 ? "s" : ""}`

export default function AddNeedPanel({ eventId, today, timeZone, event, roles, onCreated }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"need" | "notify">("need")
  const [roleName, setRoleName] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [capacity, setCapacity] = useState(String(NEED_CAPACITY_DEFAULT))
  const [locationDetails, setLocationDetails] = useState("")
  const [day, setDay] = useState(today)
  const [saving, setSaving] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedShift | null>(null)
  const [context, setContext] = useState<Context | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [sent, setSent] = useState<{ sent: number; pushRequested?: boolean; pushDevices?: number } | null>(null)
  const [createdNotice, setCreatedNotice] = useState("")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const roleRef = useRef<HTMLInputElement>(null)
  const startRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLInputElement>(null)
  const capacityRef = useRef<HTMLInputElement>(null)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)

  const blocked = notificationBlockedText(registrationState(event, new Date()), timeZone)
  const problems = {
    roleName: !roleName.trim(),
    startTime: !isValidClock(startTime),
    endTime: !isValidClock(endTime),
    sameTime: isValidClock(startTime) && isValidClock(endTime) && startTime === endTime,
    capacity: !(Number.isInteger(Number(capacity)) && Number(capacity) >= 1),
  }
  const invalid = {
    roleName: attempted && problems.roleName,
    startTime: attempted && problems.startTime,
    endTime: attempted && problems.endTime,
    sameTime: attempted && problems.sameTime,
    capacity: attempted && problems.capacity,
  }
  const invalidFields = Object.values(problems).some(Boolean)

  function openForm() {
    const next = defaultNeedWindow(new Date(), timeZone)
    setOpen(true)
    setStep("need")
    setRoleName("")
    setStartTime(next.startTime)
    setEndTime(next.endTime)
    setCapacity(String(NEED_CAPACITY_DEFAULT))
    setLocationDetails("")
    setDay(next.date)
    setAttempted(false)
    setError(null)
    setCreated(null)
    setContext(null)
    setContextError(null)
    setSent(null)
    setCreatedNotice("")
    setAnnouncement("Ajouter un besoin. Étape 1 sur 2 : le besoin.")
    requestAnimationFrame(() => roleRef.current?.focus())
  }

  function close() {
    setOpen(false)
    setAnnouncement("Ajout d'un besoin fermé.")
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  async function loadContext(shiftId: string) {
    setLoadingContext(true)
    setContextError(null)
    try {
      const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/open-shifts?shift=${encodeURIComponent(shiftId)}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setContextError(typeof data?.error === "string" ? data.error : "La liste des bénévoles n'a pas pu être chargée.")
        return
      }
      setContext(data as Context)
    } catch {
      setContextError("La liste des bénévoles n'a pas pu être chargée. Vérifiez votre connexion, puis réessayez.")
    } finally {
      setLoadingContext(false)
    }
  }

  async function createNeed() {
    if (saving) return
    if (invalidFields) {
      setAttempted(true)
      setError(null)
      requestAnimationFrame(() => {
        if (!roleName.trim()) roleRef.current?.focus()
        else if (!isValidClock(startTime)) startRef.current?.focus()
        else if (!isValidClock(endTime) || startTime === endTime) endRef.current?.focus()
        else capacityRef.current?.focus()
      })
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          roleName: roleName.trim(),
          label: roleName.trim(),
          date: day,
          startTime,
          endTime,
          capacity: Number(capacity),
          waitlistEnabled: false,
          ...(locationDetails.trim() ? { locationDetails: locationDetails.trim() } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Le créneau n'a pas pu être ajouté.")
        return
      }
      const shift: CreatedShift = {
        id: data.id,
        roleName: data.roleName,
        label: data.label,
        startTime: data.startTime,
        endTime: data.endTime,
        capacity: data.capacity,
        assignedOnly: !!data.assignedOnly,
        sectorId: typeof data.sectorId === "string" ? data.sectorId : null,
      }
      const dayShift: DayOfShift = {
        id: shift.id,
        roleName: shift.roleName,
        label: shift.label,
        date: day,
        startTime: shift.startTime,
        endTime: shift.endTime,
        capacity: shift.capacity,
        contactName: null,
        contactPhone: null,
        people: [],
      }
      setCreated(shift)
      setStep("notify")
      setAnnouncement("Étape 1 terminée : le créneau est ajouté. Étape 2 sur 2 : prévenir les bénévoles.")
      setCreatedNotice(onCreated(dayShift, shift.sectorId))
      requestAnimationFrame(() => stepHeadingRef.current?.focus())
      if (!shift.assignedOnly && registrationState(event, new Date()).open) await loadContext(shift.id)
    } catch {
      setError("Le créneau n'a pas pu être ajouté. Vérifiez votre connexion et réessayez : rien n'a été créé.")
    } finally {
      setSaving(false)
    }
  }

  const shiftLine = created
    ? `${shiftName(created)}, de ${fmtHour(created.startTime)} à ${fmtHour(created.endTime)}${toMin(created.endTime) <= toMin(created.startTime) ? " le lendemain" : ""}`
    : ""

  return (
    <section aria-labelledby={`${id}-title`} className="bg-white rounded-2xl border border-blue-200 p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id={`${id}-title`} className="text-base font-semibold text-gray-900">Ajouter un besoin</h2>
          <p className="text-sm text-gray-700">Un créneau de plus, tout de suite, puis les bénévoles à prévenir.</p>
        </div>
        {!open && (
          <button
            ref={triggerRef}
            type="button"
            onClick={openForm}
            className="min-h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Ajouter un besoin
          </button>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

      {open && step === "need" && (
        <div role="group" aria-labelledby={`${id}-need`} className="space-y-4 border-t border-gray-200 pt-4">
          <h3 id={`${id}-need`} className="text-sm font-semibold text-gray-900">Étape 1 sur 2 : le besoin</h3>
          <div>
            <label htmlFor={`${id}-role`} className="block text-sm font-medium text-gray-700 mb-1">Poste <span aria-hidden="true">*</span></label>
            <input
              ref={roleRef}
              id={`${id}-role`}
              type="text"
              list={`${id}-roles`}
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              required
              aria-invalid={invalid.roleName || undefined}
              aria-describedby={invalid.roleName ? `${id}-role-error` : undefined}
              className={`${fieldClass} ${invalid.roleName ? "!border-red-600" : ""}`}
              placeholder="ex. Buvette"
            />
            <datalist id={`${id}-roles`}>
              {roles.map((r) => <option key={r} value={r} />)}
            </datalist>
            {invalid.roleName && <p id={`${id}-role-error`} className="text-xs text-red-700 mt-1">Indiquez le poste du besoin.</p>}
            <p className="text-xs text-gray-600 mt-1">Un poste existant garde ses réglages, son secteur et son ordre. Un nom nouveau crée un poste.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${id}-start`} className="block text-sm font-medium text-gray-700 mb-1">Début <span aria-hidden="true">*</span></label>
              <input
                ref={startRef}
                id={`${id}-start`}
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                onBlur={(e) => setStartTime(normalizeTime(e.target.value))}
                required
                aria-invalid={invalid.startTime || undefined}
                aria-describedby={invalid.startTime ? `${id}-start-error` : undefined}
                className={`${fieldClass} ${invalid.startTime ? "!border-red-600" : ""}`}
              />
              {invalid.startTime && <p id={`${id}-start-error`} className="text-xs text-red-700 mt-1">Indiquez l&apos;heure de début (HH:MM).</p>}
            </div>
            <div>
              <label htmlFor={`${id}-end`} className="block text-sm font-medium text-gray-700 mb-1">Fin <span aria-hidden="true">*</span></label>
              <input
                ref={endRef}
                id={`${id}-end`}
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                onBlur={(e) => setEndTime(normalizeTime(e.target.value))}
                required
                aria-invalid={invalid.endTime || invalid.sameTime || undefined}
                aria-describedby={invalid.endTime || invalid.sameTime ? `${id}-end-error` : undefined}
                className={`${fieldClass} ${invalid.endTime || invalid.sameTime ? "!border-red-600" : ""}`}
              />
              {(invalid.endTime || invalid.sameTime) && (
                <p id={`${id}-end-error`} className="text-xs text-red-700 mt-1">
                  {invalid.sameTime ? "La fin doit être différente du début." : "Indiquez l'heure de fin (HH:MM)."}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${id}-capacity`} className="block text-sm font-medium text-gray-700 mb-1">Places <span aria-hidden="true">*</span></label>
              <input
                ref={capacityRef}
                id={`${id}-capacity`}
                type="number"
                min="1"
                inputMode="numeric"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                required
                aria-invalid={invalid.capacity || undefined}
                aria-describedby={invalid.capacity ? `${id}-capacity-error` : undefined}
                className={`${fieldClass} ${invalid.capacity ? "!border-red-600" : ""}`}
              />
              {invalid.capacity && <p id={`${id}-capacity-error`} className="text-xs text-red-700 mt-1">Indiquez au moins une place.</p>}
            </div>
            <div>
              <label htmlFor={`${id}-place`} className="block text-sm font-medium text-gray-700 mb-1">Lieu de rendez-vous (facultatif)</label>
              <input
                id={`${id}-place`}
                type="text"
                value={locationDetails}
                onChange={(e) => setLocationDetails(e.target.value)}
                className={fieldClass}
                placeholder="ex. Buvette, entrée sud"
              />
            </div>
          </div>
          {error && <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={createNeed}
              aria-disabled={saving || undefined}
              className={`min-h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {saving ? "Ajout…" : "Ajouter le créneau"}
            </button>
            <button type="button" onClick={close} className="min-h-11 px-4 rounded-xl border border-gray-500 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              Annuler
            </button>
            <p className="text-sm text-gray-700">Le début est proposé à l&apos;heure actuelle, arrondie au quart d&apos;heure précédent.</p>
          </div>
        </div>
      )}

      {open && step === "notify" && created && (
        <div role="group" aria-labelledby={`${id}-notify`} className="space-y-4 border-t border-gray-200 pt-4">
          <div>
            <h3 id={`${id}-notify`} ref={stepHeadingRef} tabIndex={-1} className="text-sm font-semibold text-gray-900 focus:outline-none">Étape 2 sur 2 : prévenir</h3>
            <p className="text-sm text-gray-800 mt-1">
              <strong className="font-semibold">{shiftLine}</strong> ajouté, {created.capacity} place{created.capacity > 1 ? "s" : ""}.
            </p>
            {createdNotice && <p className="text-sm text-gray-800 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mt-1">{createdNotice}</p>}
            {sent && (
              <p className="text-sm text-gray-800 mt-1">
                {people(sent.sent)} prévenue{sent.sent > 1 ? "s" : ""} par email.
                {sent.pushRequested && ((sent.pushDevices ?? 0) > 0 ? ` Notification aussi sur ${sent.pushDevices} appareil${(sent.pushDevices ?? 0) > 1 ? "s" : ""}.` : " Aucun appareil abonné : pas de notification.")}
              </p>
            )}
          </div>

          {created.assignedOnly ? (
            <div role="note" className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
              <p className="text-sm text-gray-800">
                Ce poste est attribué par l&apos;organisation uniquement : il n&apos;est jamais proposé aux bénévoles par email.
              </p>
              <p className="text-sm">
                <Link href={`/admin/events/${eventId}/registrations?shift=${encodeURIComponent(created.id)}`} className={linkClass}>
                  Ajouter une personne à la main depuis les inscriptions
                </Link>
              </p>
            </div>
          ) : blocked ? (
            <div role="note" className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2 forced-colors:border-[CanvasText]">
              <p className="text-sm text-amber-950">{blocked}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <Link href={`/admin/events/${eventId}/edit`} className={linkClass}>Ouvrir les inscriptions</Link>
                <Link href={`/admin/events/${eventId}/registrations?shift=${encodeURIComponent(created.id)}`} className={linkClass}>
                  Ajouter une personne à la main depuis les inscriptions
                </Link>
              </div>
            </div>
          ) : loadingContext ? (
            <p role="status" className="text-sm text-gray-700">Préparation de la liste des bénévoles…</p>
          ) : contextError ? (
            <div className="space-y-2">
              <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{contextError}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <button type="button" onClick={() => { if (created) void loadContext(created.id) }} className={linkClass}>Réessayer</button>
                <Link href={`/admin/events/${eventId}/registrations?shift=${encodeURIComponent(created.id)}`} className={linkClass}>
                  Ajouter une personne à la main depuis les inscriptions
                </Link>
              </div>
            </div>
          ) : context ? (
            <OpenShiftsFinder
              eventId={eventId}
              shifts={context.shifts}
              eventShifts={context.eventShifts}
              members={context.members}
              registrations={context.registrations}
              invites={context.invites}
              declines={context.declines}
              tags={context.tags}
              initialShiftIds={[context.shift.id]}
              today={day}
              timeZone={timeZone}
              registeredTodayDefault
              pushDefaultOn
              lockedShift
              onSent={(result) => {
                setSent(result)
                setAnnouncement(`Étape 2 terminée : email envoyé à ${people(result.sent)}.${result.pushRequested && (result.pushDevices ?? 0) > 0 ? ` Notification sur ${result.pushDevices} appareil${(result.pushDevices ?? 0) > 1 ? "s" : ""}.` : ""}`)
              }}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={close} className="min-h-11 px-4 rounded-xl border border-gray-500 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              Terminer
            </button>
            <p className="text-sm text-gray-700">Le créneau reste sur le tableau, même sans envoi.</p>
          </div>
        </div>
      )}
    </section>
  )
}
