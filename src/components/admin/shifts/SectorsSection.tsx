"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { requestJson } from "@/lib/use-submit"
import { archiveSectorRecap, type ActionRecap } from "@/lib/action-recap"
import { focusFirstAvailable, type FocusCandidate } from "@/lib/focus-return"
import { roleSectorOf } from "@/lib/role-settings"
import {
  activeSectors, archivedSectors, moveSector, postesCount, SECTOR_NAME_MAX, SECTORS_ADOPTED_NOTICE, SECTORS_FIRST_SAVE_NOTICE, sectorsAdopted,
} from "@/lib/sectors"
import type { AdminSector, AdminSectorsState } from "../ShiftsManager"
import type { RawShift } from "./types"

type SectorRow = { id: string; name: string; displayOrder: number; archivedAt: string | null }
const toAdmin = (s: { id: string; name: string; displayOrder: number; archivedAt: string | Date | null }): AdminSector =>
  ({ id: s.id, name: s.name, displayOrder: s.displayOrder, archivedAt: s.archivedAt ? new Date(s.archivedAt).toISOString() : null })

/**
 * « Secteurs » in « Gérer les postes » (#1147, beta): create, rename, reorder (saved at once) and
 * archive the event's sectors, restore an archived one. Shown while the event option is on or the
 * event adopted sectors. Before the first sector, the add form says that saving it keeps the
 * sector organisation for the event; afterwards, that it can no longer be turned off.
 *
 * Focus: every row is keyed by its sector, so a moved row keeps the focus; a row that disappears
 * (archived, restored) hands it to the next sensible control, never to <body>.
 */
export default function SectorsSection({
  eventId, state, setState, shifts, setShifts, onAnnounce, onRequestConfirm, onConfirmBusy, onConfirmError, onConfirmDone, onSectorGone,
}: {
  eventId: string
  state: AdminSectorsState
  setState: React.Dispatch<React.SetStateAction<AdminSectorsState | null>>
  shifts: RawShift[]
  setShifts: React.Dispatch<React.SetStateAction<RawShift[]>>
  onAnnounce: (text: string) => void
  onRequestConfirm: (pending: { recap: ActionRecap; run: () => Promise<void> }) => void
  onConfirmBusy: (busy: boolean) => void
  onConfirmError: (error: string) => void
  onConfirmDone: () => void
  /** A sector left the active list (archived): the panel closes a poste editor that offered it. */
  onSectorGone: (id: string) => void
}) {
  const adopted = sectorsAdopted({ sectorsEnabled: state.enabled, sectorsAdoptedAt: state.adoptedAt })
  const active = activeSectors(state.sectors)
  const archived = archivedSectors(state.sectors)

  const [newName, setNewName] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameError, setRenameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const headingRef = useRef<HTMLHeadingElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const setButton = (key: string) => (el: HTMLButtonElement | null) => { if (el) buttons.current.set(key, el); else buttons.current.delete(key) }
  const [focusRequest, setFocusRequest] = useState<{ candidates: FocusCandidate[] } | null>(null)
  useLayoutEffect(() => {
    if (focusRequest) focusFirstAvailable(focusRequest.candidates)
  }, [focusRequest])

  // Postes per active sector, read like everywhere else (roleSectorOf, over the live shifts).
  const postesOf = new Map<string, number>()
  for (const role of new Set(shifts.filter((s) => s.status !== "cancelled").map((s) => s.roleName))) {
    const id = roleSectorOf(shifts.filter((s) => s.roleName === role && s.status !== "cancelled"))
    if (id) postesOf.set(id, (postesOf.get(id) ?? 0) + 1)
  }

  async function addSector() {
    if (adding) return
    const name = newName.trim()
    if (!name) { addInputRef.current?.focus(); setAddError("Indiquez le nom du secteur."); return }
    setAdding(true)
    setAddError(null)
    const outcome = await requestJson<{ sector: SectorRow; adopted: boolean }>(() => fetch(`/api/admin/events/${eventId}/sectors`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    }), "Le secteur n'a pas pu être enregistré.")
    setAdding(false)
    if (!outcome.ok) { setAddError(outcome.error); return }
    const { sector, adopted: first } = outcome.data
    setState((prev) => prev && { ...prev, adoptedAt: first ? new Date().toISOString() : prev.adoptedAt, sectors: [...prev.sectors, toAdmin(sector)] })
    setNewName("")
    // Focus stays in the cleared field, ready for the next sector.
    onAnnounce(`Secteur « ${sector.name} » ajouté.${first ? " Cet événement utilise maintenant des secteurs." : ""}`)
  }

  async function move(id: string, dir: "up" | "down") {
    if (busyId || renamingId === id) return
    const sector = active.find((s) => s.id === id)
    const order = moveSector(active.map((s) => s.id), id, dir)
    if (!sector) return
    if (!order) { onAnnounce(`${sector.name} est déjà en ${dir === "up" ? "première" : "dernière"} position.`); return }
    setBusyId(id)
    setError(null)
    const outcome = await requestJson<{ sectors: SectorRow[] }>(() => fetch(`/api/admin/events/${eventId}/sectors/reorder`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectorIds: order }),
    }), "L'ordre des secteurs n'a pas pu être enregistré.")
    setBusyId(null)
    if (!outcome.ok) { setError(outcome.error); return }
    setState((prev) => prev && { ...prev, sectors: outcome.data.sectors.map(toAdmin) })
    setFocusRequest({ candidates: [() => buttons.current.get(`${dir}:${id}`), () => buttons.current.get(`${dir === "up" ? "down" : "up"}:${id}`), () => headingRef.current] })
    onAnnounce(`${sector.name} : position ${order.indexOf(id) + 1} sur ${order.length}.`)
  }

  function startRename(sector: AdminSector) {
    if (busyId) return
    setRenamingId(sector.id)
    setRenameValue(sector.name)
    setRenameError(null)
  }

  function cancelRename(id: string) {
    setRenamingId(null)
    setRenameError(null)
    setFocusRequest({ candidates: [() => buttons.current.get(`rename:${id}`), () => headingRef.current] })
  }

  async function submitRename(sector: AdminSector) {
    if (busyId) return
    const name = renameValue.trim()
    if (!name || name === sector.name) { cancelRename(sector.id); return }
    setBusyId(sector.id)
    const outcome = await requestJson<{ sector: SectorRow }>(() => fetch(`/api/admin/events/${eventId}/sectors/${sector.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    }), "Le secteur n'a pas pu être renommé.")
    setBusyId(null)
    if (!outcome.ok) { setRenameError(outcome.error); return }
    setState((prev) => prev && { ...prev, sectors: prev.sectors.map((s) => (s.id === sector.id ? toAdmin(outcome.data.sector) : s)) })
    setRenamingId(null)
    setFocusRequest({ candidates: [() => buttons.current.get(`rename:${sector.id}`), () => headingRef.current] })
    onAnnounce(`Secteur « ${sector.name} » renommé en « ${outcome.data.sector.name} ».`)
  }

  /** Where focus goes once a row left the active list: the next row's Archiver, the previous one's, the add field, the heading. */
  function focusAfterRemoval(index: number, ids: string[]) {
    const next = ids[index + 1]
    const prev = ids[index - 1]
    setFocusRequest({ candidates: [
      () => (next ? buttons.current.get(`archive:${next}`) : null),
      () => (prev ? buttons.current.get(`archive:${prev}`) : null),
      () => addInputRef.current,
      () => headingRef.current,
    ] })
  }

  async function runArchive(sector: AdminSector, postes: number, viaModal: boolean) {
    const ids = active.map((s) => s.id)
    const index = ids.indexOf(sector.id)
    if (viaModal) onConfirmBusy(true)
    setBusyId(sector.id)
    setError(null)
    const outcome = await requestJson<{ sector: SectorRow }>(() => fetch(`/api/admin/events/${eventId}/sectors/${sector.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: true, detachPostes: postes > 0 }),
    }), "Le secteur n'a pas pu être archivé.")
    setBusyId(null)
    if (viaModal) onConfirmBusy(false)
    if (!outcome.ok) {
      if (viaModal) onConfirmError(outcome.error)
      else setError(outcome.error)
      return
    }
    // The modal closes and the row goes in one commit; then focus is placed by hand (the Archiver
    // that opened the modal is gone).
    flushSync(() => {
      if (viaModal) onConfirmDone()
      onSectorGone(sector.id)
      setState((prev) => prev && { ...prev, sectors: prev.sectors.map((s) => (s.id === sector.id ? toAdmin(outcome.data.sector) : s)) })
      if (postes > 0) setShifts((prev) => prev.map((s) => (s.sectorId === sector.id ? { ...s, sectorId: null } : s)))
    })
    focusAfterRemoval(index, ids)
    onAnnounce(postes > 0 ? `Secteur « ${sector.name} » archivé ; ${postesCount(postes)} ${postes > 1 ? "passent" : "passe"} dans « Autres postes ».` : `Secteur « ${sector.name} » archivé.`)
  }

  function archive(sector: AdminSector) {
    if (busyId) return
    const postes = postesOf.get(sector.id) ?? 0
    if (postes === 0) { void runArchive(sector, 0, false); return }
    onRequestConfirm({ recap: archiveSectorRecap(sector.name, postes), run: () => runArchive(sector, postes, true) })
  }

  async function restore(sector: AdminSector) {
    if (busyId) return
    setBusyId(sector.id)
    setError(null)
    const outcome = await requestJson<{ sector: SectorRow }>(() => fetch(`/api/admin/events/${eventId}/sectors/${sector.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: false }),
    }), "Le secteur n'a pas pu être rétabli.")
    setBusyId(null)
    if (!outcome.ok) { setError(outcome.error); return }
    const remaining = archived.filter((s) => s.id !== sector.id)
    flushSync(() => {
      setState((prev) => prev && { ...prev, sectors: prev.sectors.map((s) => (s.id === sector.id ? toAdmin(outcome.data.sector) : s)) })
      if (remaining.length === 0) setShowArchived(false)
    })
    setFocusRequest({ candidates: [
      () => (remaining[0] ? buttons.current.get(`restore:${remaining[0].id}`) : null),
      () => buttons.current.get(`rename:${sector.id}`),
      () => headingRef.current,
    ] })
    onAnnounce(`Secteur « ${sector.name} » rétabli, sans poste.`)
  }

  const noticeId = `sectors-notice-${eventId}`
  const addErrorId = `sector-add-error-${eventId}`
  const archivedId = `sectors-archived-${eventId}`
  const small = "text-xs text-gray-600 hover:text-blue-700 min-h-6 px-1 rounded-md aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

  return (
    <section aria-labelledby={`sectors-heading-${eventId}`} className="space-y-3 rounded-xl border border-gray-200 p-4" data-sectors-section="1">
      <div>
        <h3 id={`sectors-heading-${eventId}`} ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-gray-800 focus:outline-none">
          Secteurs <span className="ml-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">bêta</span>
        </h3>
        <p className="text-xs text-gray-600 mt-0.5">Un secteur regroupe plusieurs postes, par exemple « Parking » pour « Parking Nord » et « Parking Mairie ». La frise et le PDF les rangent par secteur. Les bénévoles ne voient pas les secteurs. Monter et Descendre enregistrent l&apos;ordre des secteurs tout de suite.</p>
        <p id={noticeId} className="text-xs text-gray-800 mt-1">{adopted ? SECTORS_ADOPTED_NOTICE : SECTORS_FIRST_SAVE_NOTICE}</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {active.length > 0 && (
        <ol role="list" aria-label="Ordre des secteurs" className="space-y-1.5">
          {active.map((sector, i) => {
            const busy = busyId === sector.id
            const isRenaming = renamingId === sector.id
            const count = postesOf.get(sector.id) ?? 0
            return (
              <li key={sector.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                {active.length > 1 && (
                  <span className="flex gap-0.5 flex-shrink-0">
                    {(["up", "down"] as const).map((dir) => {
                      const atEnd = dir === "up" ? i === 0 : i === active.length - 1
                      return (
                        <button
                          key={dir}
                          ref={setButton(`${dir}:${sector.id}`)}
                          type="button"
                          onClick={() => move(sector.id, dir)}
                          aria-label={`${dir === "up" ? "Monter" : "Descendre"} le secteur ${sector.name}`}
                          aria-disabled={atEnd || !!busyId || isRenaming || undefined}
                          className="w-6 h-6 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-gray-900 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed forced-colors:aria-disabled:text-[GrayText] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d={dir === "up" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                          </svg>
                        </button>
                      )
                    })}
                  </span>
                )}
                {isRenaming ? (
                  <>
                    <label className="sr-only" htmlFor={`sector-rename-${sector.id}`}>Nouveau nom du secteur « {sector.name} »</label>
                    <input
                      id={`sector-rename-${sector.id}`}
                      type="text"
                      value={renameValue}
                      maxLength={SECTOR_NAME_MAX}
                      autoFocus
                      onChange={(e) => { setRenameValue(e.target.value); setRenameError(null) }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); void submitRename(sector) }
                        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelRename(sector.id) }
                      }}
                      aria-invalid={renameError ? true : undefined}
                      aria-describedby={renameError ? `sector-rename-error-${sector.id}` : undefined}
                      className="input flex-1 py-1"
                    />
                    <button type="button" onClick={() => void submitRename(sector)} aria-disabled={busy || undefined} className="text-xs text-blue-700 font-medium hover:text-blue-900 min-h-6 rounded-md aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Valider</button>
                    <button type="button" onClick={() => cancelRename(sector.id)} className="text-xs text-gray-600 hover:text-gray-900 min-h-6 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Annuler</button>
                    {renameError && <p id={`sector-rename-error-${sector.id}`} role="alert" className="basis-full text-xs text-red-700">{renameError}</p>}
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium text-gray-800 flex-1 min-w-[8rem] [overflow-wrap:anywhere]">
                      {sector.name}{" "}<span className="text-xs font-normal text-gray-600">· {postesCount(count)}</span>
                    </span>
                    <button ref={setButton(`rename:${sector.id}`)} type="button" onClick={() => startRename(sector)} aria-disabled={busy || undefined} aria-label={`Renommer le secteur ${sector.name}`} className={small}>Renommer</button>
                    <button ref={setButton(`archive:${sector.id}`)} type="button" onClick={() => archive(sector)} aria-disabled={busy || undefined} aria-label={`Archiver le secteur ${sector.name}`} className={small}>Archiver</button>
                  </>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <form noValidate onSubmit={(e) => { e.preventDefault(); void addSector() }} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-48">
          <label htmlFor={`sector-new-${eventId}`} className="block text-xs font-medium text-gray-700">Nouveau secteur</label>
          <input
            ref={addInputRef}
            id={`sector-new-${eventId}`}
            type="text"
            value={newName}
            maxLength={SECTOR_NAME_MAX}
            onChange={(e) => { setNewName(e.target.value); setAddError(null) }}
            aria-invalid={addError ? true : undefined}
            aria-describedby={addError ? `${noticeId} ${addErrorId}` : noticeId}
            className="input w-full py-1.5"
          />
        </div>
        <button type="submit" aria-disabled={adding || undefined} aria-describedby={noticeId} className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-sm font-medium hover:bg-blue-700 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          {adding ? "Enregistrement…" : "Ajouter le secteur"}
        </button>
        {addError && <p id={addErrorId} role="alert" className="basis-full text-xs text-red-700">{addError}</p>}
      </form>

      {archived.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived} aria-controls={showArchived ? archivedId : undefined} className={small}>
            Secteurs archivés ({archived.length})
          </button>
          {showArchived && (
            <ul id={archivedId} role="list" className="mt-1 space-y-1">
              {archived.map((sector) => (
                <li key={sector.id} className="flex flex-wrap items-center gap-3 px-3 py-1.5 text-sm text-gray-700">
                  <span className="flex-1 [overflow-wrap:anywhere]">{sector.name}</span>
                  <button ref={setButton(`restore:${sector.id}`)} type="button" onClick={() => void restore(sector)} aria-disabled={busyId === sector.id || undefined} aria-label={`Rétablir le secteur ${sector.name}`} className={small}>Rétablir</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
