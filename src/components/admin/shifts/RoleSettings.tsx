"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react"
import { flushSync } from "react-dom"
import { requestJson } from "@/lib/use-submit"
import { COLOR_OPTIONS } from "@/lib/roles"
import { parseTagList } from "@/lib/role-reservation"
import type { RawShift } from "./types"

// The inline editors of one role in the « Gérer les postes » panel: tags reserving it (#470),
// shifts per volunteer (#466) and colour. Each sends its own PATCH; which editor is open, the typed
// values, the busy role and the panel's error stay in RoleManagerPanel, which renders them.

type SetShifts = React.Dispatch<React.SetStateAction<RawShift[]>>

export function RoleReserveForm({
  eventId, role, index, reservedTags, value, onValueChange, busyRole, onBusyRoleChange, onActionError, onClose, setShifts, onAnnounce,
}: {
  eventId:          string
  role:             string
  /** Position of the role in the panel, for the ids. */
  index:            number
  reservedTags:     string[]
  value:            string
  onValueChange:    (value: string) => void
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

  async function saveReserve(role: string, tags: string[]) {
    if (busyRole) return
    onActionError(null)
    onBusyRoleChange(role)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(role)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservedTags: tags }),
    }), "Erreur lors de l'enregistrement.")
    onBusyRoleChange(null)
    if (!outcome.ok) {
      onActionError(outcome.error)
      return
    }
    setShifts(prev => prev.map(s => s.roleName === role ? { ...s, reservedTags: tags } : s))
    onClose(role)
    const typed = value.split(/[,;]/).map((t) => t.trim()).filter(Boolean).length
    const dropped = Math.max(0, typed - tags.length)
    onAnnounce((tags.length === 0 ? `Poste « ${role} » : ouvert à tous.` : `Poste « ${role} » : réservé aux membres avec l'étiquette ${tags.join(" ou ")}.`) + (dropped > 0 && tags.length > 0 ? ` ${dropped} étiquette${dropped > 1 ? "s" : ""} ignorée${dropped > 1 ? "s" : ""} (doublons, ou 10 au maximum).` : ""))
  }

  return (
    <form
      id={`reserve-form-${i}`}
      noValidate
      onSubmit={(e) => { e.preventDefault(); saveReserve(role, parseTagList(value)) }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(role) } }}
      className="flex flex-wrap items-end gap-2 px-3 py-2.5 mt-1 rounded-xl border border-blue-100 bg-blue-50/50"
    >
      <div className="flex-1 min-w-48">
        <label htmlFor={`reserve-${i}`} className="block text-xs font-medium text-gray-700 mb-1">Étiquettes donnant accès au poste « {role} »</label>
        <input
          id={`reserve-${i}`}
          type="text"
          value={value}
          autoFocus
          onChange={(e) => onValueChange(e.target.value)}
          aria-describedby={`reserve-help-${i}`}
          placeholder="ex. sécurité, secouriste"
          className="input w-full py-1"
        />
      </div>
      <button type="submit" aria-disabled={isBusy || undefined} className={`text-xs text-blue-700 font-medium hover:text-blue-900 py-1.5 ${isBusy ? "opacity-60 cursor-wait" : ""}`}>
        {isBusy ? "Enregistrement…" : "Enregistrer"}
      </button>
      {reservedTags.length > 0 && (
        <button type="button" onClick={() => saveReserve(role, [])} aria-disabled={isBusy || undefined} className={`text-xs text-gray-700 hover:text-gray-900 py-1.5 ${isBusy ? "opacity-60 cursor-wait" : ""}`}>
          Ouvrir à tous
        </button>
      )}
      <button type="button" onClick={() => onClose(role)} className="text-xs text-gray-600 hover:text-gray-900 py-1.5">Annuler</button>
      <p id={`reserve-help-${i}`} className="basis-full text-xs text-gray-600">Séparées par des virgules, 10 au plus. Laissez vide pour ouvrir le poste à tous.</p>
      <p className="basis-full text-xs text-gray-600">
        Seuls les membres portant l&apos;une de ces étiquettes peuvent le prendre, et seulement avec le lien d&apos;invitation reçu par email : sans ce lien, la page publique affiche le poste comme « Réservé ». Les étiquettes ne sont jamais montrées aux bénévoles. Vous pouvez toujours ajouter quelqu&apos;un à la main.
      </p>
    </form>
  )
}

export function RoleLimitForm({
  eventId, role, index, limit, value, onValueChange, error, onErrorChange, busyRole, onBusyRoleChange, onActionError, onClose, setShifts, onAnnounce,
}: {
  eventId:          string
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
          autoFocus
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
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(role) } }}
      className="flex flex-wrap items-center gap-2 px-3 py-2.5 mt-1 rounded-xl border border-blue-100 bg-blue-50/50"
    >
      <button
        type="button"
        onClick={() => setRoleColor(role, null)}
        aria-pressed={colorKey === null}
        aria-disabled={busy || undefined}
        className={`text-xs px-2 py-1 rounded-full border aria-disabled:opacity-50 ${colorKey === null ? "border-blue-400 bg-white font-medium" : "border-gray-200 text-gray-500 hover:bg-white"}`}
      >
        Automatique
      </button>
      {COLOR_OPTIONS.map(c => (
        <button
          key={c.key}
          type="button"
          onClick={() => setRoleColor(role, c.key)}
          aria-label={c.label}
          aria-pressed={colorKey === c.key}
          aria-disabled={busy || undefined}
          title={c.label}
          className={`w-6 h-6 rounded-full flex-shrink-0 aria-disabled:opacity-50 ${c.swatch} ${colorKey === c.key ? "ring-2 ring-offset-1 ring-blue-500" : ""}`}
        />
      ))}
    </div>
  )
}
