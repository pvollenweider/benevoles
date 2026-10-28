"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useState, useRef } from "react"
import { flushSync } from "react-dom"
import { deleteRoleRecap, type ActionRecap } from "@/lib/action-recap"
import { requestJson } from "@/lib/use-submit"
import { getRoleAccent } from "@/lib/roles"
import { roleLimits } from "@/lib/role-limit"
import { reservedRoles } from "@/lib/role-reservation"
import { roleAssignedOnly } from "@/lib/role-assignment"
import { roleOverlapAllowed } from "@/lib/shift-overlap"
import { applyRoleOrder, moveItem, renameRole } from "@/lib/shifts-admin"
import { focusFirstAvailable, isFocusDropped, type FocusCandidate } from "@/lib/focus-return"
import { moveRole, moveRoleInGroup, roleMoveBoundaryMessage, roleMoveMessage, type MoveDirection } from "@/lib/role-order"
import { RoleColorPicker, RoleLimitForm, RoleMealForm, RoleOverlapForm, RoleReserveForm, RoleSectorForm } from "./RoleSettings"
import { posteMealOnTheGo, posteMealOnTheGoLabel } from "@/lib/meal-on-the-go"
import type { RawShift } from "./types"
import SectorsSection from "./SectorsSection"
import type { AdminSectorsState } from "../ShiftsManager"
import { roleSectorOf } from "@/lib/role-settings"
import { activeSectors, groupRolesBySector, managePostesLabel, sectorsAdopted, sectorsManaged, type SectorGroup } from "@/lib/sectors"

/** Ref callback body: keeps `buttons` keyed by role while the button is mounted. */
function setRoleButton(buttons: Map<string, HTMLButtonElement>, role: string, el: HTMLButtonElement | null) {
  if (el) buttons.set(role, el)
  else buttons.delete(role)
}

/**
 * Draws one group's poste rows with the panel's `render`, as an element: the rows' ref callbacks and
 * handlers run at commit and on events, never while the panel renders.
 */
function PosteRows({ render, group }: { render: (group: SectorGroup) => React.ReactNode; group: SectorGroup }) {
  return <>{render(group)}</>
}

/**
 * « Gérer les postes » panel: reorder the roles by drag and drop or with Monter / Descendre, rename, delete (after the
 * confirmation the parent shows), and open the inline editors of RoleSettings.
 *
 * Stays mounted while closed (renders nothing) so that, as before the split, an inline editor left
 * open, its typed value or the last error are still there when the panel is reopened.
 *
 * Focus (#554): when an inline editor (rename, colour, limit, access, cumul) closes, focus goes back to the
 * row button that opened it, or to the panel's heading when that row is gone; never to <body>.
 */

export default function RoleManagerPanel({
  open, panelId, eventId, shifts, setShifts, roles, setRoles, onClose, onRequestClose, onAnnounce,
  onRequestDelete, onDeletingChange, onDeleteError, onRoleDeleted,
  sectorsState = null, setSectorsState, onConfirmDone, onAddPoste, mealOnTheGoShown = false,
}: {
  open:             boolean
  /** Id of the panel's root, which « Gérer les postes » controls (`aria-controls`). */
  panelId:          string
  eventId:          string
  shifts:           RawShift[]
  setShifts:        React.Dispatch<React.SetStateAction<RawShift[]>>
  /** The roles in the order being edited; the parent resets it when it opens the panel. */
  roles:            string[]
  setRoles:         React.Dispatch<React.SetStateAction<string[]>>
  /** Closes the panel (after the order was saved). */
  onClose:          () => void
  /** « Fermer »: the parent asks first when the order is changed and not saved; else as onClose. */
  onRequestClose?:  () => void
  onAnnounce:       (text: string) => void
  /** Asks the parent's confirmation modal (#379) for a role deletion; `run` deletes once confirmed. */
  onRequestDelete:  (pending: { recap: ActionRecap; run: () => Promise<void> }) => void
  onDeletingChange: (deleting: boolean) => void
  onDeleteError:    (error: string) => void
  /** The role is deleted server-side: the parent closes the modal, drops its shifts and announces. */
  onRoleDeleted:    (role: string, unpublished: boolean | undefined) => void
  /** Sectors (#1147, beta): null for an event without the option, which keeps the panel as it was. */
  sectorsState?:    AdminSectorsState | null
  setSectorsState?: React.Dispatch<React.SetStateAction<AdminSectorsState | null>>
  /** Closes the parent's confirmation modal once a confirmed action is done (archiving a sector). */
  onConfirmDone?:   () => void
  /** « Ajouter un poste dans « S » » (#1147): the parent opens the shift form in that sector. */
  onAddPoste?:      (sector: { id: string; name: string }, opener: () => HTMLElement | null | undefined) => void
  /** « Repas sur le pouce possible » (#1171, lot 2): only where the workload protection can be used. */
  mealOnTheGoShown?: boolean
}) {
  const [dragRoleIdx, setDragRoleIdx]     = useState<number | null>(null)
  const [savingOrder, setSavingOrder]     = useState(false)
  const [renamingRole, setRenamingRole]   = useState<string | null>(null)
  const [renameValue, setRenameValue]     = useState("")
  // A failed rename's error, under the input. `live`: the input had focus when it was sent (Enter),
  // so the error is an alert; otherwise focus moves to the input, which reads it as its description.
  const [renameError, setRenameError]     = useState<{ text: string; live: boolean } | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [roleActionError, setRoleActionError] = useState<string | null>(null)
  const [roleActionBusy, setRoleActionBusy]   = useState<string | null>(null)
  const [colorPickerRole, setColorPickerRole] = useState<string | null>(null)
  const [limitRole, setLimitRole] = useState<string | null>(null)
  const [limitValue, setLimitValue] = useState("")
  const [limitError, setLimitError] = useState<string | null>(null)
  // Reserved roles (#470): the inline editor, like the limit's.
  const [reserveRole, setReserveRole] = useState<string | null>(null)
  const [reserveValue, setReserveValue] = useState("")
  // « Attribué par l'organisation uniquement » (#1145), in the same editor: kept like the typed tags.
  const [assignedOnlyValue, setAssignedOnlyValue] = useState(false)
  const reserveBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  // « Cumulable avec un autre créneau » (#986): the inline editor, like the limit's.
  const [overlapRole, setOverlapRole] = useState<string | null>(null)
  const [overlapValue, setOverlapValue] = useState(false)
  const overlapBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  // « Repas sur le pouce possible » (#1171, lot 2): the inline editor, like « Cumul ». null = a
  // mixed value left untouched.
  const [mealRole, setMealRole] = useState<string | null>(null)
  const [mealValue, setMealValue] = useState<boolean | null>(null)
  const mealBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  // « Déplacer… » a poste to another sector (#1147): the inline editor, like the limit's.
  const [sectorRole, setSectorRole] = useState<string | null>(null)
  const [sectorValue, setSectorValue] = useState("")
  const sectorBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  // « Limite » buttons per role: focus returns there when the inline form closes (#466).
  const limitBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  // « Renommer » and colour buttons per role, and the heading, the fallback when the row is gone (#554).
  const renameBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  const colorBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  // Monter / Descendre buttons, keyed `up:<role>` and `down:<role>` (#554).
  const moveBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  const headingRef = useRef<HTMLHeadingElement>(null)
  // An editor takes focus when its button opens it, not when the panel is reopened with it still
  // open: focus then stays on « Gérer les postes » (disclosure).
  const [editorAutoFocus, setEditorAutoFocus] = useState(true)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setEditorAutoFocus(false)
  }

  // Focus to give back, applied once React has committed the updates queued with the request. A
  // request answered after `await` renders on a later task, which a next-frame focus can beat: the
  // renamed row is not there yet, or the row's button is still disabled, and focus fell to the heading.
  const [focusRequest, setFocusRequest] = useState<{ candidates: FocusCandidate[] } | null>(null)
  // Only while focus is still in the panel, or was dropped by an unmounted editor (to <body>, or to
  // <main> under WebKit, which does not focus a tapped button, #585): a request answered after the
  // user went elsewhere on the page does not pull focus back.
  useLayoutEffect(() => {
    if (!focusRequest) return
    const active = document.activeElement
    const inPanel = isFocusDropped(active) || !!document.getElementById(panelId)?.contains(active)
    if (inPanel) focusFirstAvailable(focusRequest.candidates)
  }, [focusRequest, panelId])

  /** Returns the focus to the role's button in `refs`, else to the heading. */
  function focusRoleButton(refs: React.RefObject<Map<string, HTMLButtonElement>>, role: string) {
    setFocusRequest({ candidates: [() => refs.current.get(role), () => headingRef.current] })
  }


  function handleRoleDragOver(e: React.DragEvent, toIdx: number) {
    e.preventDefault()
    if (dragRoleIdx === null || dragRoleIdx === toIdx) return
    // Grouped by sector: a poste is dragged inside its sector only; « Déplacer… » moves it to another.
    if (groupOf(displayRoles[dragRoleIdx]) !== groupOf(displayRoles[toIdx])) return
    setRoles(moveItem(displayRoles, dragRoleIdx, toIdx))
    setDragRoleIdx(toIdx)
  }

  /**
   * Keyboard reorder (#554): one step, announced once. After « Descendre » React moves the focused
   * row's node, which loses focus; the same button gets it back right after the commit.
   */
  function moveRoleBy(role: string, dir: MoveDirection) {
    if (savingOrder || renamingRole === role) return
    const moved: { roles: string[]; index: number; total: number } | null = grouped
      ? moveRoleInGroup(roleGroups, role, dir)
      : (() => { const m = moveRole(roles, role, dir); return m && { ...m, total: m.roles.length } })()
    if (!moved) { onAnnounce(roleMoveBoundaryMessage(role, dir)); return }
    setRoles(moved.roles)
    setFocusRequest({ candidates: [
      () => moveBtnRefs.current.get(`${dir}:${role}`),
      () => moveBtnRefs.current.get(`${dir === "up" ? "down" : "up"}:${role}`),
      () => headingRef.current,
    ] })
    onAnnounce(roleMoveMessage(role, moved.index, moved.total))
  }

  async function saveRoleOrder() {
    if (savingOrder) return
    setSavingOrder(true)
    setRoleActionError(null)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/reorder-roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleOrder: displayRoles }),
    }), "L'ordre n'a pas pu être enregistré.")
    setSavingOrder(false)
    if (!outcome.ok) { setRoleActionError(outcome.error); return }
    setShifts(prev => applyRoleOrder(prev, displayRoles))
    onClose()
    onAnnounce("Ordre des postes enregistré.")
  }

  function startRenameRole(role: string) {
    setEditorAutoFocus(true)
    setSectorRole(null)
    setRoleActionError(null)
    setLimitRole(null)
    setReserveRole(null)
    setOverlapRole(null)
    setMealRole(null)
    setColorPickerRole(null)
    setRenameError(null)
    setRenamingRole(role)
    setRenameValue(role)
  }

  function cancelRename(role: string) {
    setRenamingRole(null)
    setRenameError(null)
    focusRoleButton(renameBtnRefs, role)
  }

  async function submitRenameRole(oldName: string) {
    if (roleActionBusy) return
    const newName = renameValue.trim()
    if (!newName || newName === oldName) { cancelRename(oldName); return }
    const live = document.activeElement !== null && document.activeElement === renameInputRef.current
    setRoleActionError(null)
    setRenameError(null)
    setRoleActionBusy(oldName)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(oldName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    }), "Erreur lors du renommage.")
    if (!outcome.ok) {
      // One hearing of the error: an alert when the input has focus, else its description on focus.
      flushSync(() => {
        setRoleActionBusy(null)
        setRenameError({ text: outcome.error, live })
      })
      if (!live) renameInputRef.current?.focus()
      return
    }
    setRoleActionBusy(null)
    setShifts(prev => renameRole(prev, oldName, newName))
    setRoles(prev => prev.map(r => r === oldName ? newName : r))
    setRenamingRole(null)
    // The row remounts under its new key: the getter finds its « Renommer » after the render.
    focusRoleButton(renameBtnRefs, newName)
    onAnnounce(`Poste « ${oldName} » renommé en « ${newName} ».`)
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
    setEditorAutoFocus(true)
    setSectorRole(null)
    setRoleActionError(null)
    setLimitError(null)
    setColorPickerRole(null)
    setRenamingRole(null)
    setReserveRole(null)
    setOverlapRole(null)
    setMealRole(null)
    setLimitRole(limitRole === role ? null : role)
    setLimitValue(String(roleLimitOf(role) ?? ""))
  }

  function reservedTagsOf(role: string): string[] {
    return reservedRoles(shifts.filter((s) => s.roleName === role)).get(role) ?? []
  }

  function startReserve(role: string) {
    setEditorAutoFocus(true)
    setSectorRole(null)
    setRoleActionError(null)
    setColorPickerRole(null)
    setRenamingRole(null)
    setLimitRole(null)
    setOverlapRole(null)
    setMealRole(null)
    setReserveRole(reserveRole === role ? null : role)
    setReserveValue(reservedTagsOf(role).join(", "))
    setAssignedOnlyValue(assignedOnlyOf(role))
  }

  function assignedOnlyOf(role: string): boolean {
    return roleAssignedOnly(shifts, role)
  }

  function overlapAllowedOf(role: string): boolean {
    return roleOverlapAllowed(shifts, role)
  }

  function startMeal(role: string) {
    setEditorAutoFocus(true)
    setSectorRole(null)
    setRoleActionError(null)
    setColorPickerRole(null)
    setRenamingRole(null)
    setLimitRole(null)
    setReserveRole(null)
    setOverlapRole(null)
    setMealRole(mealRole === role ? null : role)
    const saved = posteMealOnTheGo(shifts, role)
    setMealValue(saved === "some" ? null : saved === "all")
  }

  function closeMeal(role: string) {
    setMealRole(null)
    setRoleActionError(null)
    focusRoleButton(mealBtnRefs, role)
  }

  function startOverlap(role: string) {
    setEditorAutoFocus(true)
    setMealRole(null)
    setSectorRole(null)
    setRoleActionError(null)
    setColorPickerRole(null)
    setRenamingRole(null)
    setLimitRole(null)
    setReserveRole(null)
    setOverlapRole(overlapRole === role ? null : role)
    setOverlapValue(overlapAllowedOf(role))
  }

  function closeOverlap(role: string) {
    setOverlapRole(null)
    setMealRole(null)
    setRoleActionError(null)
    focusRoleButton(overlapBtnRefs, role)
  }

  function closeReserve(role: string) {
    setReserveRole(null)
    setRoleActionError(null)
    focusRoleButton(reserveBtnRefs, role)
  }

  function closeRoleLimit(role: string) {
    setLimitRole(null)
    setLimitError(null)
    setRoleActionError(null)
    focusRoleButton(limitBtnRefs, role)
  }

  const sectorsShown = sectorsManaged(sectorsState ? { sectorsEnabled: sectorsState.enabled, sectorsAdoptedAt: sectorsState.adoptedAt } : null)
  const sectorsInUse = !!sectorsState && sectorsAdopted({ sectorsEnabled: sectorsState.enabled, sectorsAdoptedAt: sectorsState.adoptedAt })
  const liveSectors = sectorsState ? activeSectors(sectorsState.sectors) : []

  function sectorOfRole(role: string): string | null {
    const id = roleSectorOf(shifts.filter((s) => s.roleName === role && s.status !== "cancelled"))
    return id && liveSectors.some((s) => s.id === id) ? id : null
  }

  // Once the event uses sectors, one tree: every active sector (empty ones too, a poste is created
  // from its sector), its postes under it, then « Autres postes », like the timeline. The order
  // shown is the order saved.
  const grouped = sectorsInUse
  const roleGroups: SectorGroup[] = grouped ? groupRolesBySector(roles, sectorOfRole, liveSectors, { keepEmptySectors: true }) : [{ id: null, name: "", roles }]

  /** The poste's place in the group it would move to (« Déplacer… »), for the announcement. */
  function placeAfterMove(role: string, next: string | null): { index: number; total: number } {
    const moved = groupRolesBySector(roles, (r) => (r === role ? next : sectorOfRole(r)), liveSectors).find((g) => g.roles.includes(role))
    return moved ? { index: moved.roles.indexOf(role), total: moved.roles.length } : { index: 0, total: 1 }
  }
  const displayRoles = roleGroups.flatMap((g) => g.roles)
  const groupOf = (role: string | undefined) => roleGroups.find((g) => role !== undefined && g.roles.includes(role))

  function startSector(role: string) {
    setEditorAutoFocus(true)
    setRoleActionError(null)
    setColorPickerRole(null)
    setRenamingRole(null)
    setLimitRole(null)
    setReserveRole(null)
    setOverlapRole(null)
    setMealRole(null)
    setSectorRole(sectorRole === role ? null : role)
    setSectorValue(sectorOfRole(role) ?? "")
  }

  function closeSector(role: string) {
    setSectorRole(null)
    setRoleActionError(null)
    focusRoleButton(sectorBtnRefs, role)
  }

  function closeColorPicker(role: string) {
    setColorPickerRole(null)
    focusRoleButton(colorBtnRefs, role)
  }

  if (!open) return null

  /** The poste rows of one group (the whole list without sectors), in their own <ol>. */
  function renderRoleList(group: SectorGroup) {
    // role="list": Safari drops the list role of an <ol> without bullets.
    return (
      <ol role="list" aria-label={grouped ? `Ordre des postes, ${group.name}` : "Ordre des postes"} className="space-y-1.5">
        {group.roles.map((role) => {
          const i = displayRoles.indexOf(role)
          const siblings = group.roles
          const isRenaming = renamingRole === role
          const isBusy = roleActionBusy === role
          const isPickingColor = colorPickerRole === role
          const limit = roleLimitOf(role)
          const reservedTags = reservedTagsOf(role)
          const assignedOnly = assignedOnlyOf(role)
          const cumulable = overlapAllowedOf(role)
          const meal = posteMealOnTheGo(shifts, role)
          const mealLabel = posteMealOnTheGoLabel(meal, role)
          const roleSectorId = sectorsInUse ? sectorOfRole(role) : null
          return (
          <li key={role}>
            <div
              draggable={!isRenaming}
              onDragStart={() => setDragRoleIdx(i)}
              onDragOver={e => handleRoleDragOver(e, i)}
              onDragEnd={() => setDragRoleIdx(null)}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 rounded-xl border select-none transition-colors
                ${dragRoleIdx === i
                  ? "opacity-40 border-blue-200 bg-blue-50"
                  : `border-gray-100 bg-gray-50 hover:bg-gray-100 ${isRenaming ? "" : "cursor-grab active:cursor-grabbing"}`}`}
            >
              <svg aria-hidden="true" className="w-4 h-4 text-gray-300 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
                <circle cx="5" cy="4" r="1.2"/><circle cx="5" cy="8" r="1.2"/><circle cx="5" cy="12" r="1.2"/>
                <circle cx="11" cy="4" r="1.2"/><circle cx="11" cy="8" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
              </svg>
              {siblings.length > 1 && (
                <span className="flex gap-0.5 flex-shrink-0">
                  {(["up", "down"] as const).map((dir) => {
                    const atEnd = dir === "up" ? siblings[0] === role : siblings[siblings.length - 1] === role
                    return (
                      // aria-disabled, not disabled: the button just pressed keeps focus at an end.
                      <button
                        key={dir}
                        ref={(el) => setRoleButton(moveBtnRefs.current, `${dir}:${role}`, el)}
                        type="button"
                        onClick={() => moveRoleBy(role, dir)}
                        aria-label={`${dir === "up" ? "Monter" : "Descendre"} le poste ${role}`}
                        aria-disabled={atEnd || isRenaming || savingOrder || undefined}
                        className="w-6 h-6 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-gray-900 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent aria-disabled:hover:text-gray-600 forced-colors:aria-disabled:text-[GrayText]"
                      >
                        <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d={dir === "up" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                        </svg>
                      </button>
                    )
                  })}
                </span>
              )}
              {/* A 24 px target around the 16 px dot, with its own focus outline (#587). The dot keeps
                  its colour in forced colours: the colour is what the button shows. */}
              <button
                ref={(el) => setRoleButton(colorBtnRefs.current, role, el)}
                type="button"
                onClick={() => { setLimitRole(null); setReserveRole(null); setOverlapRole(null); setMealRole(null); setColorPickerRole(isPickingColor ? null : role) }}
                disabled={isBusy || isRenaming}
                aria-label={`Changer la couleur du poste ${role}`}
                aria-expanded={isPickingColor}
                aria-controls={isPickingColor ? `color-picker-${i}` : undefined}
                className="w-6 h-6 inline-flex items-center justify-center rounded-full flex-shrink-0 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <span aria-hidden="true" className={`w-4 h-4 rounded-full forced-color-adjust-none ring-offset-1 ${isPickingColor ? "ring-2 ring-blue-600" : ""} ${getRoleAccent(role, roleColorOf(role))}`} />
              </button>
              {isRenaming ? (
                <>
                  <label className="sr-only" htmlFor={`rename-${i}`}>Nouveau nom du poste « {role} »</label>
                  <input
                    ref={renameInputRef}
                    id={`rename-${i}`}
                    type="text"
                    value={renameValue}
                    autoFocus={editorAutoFocus}
                    onChange={e => { setRenameValue(e.target.value); setRenameError(null) }}
                    onKeyDown={e => {
                      if (e.key === "Enter") submitRenameRole(role)
                      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelRename(role) }
                    }}
                    aria-invalid={renameError ? true : undefined}
                    aria-describedby={renameError ? `rename-error-${i}` : undefined}
                    className="input flex-1 py-1"
                  />
                  {/* aria-disabled, not disabled: the button keeps focus during the request. */}
                  <button
                    type="button"
                    onClick={() => submitRenameRole(role)}
                    aria-disabled={isBusy || undefined}
                    className="text-xs text-blue-600 font-medium hover:text-blue-800 aria-disabled:opacity-50 flex-shrink-0"
                  >
                    Valider
                  </button>
                  <button type="button" onClick={() => cancelRename(role)} className="text-xs text-gray-600 hover:text-gray-800 flex-shrink-0">
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  {/* The whole name wraps onto several lines rather than being cut (#606). */}
                  <span className="text-sm font-medium text-gray-700 flex-1 min-w-[8rem] [overflow-wrap:anywhere]">{role}</span>
                  <button
                    ref={(el) => setRoleButton(limitBtnRefs.current, role, el)}
                    type="button"
                    onClick={() => startRoleLimit(role)}
                    disabled={isBusy}
                    aria-expanded={limitRole === role}
                    aria-controls={limitRole === role ? `limit-form-${i}` : undefined}
                    // Starts with the visible text (2.5.3), then says what it is about.
                    aria-label={limit === null ? `Limite : aucune, poste « ${role} »` : `Limite : ${limit} créneau${limit > 1 ? "x" : ""} par personne, poste « ${role} »`}
                    className="text-xs text-gray-600 hover:text-blue-600 disabled:opacity-50 flex-shrink-0"
                  >
                    {limit === null ? "Limite" : `Limite : ${limit}`}
                  </button>
                  <button
                    ref={(el) => setRoleButton(reserveBtnRefs.current, role, el)}
                    type="button"
                    onClick={() => startReserve(role)}
                    disabled={isBusy}
                    aria-expanded={reserveRole === role}
                    aria-controls={reserveRole === role ? `reserve-form-${i}` : undefined}
                    // Assigned by the organisation only (#1145) wins over tags still stored.
                    aria-label={assignedOnly ? `Accès : par l'organisation uniquement, poste « ${role} »` : reservedTags.length === 0 ? `Accès : tous, poste « ${role} »` : `Accès : ${reservedTags.join(", ")}, poste « ${role} » réservé`}
                    className="text-xs text-gray-600 hover:text-blue-600 disabled:opacity-50 text-left min-w-0 [overflow-wrap:anywhere]"
                  >
                    {/* A long list of tags wraps, whole (#606). */}
                    {assignedOnly ? "Accès : par l'organisation" : reservedTags.length === 0 ? "Accès : tous" : `Accès : ${reservedTags.join(", ")}`}
                  </button>
                  <button
                    ref={(el) => setRoleButton(overlapBtnRefs.current, role, el)}
                    type="button"
                    onClick={() => startOverlap(role)}
                    disabled={isBusy}
                    aria-expanded={overlapRole === role}
                    aria-controls={overlapRole === role ? `overlap-form-${i}` : undefined}
                    aria-label={cumulable ? `Cumul : oui, poste « ${role} » cumulable avec un autre créneau` : `Cumul : non, poste « ${role} » non cumulable avec un autre créneau`}
                    className="text-xs text-gray-600 hover:text-blue-600 disabled:opacity-50 flex-shrink-0"
                  >
                    {cumulable ? "Cumul : oui" : "Cumul : non"}
                  </button>
                  {mealOnTheGoShown && (
                    <button
                      ref={(el) => setRoleButton(mealBtnRefs.current, role, el)}
                      type="button"
                      onClick={() => startMeal(role)}
                      disabled={isBusy}
                      aria-expanded={mealRole === role}
                      aria-controls={mealRole === role ? `meal-form-${i}` : undefined}
                      aria-label={mealLabel.name}
                      className="text-xs text-gray-600 hover:text-blue-600 disabled:opacity-50 flex-shrink-0"
                    >
                      {mealLabel.text}
                    </button>
                  )}
                  {sectorsInUse && (liveSectors.length > 0 || roleSectorId) && (
                    <button
                      ref={(el) => setRoleButton(sectorBtnRefs.current, role, el)}
                      type="button"
                      onClick={() => startSector(role)}
                      disabled={isBusy}
                      aria-expanded={sectorRole === role}
                      aria-controls={sectorRole === role ? `sector-form-${i}` : undefined}
                      aria-label={`Déplacer le poste « ${role} »`}
                      className="text-xs text-gray-600 hover:text-blue-600 disabled:opacity-50 min-h-6 flex-shrink-0"
                    >
                      Déplacer…
                    </button>
                  )}
                  <button
                    ref={(el) => setRoleButton(renameBtnRefs.current, role, el)}
                    type="button"
                    onClick={() => startRenameRole(role)}
                    disabled={isBusy}
                    aria-label={`Renommer le poste ${role}`}
                    className="text-xs text-gray-600 hover:text-blue-600 disabled:opacity-50 flex-shrink-0"
                  >
                    Renommer
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRole(role)}
                    disabled={isBusy}
                    aria-label={`Supprimer le poste ${role}`}
                    className="text-xs text-red-700 hover:text-red-900 disabled:opacity-50 flex-shrink-0"
                  >
                    Supprimer
                  </button>
                </>
              )}
            </div>
            {isRenaming && renameError && (
              <p id={`rename-error-${i}`} role={renameError.live ? "alert" : undefined} className="mt-1 px-3 text-xs text-red-700">{renameError.text}</p>
            )}
            {reserveRole === role && (
              <RoleReserveForm
                eventId={eventId}
                autoFocus={editorAutoFocus}
                role={role}
                index={i}
                reservedTags={reservedTags}
                assignedOnly={assignedOnly}
                value={reserveValue}
                onValueChange={setReserveValue}
                assignedOnlyValue={assignedOnlyValue}
                onAssignedOnlyChange={setAssignedOnlyValue}
                busyRole={roleActionBusy}
                onBusyRoleChange={setRoleActionBusy}
                onActionError={setRoleActionError}
                onClose={closeReserve}
                setShifts={setShifts}
                onAnnounce={onAnnounce}
              />
            )}
            {overlapRole === role && (
              <RoleOverlapForm
                eventId={eventId}
                autoFocus={editorAutoFocus}
                role={role}
                index={i}
                overlapAllowed={cumulable}
                value={overlapValue}
                onValueChange={setOverlapValue}
                busyRole={roleActionBusy}
                onBusyRoleChange={setRoleActionBusy}
                onActionError={setRoleActionError}
                onClose={closeOverlap}
                setShifts={setShifts}
                onAnnounce={onAnnounce}
              />
            )}
            {mealRole === role && mealOnTheGoShown && (
              <RoleMealForm
                eventId={eventId}
                autoFocus={editorAutoFocus}
                role={role}
                index={i}
                saved={meal}
                value={mealValue}
                onValueChange={setMealValue}
                busyRole={roleActionBusy}
                onBusyRoleChange={setRoleActionBusy}
                onActionError={setRoleActionError}
                onClose={closeMeal}
                setShifts={setShifts}
                onAnnounce={onAnnounce}
              />
            )}
            {sectorRole === role && sectorsInUse && (
              <RoleSectorForm
                eventId={eventId}
                autoFocus={editorAutoFocus}
                role={role}
                index={i}
                sectorId={sectorOfRole(role)}
                sectors={liveSectors}
                value={sectorValue}
                onValueChange={setSectorValue}
                busyRole={roleActionBusy}
                onBusyRoleChange={setRoleActionBusy}
                onClose={closeSector}
                setShifts={setShifts}
                onAnnounce={onAnnounce}
                placeAfter={(next) => placeAfterMove(role, next)}
              />
            )}
            {limitRole === role && (
              <RoleLimitForm
                eventId={eventId}
                autoFocus={editorAutoFocus}
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
                index={i}
                colorKey={roleColorOf(role)}
                busy={isBusy}
                onClose={closeColorPicker}
                onBusyRoleChange={setRoleActionBusy}
                onActionError={setRoleActionError}
                setShifts={setShifts}
                onAnnounce={onAnnounce}
              />
            )}
          </li>
          )
        })}
      </ol>
    )
  }

  return (
    <div id={panelId} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div>
        {/* Focused by code only, when the row whose button should get focus back is gone. */}
        <h2 ref={headingRef} tabIndex={-1} className="font-semibold text-gray-800 focus:outline-none">{managePostesLabel(sectorsState ? { sectorsEnabled: sectorsState.enabled, sectorsAdoptedAt: sectorsState.adoptedAt } : null)}</h2>
        <p className="text-xs text-gray-500 mt-0.5">Réordonnez avec les flèches Monter et Descendre ou par glisser-déposer, puis enregistrez l&apos;ordre. Vous pouvez aussi renommer un poste, limiter le nombre de créneaux par personne, réserver un poste à certains membres ou à l&apos;organisation, le rendre cumulable avec un autre créneau ou le supprimer (avec tous ses créneaux).</p>
      </div>
      {roleActionError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{roleActionError}</p>
      )}
      {sectorsShown && sectorsState && setSectorsState ? (
        <>
          <SectorsSection
            eventId={eventId}
            panelId={panelId}
            state={sectorsState}
            setState={setSectorsState}
            shifts={shifts}
            setShifts={setShifts}
            groups={grouped ? roleGroups : []}
            renderPostes={renderRoleList}
            onAddPoste={(sector, opener) => onAddPoste?.(sector, opener)}
            fallbackFocus={() => headingRef.current}
            onAnnounce={onAnnounce}
            onRequestConfirm={onRequestDelete}
            onConfirmBusy={onDeletingChange}
            onConfirmError={onDeleteError}
            onConfirmDone={() => onConfirmDone?.()}
            // A poste editor offering an archived sector closes; its value would be refused.
            onSectorGone={(id) => { if (sectorValue === id) setSectorRole(null) }}
          />
          {/* Before the first sector, the postes follow under their own heading (outline). */}
          {!grouped && roles.length > 0 && (
            <div>
              <h3 className="sr-only">Postes</h3>
              <PosteRows render={renderRoleList} group={roleGroups[0]} />
            </div>
          )}
        </>
      ) : <PosteRows render={renderRoleList} group={roleGroups[0]} />}
      <div className="flex gap-3">
        {roles.length > 0 && (
          <button type="button" onClick={saveRoleOrder} aria-disabled={savingOrder || undefined}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 aria-disabled:opacity-50">
            Enregistrer l'ordre
          </button>
        )}
        <button type="button" onClick={onRequestClose ?? onClose}
          className="text-gray-500 px-3 py-2 text-sm hover:text-gray-800">
          Fermer
        </button>
      </div>
    </div>
  )
}
