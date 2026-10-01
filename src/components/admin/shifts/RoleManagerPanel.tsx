"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useRef } from "react"
import { deleteRoleRecap, type ActionRecap } from "@/lib/action-recap"
import { requestJson } from "@/lib/use-submit"
import { getRoleAccent } from "@/lib/roles"
import { roleLimits } from "@/lib/role-limit"
import { reservedRoles } from "@/lib/role-reservation"
import { applyRoleOrder, moveItem, renameRole } from "@/lib/shifts-admin"
import { RoleColorPicker, RoleLimitForm, RoleReserveForm } from "./RoleSettings"
import type { RawShift } from "./types"

/**
 * « Gérer les postes » panel: reorder the roles by drag and drop, rename, delete (after the
 * confirmation the parent shows), and open the inline editors of RoleSettings.
 *
 * Stays mounted while closed (renders nothing) so that, as before the split, an inline editor left
 * open, its typed value or the last error are still there when the panel is reopened.
 */
export default function RoleManagerPanel({
  open, eventId, shifts, setShifts, roles, setRoles, onClose, onAnnounce,
  onRequestDelete, onDeletingChange, onDeleteError, onRoleDeleted,
}: {
  open:             boolean
  eventId:          string
  shifts:           RawShift[]
  setShifts:        React.Dispatch<React.SetStateAction<RawShift[]>>
  /** The roles in the order being edited; the parent resets it when it opens the panel. */
  roles:            string[]
  setRoles:         React.Dispatch<React.SetStateAction<string[]>>
  onClose:          () => void
  onAnnounce:       (text: string) => void
  /** Asks the parent's confirmation modal (#379) for a role deletion; `run` deletes once confirmed. */
  onRequestDelete:  (pending: { recap: ActionRecap; run: () => Promise<void> }) => void
  onDeletingChange: (deleting: boolean) => void
  onDeleteError:    (error: string) => void
  /** The role is deleted server-side: the parent closes the modal, drops its shifts and announces. */
  onRoleDeleted:    (role: string, unpublished: boolean | undefined) => void
}) {
  const [dragRoleIdx, setDragRoleIdx]     = useState<number | null>(null)
  const [savingOrder, setSavingOrder]     = useState(false)
  const [renamingRole, setRenamingRole]   = useState<string | null>(null)
  const [renameValue, setRenameValue]     = useState("")
  const [roleActionError, setRoleActionError] = useState<string | null>(null)
  const [roleActionBusy, setRoleActionBusy]   = useState<string | null>(null)
  const [colorPickerRole, setColorPickerRole] = useState<string | null>(null)
  const [limitRole, setLimitRole] = useState<string | null>(null)
  const [limitValue, setLimitValue] = useState("")
  const [limitError, setLimitError] = useState<string | null>(null)
  // Reserved roles (#470): the inline editor, like the limit's.
  const [reserveRole, setReserveRole] = useState<string | null>(null)
  const [reserveValue, setReserveValue] = useState("")
  const reserveBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  // « Limite » buttons per role: focus returns there when the inline form closes (#466).
  const limitBtnRefs = useRef(new Map<string, HTMLButtonElement>())

  function handleRoleDragOver(e: React.DragEvent, toIdx: number) {
    e.preventDefault()
    if (dragRoleIdx === null || dragRoleIdx === toIdx) return
    setRoles(prev => moveItem(prev, dragRoleIdx, toIdx))
    setDragRoleIdx(toIdx)
  }

  async function saveRoleOrder() {
    if (savingOrder) return
    setSavingOrder(true)
    setRoleActionError(null)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/reorder-roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleOrder: roles }),
    }), "L'ordre n'a pas pu être enregistré.")
    setSavingOrder(false)
    if (!outcome.ok) { setRoleActionError(outcome.error); return }
    setShifts(prev => applyRoleOrder(prev, roles))
    onClose()
    onAnnounce("Ordre des postes enregistré.")
  }

  function startRenameRole(role: string) {
    setRoleActionError(null)
    setLimitRole(null)
    setReserveRole(null)
    setRenamingRole(role)
    setRenameValue(role)
  }

  async function submitRenameRole(oldName: string) {
    const newName = renameValue.trim()
    if (!newName || newName === oldName) { setRenamingRole(null); return }
    setRoleActionError(null)
    setRoleActionBusy(oldName)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(oldName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    }), "Erreur lors du renommage.")
    setRoleActionBusy(null)
    if (!outcome.ok) {
      setRoleActionError(outcome.error)
      return
    }
    setShifts(prev => renameRole(prev, oldName, newName))
    setRoles(prev => prev.map(r => r === oldName ? newName : r))
    setRenamingRole(null)
    onAnnounce(`Poste renommé « ${oldName} » → « ${newName} ».`)
  }

  function handleDeleteRole(role: string) {
    const own = shifts.filter((s) => s.roleName === role && s.status !== "cancelled")
    onRequestDelete({
      recap: deleteRoleRecap({ role, shifts: own.length, registered: own.reduce((sum, s) => sum + s.registrationCount, 0) }),
      run: () => runDeleteRole(role),
    })
  }

  async function runDeleteRole(role: string) {
    onDeletingChange(true)
    setRoleActionError(null)
    setRoleActionBusy(role)
    const outcome = await requestJson<{ unpublished?: boolean }>(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(role)}`, { method: "DELETE" }), "Erreur lors de la suppression.")
    setRoleActionBusy(null)
    onDeletingChange(false)
    if (!outcome.ok) {
      onDeleteError(outcome.error)
      return
    }
    onRoleDeleted(role, outcome.data?.unpublished)
  }

  function roleColorOf(role: string): string | null {
    return shifts.find(s => s.roleName === role)?.colorKey ?? null
  }

  function roleLimitOf(role: string): number | null {
    return roleLimits(shifts.filter((s) => s.roleName === role)).get(role) ?? null
  }

  function startRoleLimit(role: string) {
    setRoleActionError(null)
    setLimitError(null)
    setColorPickerRole(null)
    setRenamingRole(null)
    setReserveRole(null)
    setLimitRole(limitRole === role ? null : role)
    setLimitValue(String(roleLimitOf(role) ?? ""))
  }

  function reservedTagsOf(role: string): string[] {
    return reservedRoles(shifts.filter((s) => s.roleName === role)).get(role) ?? []
  }

  function startReserve(role: string) {
    setRoleActionError(null)
    setColorPickerRole(null)
    setRenamingRole(null)
    setLimitRole(null)
    setReserveRole(reserveRole === role ? null : role)
    setReserveValue(reservedTagsOf(role).join(", "))
  }

  function closeReserve(role: string) {
    setReserveRole(null)
    setRoleActionError(null)
    requestAnimationFrame(() => reserveBtnRefs.current.get(role)?.focus())
  }

  function closeRoleLimit(role: string) {
    setLimitRole(null)
    setLimitError(null)
    setRoleActionError(null)
    requestAnimationFrame(() => limitBtnRefs.current.get(role)?.focus())
  }

  if (!open) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800">Gérer les postes</h3>
        <p className="text-xs text-gray-500 mt-0.5">Glissez-déposez pour réordonner, renommez, limitez le nombre de créneaux par personne, réservez un poste à certains membres ou supprimez un poste (tous ses créneaux).</p>
      </div>
      {roleActionError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{roleActionError}</p>
      )}
      <div className="space-y-1.5">
        {roles.map((role, i) => {
          const isRenaming = renamingRole === role
          const isBusy = roleActionBusy === role
          const isPickingColor = colorPickerRole === role
          const limit = roleLimitOf(role)
          const reservedTags = reservedTagsOf(role)
          return (
          <div key={role}>
            <div
              draggable={!isRenaming}
              onDragStart={() => setDragRoleIdx(i)}
              onDragOver={e => handleRoleDragOver(e, i)}
              onDragEnd={() => setDragRoleIdx(null)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border select-none transition-colors
                ${dragRoleIdx === i
                  ? "opacity-40 border-blue-200 bg-blue-50"
                  : `border-gray-100 bg-gray-50 hover:bg-gray-100 ${isRenaming ? "" : "cursor-grab active:cursor-grabbing"}`}`}
            >
              <svg aria-hidden="true" className="w-4 h-4 text-gray-300 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
                <circle cx="5" cy="4" r="1.2"/><circle cx="5" cy="8" r="1.2"/><circle cx="5" cy="12" r="1.2"/>
                <circle cx="11" cy="4" r="1.2"/><circle cx="11" cy="8" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
              </svg>
              <button
                onClick={() => { setLimitRole(null); setReserveRole(null); setColorPickerRole(isPickingColor ? null : role) }}
                disabled={isBusy || isRenaming}
                aria-label={`Changer la couleur du poste ${role}`}
                aria-expanded={isPickingColor}
                className={`w-4 h-4 rounded-full flex-shrink-0 disabled:opacity-50 ring-offset-1 ${isPickingColor ? "ring-2 ring-blue-400" : ""} ${getRoleAccent(role, roleColorOf(role))}`}
              />
              {isRenaming ? (
                <>
                  <label className="sr-only" htmlFor={`rename-${i}`}>Nouveau nom du poste « {role} »</label>
                  <input
                    id={`rename-${i}`}
                    type="text"
                    value={renameValue}
                    autoFocus
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") submitRenameRole(role)
                      if (e.key === "Escape") setRenamingRole(null)
                    }}
                    className="input flex-1 py-1"
                  />
                  <button
                    onClick={() => submitRenameRole(role)}
                    disabled={isBusy}
                    className="text-xs text-blue-600 font-medium hover:text-blue-800 disabled:opacity-50 flex-shrink-0"
                  >
                    {isBusy ? "…" : "Valider"}
                  </button>
                  <button onClick={() => setRenamingRole(null)} className="text-xs text-gray-500 hover:text-gray-800 flex-shrink-0">
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-gray-700 flex-1 truncate">{role}</span>
                  <button
                    ref={(el) => { if (el) limitBtnRefs.current.set(role, el); else limitBtnRefs.current.delete(role) }}
                    onClick={() => startRoleLimit(role)}
                    disabled={isBusy}
                    aria-expanded={limitRole === role}
                    aria-controls={`limit-form-${i}`}
                    // Starts with the visible text (2.5.3), then says what it is about.
                    aria-label={limit === null ? `Limite : aucune, poste « ${role} »` : `Limite : ${limit} créneau${limit > 1 ? "x" : ""} par personne, poste « ${role} »`}
                    className="text-xs text-gray-600 hover:text-blue-600 disabled:opacity-50 flex-shrink-0"
                  >
                    {limit === null ? "Limite" : `Limite : ${limit}`}
                  </button>
                  <button
                    ref={(el) => { if (el) reserveBtnRefs.current.set(role, el); else reserveBtnRefs.current.delete(role) }}
                    onClick={() => startReserve(role)}
                    disabled={isBusy}
                    aria-expanded={reserveRole === role}
                    aria-controls={`reserve-form-${i}`}
                    aria-label={reservedTags.length === 0 ? `Accès : tous, poste « ${role} »` : `Accès : ${reservedTags.join(", ")}, poste « ${role} » réservé`}
                    className="text-xs text-gray-600 hover:text-blue-600 disabled:opacity-50 flex-shrink-0"
                  >
                    <span className="inline-block max-w-[10rem] truncate align-bottom">{reservedTags.length === 0 ? "Accès : tous" : `Accès : ${reservedTags.join(", ")}`}</span>
                  </button>
                  <button
                    onClick={() => startRenameRole(role)}
                    disabled={isBusy}
                    aria-label={`Renommer le poste ${role}`}
                    className="text-xs text-gray-500 hover:text-blue-600 disabled:opacity-50 flex-shrink-0"
                  >
                    Renommer
                  </button>
                  <button
                    onClick={() => handleDeleteRole(role)}
                    disabled={isBusy}
                    aria-label={`Supprimer le poste ${role}`}
                    className="text-xs text-red-700 hover:text-red-900 disabled:opacity-50 flex-shrink-0"
                  >
                    {isBusy ? "…" : "Supprimer"}
                  </button>
                </>
              )}
            </div>
            {reserveRole === role && (
              <RoleReserveForm
                eventId={eventId}
                role={role}
                index={i}
                reservedTags={reservedTags}
                value={reserveValue}
                onValueChange={setReserveValue}
                busyRole={roleActionBusy}
                onBusyRoleChange={setRoleActionBusy}
                onActionError={setRoleActionError}
                onClose={closeReserve}
                setShifts={setShifts}
                onAnnounce={onAnnounce}
              />
            )}
            {limitRole === role && (
              <RoleLimitForm
                eventId={eventId}
                role={role}
                index={i}
                limit={limit}
                value={limitValue}
                onValueChange={setLimitValue}
                error={limitError}
                onErrorChange={setLimitError}
                busyRole={roleActionBusy}
                onBusyRoleChange={setRoleActionBusy}
                onActionError={setRoleActionError}
                onClose={closeRoleLimit}
                setShifts={setShifts}
                onAnnounce={onAnnounce}
              />
            )}
            {isPickingColor && (
              <RoleColorPicker
                eventId={eventId}
                role={role}
                colorKey={roleColorOf(role)}
                onClose={() => setColorPickerRole(null)}
                onBusyRoleChange={setRoleActionBusy}
                onActionError={setRoleActionError}
                setShifts={setShifts}
                onAnnounce={onAnnounce}
              />
            )}
          </div>
          )
        })}
      </div>
      <div className="flex gap-3">
        <button onClick={saveRoleOrder} disabled={savingOrder}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {savingOrder ? "…" : "Enregistrer l'ordre"}
        </button>
        <button onClick={onClose}
          className="text-gray-500 px-3 py-2 text-sm hover:text-gray-800">
          Fermer
        </button>
      </div>
    </div>
  )
}
