"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react"
import { flushSync } from "react-dom"
import { requestJson } from "@/lib/use-submit"
import { COLOR_OPTIONS } from "@/lib/roles"
import { parseTagList } from "@/lib/role-reservation"
import { ASSIGNED_ONLY_HELP } from "@/lib/role-assignment"
import type { RawShift } from "./types"

// The inline editors of one role in the « Gérer les postes » panel: its access, tags reserving it
// (#470) or assigned by the organisation only (#1145),
// shifts per volunteer (#466) and colour. Each sends its own PATCH; which editor is open, the typed
// values, the busy role and the panel's error stay in RoleManagerPanel, which renders them.

type SetShifts = React.Dispatch<React.SetStateAction<RawShift[]>>

/** Announced once a role's « Accès » is saved (#470, #1145). */
export function accessAnnouncement(role: string, assignedOnly: boolean, tags: string[], dropped = 0): string {
  if (assignedOnly) return `Poste « ${role} » : attribué par l'organisation uniquement.`
  if (tags.length === 0) return `Poste « ${role} » : ouvert à tous.`
  return `Poste « ${role} » : réservé aux membres avec l'étiquette ${tags.join(" ou ")}.`
    + (dropped > 0 ? ` ${dropped} étiquette${dropped > 1 ? "s" : ""} ignorée${dropped > 1 ? "s" : ""} (doublons, ou 10 au maximum).` : "")
}

export function RoleReserveForm({
  eventId, autoFocus = true, role, index, reservedTags, assignedOnly, value, onValueChange, assignedOnlyValue, onAssignedOnlyChange, busyRole, onBusyRoleChange, onActionError, onClose, setShifts, onAnnounce,
}: {
  eventId:          string
  /** Focus the first control on mount; false when the panel is reopened with this editor still open. */
  autoFocus?:       boolean
  role:             string
  /** Position of the role in the panel, for the ids. */
  index:            number
  reservedTags:     string[]
  /** The role's saved « Attribué par l'organisation uniquement » (#1145). */
  assignedOnly:     boolean
  value:            string
  onValueChange:    (value: string) => void
  /** The checkbox, kept by the panel while it is closed, like the typed tags. */
  assignedOnlyValue: boolean
  onAssignedOnlyChange: (value: boolean) => void
  /** The role an action is running on, if any: a save waits for it. */
  busyRole:         string | null
  onBusyRoleChange: (role: string | null) => void
  onActionError:    (error: string | null) => void
  /** Closes the form and returns the focus to its « Accès » button. */
  onClose:          (role: string) => void
  setShifts:        SetShifts
  onAnnounce:       (text: string) => void
}) {
  const i = index
  const isBusy = busyRole === role

  // Assigned by the organisation only (#1145) leaves the tags as they are: they apply again once
  // the option is removed. Otherwise the tags typed, [] opening the role to everyone.
  async function saveReserve(role: string, nextAssignedOnly: boolean, tags: string[]) {
    if (busyRole) return
    const tagsChanged = !nextAssignedOnly && tags.join("|") !== reservedTags.join("|")
    if (nextAssignedOnly === assignedOnly && (nextAssignedOnly || !tagsChanged)) {
      onClose(role)
      onAnnounce(`Poste « ${role} » : aucune modification.`)
      return
    }
    onActionError(null)
    onBusyRoleChange(role)
    const body = nextAssignedOnly ? { assignedOnly: true } : { assignedOnly: false, reservedTags: tags }
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(role)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), "Erreur lors de l'enregistrement.")
    onBusyRoleChange(null)
    if (!outcome.ok) {
      onActionError(outcome.error)
      return
    }
    setShifts(prev => prev.map(s => s.roleName === role ? { ...s, assignedOnly: nextAssignedOnly, ...(nextAssignedOnly ? {} : { reservedTags: tags }) } : s))
    onClose(role)
    const typed = value.split(/[,;]/).map((t) => t.trim()).filter(Boolean).length
    onAnnounce(accessAnnouncement(role, nextAssignedOnly, tags, nextAssignedOnly || tags.length === 0 ? 0 : Math.max(0, typed - tags.length)))
  }

  return (
    <form
      id={`reserve-form-${i}`}
      noValidate
      onSubmit={(e) => { e.preventDefault(); saveReserve(role, assignedOnlyValue, parseTagList(value)) }}
      // Escape waits for a running save, whose success closes the form and moves focus itself.
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); if (!isBusy) onClose(role) } }}
      className="flex flex-wrap items-end gap-2 px-3 py-2.5 mt-1 rounded-xl border border-blue-100 bg-blue-50/50"
    >
      <div className="basis-full min-h-6 flex items-center gap-2">
        <input
          id={`assigned-only-${i}`}
          type="checkbox"
          checked={assignedOnlyValue}
          autoFocus={autoFocus}
          onChange={(e) => onAssignedOnlyChange(e.target.checked)}
          aria-describedby={`assigned-only-help-${i}`}
          className="w-4 h-4 flex-shrink-0"
        />
        <label htmlFor={`assigned-only-${i}`} className="text-xs font-medium text-gray-700">Poste « {role} » attribué par l&apos;organisation uniquement</label>
      </div>
      <p id={`assigned-only-help-${i}`} className="basis-full text-xs text-gray-600">{ASSIGNED_ONLY_HELP} Les étiquettes ne s&apos;appliquent pas tant que cette case est cochée.</p>
      {/* The tags apply only to a role open to sign-up: unmounted, not just hidden, while the box is ticked. */}
      {!assignedOnlyValue && (
        <div className="flex-1 min-w-48">
          <label htmlFor={`reserve-${i}`} className="block text-xs font-medium text-gray-700 mb-1">Étiquettes donnant accès au poste « {role} »</label>
          <input
            id={`reserve-${i}`}
            type="text"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            aria-describedby={`reserve-help-${i}`}
            placeholder="ex. sécurité, secouriste"
            className="input w-full py-1"
          />
        </div>
      )}
      <button type="submit" aria-disabled={isBusy || undefined} className={`text-xs text-blue-700 font-medium hover:text-blue-900 py-1.5 ${isBusy ? "opacity-60 cursor-wait" : ""}`}>
        {isBusy ? "Enregistrement…" : "Enregistrer"}
      </button>
      {/* From the saved setting, never the draft: the button does not come and go under the hand. */}
      {(reservedTags.length > 0 || assignedOnly) && (
        <button type="button" onClick={() => saveReserve(role, false, [])} aria-disabled={isBusy || undefined} className={`text-xs text-gray-700 hover:text-gray-900 py-1.5 ${isBusy ? "opacity-60 cursor-wait" : ""}`}>
          Ouvrir à tous
        </button>
      )}
      <button type="button" onClick={() => onClose(role)} className="text-xs text-gray-600 hover:text-gray-900 py-1.5">Annuler</button>
      {!assignedOnlyValue && (
        <>
          <p id={`reserve-help-${i}`} className="basis-full text-xs text-gray-600">Séparées par des virgules, 10 au plus. Laissez vide pour ouvrir le poste à tous.</p>
          <p className="basis-full text-xs text-gray-600">
            Seuls les membres portant l&apos;une de ces étiquettes peuvent le prendre, et seulement avec le lien d&apos;invitation reçu par email : sans ce lien, la page d&apos;inscription affiche le poste comme « Réservé ». Les étiquettes ne sont jamais montrées aux bénévoles. Vous pouvez toujours ajouter quelqu&apos;un à la main.
          </p>
        </>
      )}
    </form>
  )
}

export function RoleLimitForm({
  eventId, autoFocus = true, role, index, limit, value, onValueChange, error, onErrorChange, busyRole, onBusyRoleChange, onActionError, onClose, setShifts, onAnnounce,
}: {
  eventId:          string
  /** Focus the input on mount; false when the panel is reopened with this editor still open. */
  autoFocus?:       boolean
  role:             string
  /** Position of the role in the panel, for the ids. */
  index:            number
  /** The role's current limit (null: none). */
  limit:            number | null
  value:            string
  onValueChange:    (value: string) => void
  error:            string | null
  onErrorChange:    (error: string | null) => void
  /** The role an action is running on, if any: a save waits for it. */
  busyRole:         string | null
  onBusyRoleChange: (role: string | null) => void
  onActionError:    (error: string | null) => void
  /** Closes the form and returns the focus to its « Limite » button. */
  onClose:          (role: string) => void
  setShifts:        SetShifts
  onAnnounce:       (text: string) => void
}) {
  const i = index
  const isBusy = busyRole === role
  const limitInputRef = useRef<HTMLInputElement>(null)
  // The input already had focus (Enter): focusing it again says nothing, so the error is an alert.
  // Otherwise focus moves to the input, which reads the error as its description (#554).
  const [errorLive, setErrorLive] = useState(false)

  async function saveRoleLimit(role: string, value: number | null) {
    if (busyRole) return
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 100)) {
      const live = document.activeElement !== null && document.activeElement === limitInputRef.current
      flushSync(() => onErrorChange(null))
      flushSync(() => {
        setErrorLive(live)
        onErrorChange("Entrez un nombre entier de 1 à 100, ou laissez vide pour ne pas limiter.")
      })
      if (!live) limitInputRef.current?.focus()
      return
    }
    onErrorChange(null)
    onActionError(null)
    onBusyRoleChange(role)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(role)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxPerVolunteer: value }),
    }), "Erreur lors de l'enregistrement de la limite.")
    onBusyRoleChange(null)
    if (!outcome.ok) {
      onActionError(outcome.error)
      return
    }
    setShifts(prev => prev.map(s => s.roleName === role ? { ...s, maxPerVolunteer: value } : s))
    onClose(role)
    onAnnounce(value === null ? `Poste « ${role} » : plus de limite par personne.` : `Poste « ${role} » : au plus ${value} créneau${value > 1 ? "x" : ""} par personne.`)
  }

  return (
    <form
      id={`limit-form-${i}`}
      noValidate
      onSubmit={(e) => { e.preventDefault(); saveRoleLimit(role, value.trim() === "" ? null : Number(value)) }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(role) } }}
      className="flex flex-wrap items-end gap-2 px-3 py-2.5 mt-1 rounded-xl border border-blue-100 bg-blue-50/50"
    >
      <div>
        <label htmlFor={`limit-${i}`} className="block text-xs font-medium text-gray-700 mb-1">Nombre maximal de créneaux « {role} » par personne</label>
        <input
          ref={limitInputRef}
          id={`limit-${i}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => { onValueChange(e.target.value); setErrorLive(false) }}
          aria-invalid={error ? true : undefined}
          aria-describedby={`limit-help-${i}${error ? ` limit-error-${i}` : ""}`}
          className="input w-24 py-1"
        />
      </div>
      <button type="submit" aria-disabled={isBusy || undefined} className={`text-xs text-blue-700 font-medium hover:text-blue-900 py-1.5 ${isBusy ? "opacity-60 cursor-wait" : ""}`}>
        {isBusy ? "Enregistrement…" : "Enregistrer"}
      </button>
      {limit !== null && (
        <button type="button" onClick={() => saveRoleLimit(role, null)} aria-disabled={isBusy || undefined} className={`text-xs text-gray-700 hover:text-gray-900 py-1.5 ${isBusy ? "opacity-60 cursor-wait" : ""}`}>
          Retirer la limite
        </button>
      )}
      <button type="button" onClick={() => onClose(role)} className="text-xs text-gray-600 hover:text-gray-900 py-1.5">Annuler</button>
      {error && <p id={`limit-error-${i}`} role={errorLive ? "alert" : undefined} className="basis-full text-xs text-red-700">{error}</p>}
      <p id={`limit-help-${i}`} className="basis-full text-xs text-gray-600">
        Laissez vide pour ne pas limiter. Comptent les inscriptions confirmées, proposées et en liste d&apos;attente d&apos;une même personne sur ce poste. Les inscriptions existantes au-delà de la limite sont conservées ; vous pouvez dépasser la limite en ajoutant quelqu&apos;un à la main.
      </p>
    </form>
  )
}

/** Announced once a role's « Cumul » option is saved (#986). */
export function overlapAnnouncement(role: string, overlapAllowed: boolean): string {
  return overlapAllowed
    ? `Poste « ${role} » : cumulable avec un autre créneau.`
    : `Poste « ${role} » : ne se cumule plus avec un autre créneau.`
}

export function RoleOverlapForm({
  eventId, autoFocus = true, role, index, overlapAllowed, value, onValueChange, busyRole, onBusyRoleChange, onActionError, onClose, setShifts, onAnnounce,
}: {
  eventId:          string
  /** Focus the checkbox on mount; false when the panel is reopened with this editor still open. */
  autoFocus?:       boolean
  role:             string
  /** Position of the role in the panel, for the ids. */
  index:            number
  /** The role's saved value. */
  overlapAllowed:   boolean
  /** The checkbox, kept by the panel while it is closed. */
  value:            boolean
  onValueChange:    (value: boolean) => void
  /** The role an action is running on, if any: a save waits for it. */
  busyRole:         string | null
  onBusyRoleChange: (role: string | null) => void
  onActionError:    (error: string | null) => void
  /** Closes the form and returns the focus to its « Cumul » button. */
  onClose:          (role: string) => void
  setShifts:        SetShifts
  onAnnounce:       (text: string) => void
}) {
  const i = index
  const isBusy = busyRole === role

  // « Enregistrer » keeps focus during the request (aria-disabled); a failure leaves the form open.
  async function saveOverlap(role: string, next: boolean) {
    if (busyRole) return
    if (next === overlapAllowed) {
      onClose(role)
      onAnnounce(`Poste « ${role} » : aucune modification.`)
      return
    }
    onActionError(null)
    onBusyRoleChange(role)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(role)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overlapAllowed: next }),
    }), "Erreur lors de l'enregistrement.")
    onBusyRoleChange(null)
    if (!outcome.ok) {
      onActionError(outcome.error)
      return
    }
    setShifts(prev => prev.map(s => s.roleName === role ? { ...s, overlapAllowed: next } : s))
    onClose(role)
    onAnnounce(overlapAnnouncement(role, next))
  }

  return (
    <form
      id={`overlap-form-${i}`}
      noValidate
      onSubmit={(e) => { e.preventDefault(); saveOverlap(role, value) }}
      // Escape waits for a running save, whose success closes the form and moves focus itself.
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); if (!isBusy) onClose(role) } }}
      className="flex flex-wrap items-center gap-2 px-3 py-2.5 mt-1 rounded-xl border border-blue-100 bg-blue-50/50"
    >
      <div className="flex-1 min-w-48 min-h-6 flex items-center gap-2">
        <input
          id={`overlap-${i}`}
          type="checkbox"
          checked={value}
          autoFocus={autoFocus}
          onChange={(e) => onValueChange(e.target.checked)}
          aria-describedby={`overlap-help-${i}`}
          className="w-4 h-4 flex-shrink-0"
        />
        <label htmlFor={`overlap-${i}`} className="text-xs font-medium text-gray-700">Poste « {role} » cumulable avec un autre créneau</label>
      </div>
      <button type="submit" aria-disabled={isBusy || undefined} className={`text-xs text-blue-700 font-medium hover:text-blue-900 py-1.5 ${isBusy ? "opacity-60 cursor-wait" : ""}`}>
        {isBusy ? "Enregistrement…" : "Enregistrer"}
      </button>
      <button type="button" onClick={() => onClose(role)} className="text-xs text-gray-600 hover:text-gray-900 py-1.5">Annuler</button>
      <p id={`overlap-help-${i}`} className="basis-full text-xs text-gray-600">
        Une personne inscrite à un créneau de ce poste peut prendre en même temps un autre créneau, de ce poste ou d&apos;un autre, par exemple assurer les premiers secours tout en tenant la buvette ; le temps passé sur deux créneaux à la fois ne compte qu&apos;une fois dans ses heures. Sans cette option, une personne ne peut pas s&apos;inscrire à deux créneaux qui se chevauchent. Si vous la retirez, les inscriptions déjà faites sont conservées ; vous pouvez toujours ajouter quelqu&apos;un à la main.
      </p>
    </form>
  )
}

export function RoleColorPicker({
  eventId, role, index, colorKey, busy, onClose, onBusyRoleChange, onActionError, setShifts, onAnnounce,
}: {
  eventId:          string
  role:             string
  /** Position of the role in the panel, for the id its colour button controls. */
  index:            number
  /** The role's current colour (null: automatic). */
  colorKey:         string | null
  /** An action is running on this role: a pick waits for it. */
  busy:             boolean
  /** Closes the picker and returns the focus to the role's colour button. */
  onClose:          (role: string) => void
  onBusyRoleChange: (role: string | null) => void
  onActionError:    (error: string | null) => void
  setShifts:        SetShifts
  onAnnounce:       (text: string) => void
}) {
  // The picker stays open during the request, with focus on the picked swatch (aria-disabled, not
  // disabled), and closes once it succeeds, so that focus can go back to the colour button (#554).
  async function setRoleColor(role: string, colorKey: string | null) {
    if (busy) return
    onActionError(null)
    onBusyRoleChange(role)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(role)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colorKey }),
    }), "Erreur lors du changement de couleur.")
    onBusyRoleChange(null)
    if (!outcome.ok) {
      onActionError(outcome.error)
      return
    }
    setShifts(prev => prev.map(s => s.roleName === role ? { ...s, colorKey } : s))
    onClose(role)
    const label = COLOR_OPTIONS.find(c => c.key === colorKey)?.label ?? "automatique"
    onAnnounce(`Couleur du poste « ${role} » : ${label}.`)
  }

  return (
    <div
      id={`color-picker-${index}`}
      role="group"
      aria-label={`Couleur du poste « ${role} »`}
      // Escape waits for a running request, whose success closes the picker and moves focus itself.
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); if (!busy) onClose(role) } }}
      className="flex flex-wrap items-center gap-2 px-3 py-2.5 mt-1 rounded-xl border border-blue-100 bg-blue-50/50"
    >
      {/* The pressed choice is marked by a border and a check, not only by a ring (box-shadow),
          which forced colours drop (#587). « Automatique » shows « ✓ » when pressed. */}
      <button
        type="button"
        onClick={() => setRoleColor(role, null)}
        aria-pressed={colorKey === null}
        aria-disabled={busy || undefined}
        className={`min-h-6 text-xs px-2 py-1 rounded-full aria-disabled:opacity-50 ${colorKey === null ? "border-2 border-blue-700 bg-white font-medium text-gray-900" : "border border-gray-200 text-gray-700 hover:bg-white"}`}
      >
        {colorKey === null && <span aria-hidden="true">✓ </span>}
        Automatique
      </button>
      {COLOR_OPTIONS.map(c => {
        const selected = colorKey === c.key
        return (
          // The swatch keeps its colour in forced colours (forced-color-adjust-none on the inner,
          // non-focusable children only): the colour is the choice. The selected one adds a border,
          // repainted by the system, and a white check.
          <button
            key={c.key}
            type="button"
            onClick={() => setRoleColor(role, c.key)}
            aria-label={c.label}
            aria-pressed={selected}
            aria-disabled={busy || undefined}
            className={`relative w-8 h-8 inline-flex items-center justify-center rounded-full flex-shrink-0 aria-disabled:opacity-50 ${selected ? "border-2 border-gray-900" : "border-0"}`}
          >
            <span aria-hidden="true" className={`w-6 h-6 rounded-full forced-color-adjust-none ${c.swatch}`} />
            {selected && (
              <svg aria-hidden="true" className="absolute w-4 h-4 text-white forced-color-adjust-none" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7.5 13.5 4 10l1.4-1.4 2.1 2.1 5.1-5.1L14 7z" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}
