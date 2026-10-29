"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { requestJson } from "@/lib/use-submit"
import { focusFirstAvailable, type FocusCandidate } from "@/lib/focus-return"
import { orderedPlaces, PLACE_NAME_MAX } from "@/lib/places"

/** A place as the shifts page holds it. */
export type AdminPlace = { id: string; name: string; displayOrder: number; archivedAt: string | null }

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const smallButton = `text-xs font-medium min-h-6 rounded-md aria-disabled:opacity-50 ${focusRing}`
const toAdmin = (p: { id: string; name: string; displayOrder: number; archivedAt: string | Date | null }): AdminPlace =>
  ({ id: p.id, name: p.name, displayOrder: p.displayOrder, archivedAt: p.archivedAt ? new Date(p.archivedAt).toISOString() : null })

/**
 * « Lieux des missions » (#1171, lot 2) on the shifts page, where the workload protection can be
 * used: the places missions happen at (a stage, a tent, a depot), for its travel margin. Add,
 * rename, archive, restore; never deleted, no confirmation (archiving changes no shift: an archived
 * place stays on its shifts, still checked, and is no longer offered for others). Mechanics of the
 * sectors section: keyed rows, inline rename (Enter saves, Escape cancels), errors under the input
 * with role=alert, focus handed to the next sensible control when a row leaves its list, outcomes
 * announced through the page's status.
 */
export default function PlacesSection({ eventId, places, setPlaces, onAnnounce }: {
  eventId: string
  places: AdminPlace[]
  setPlaces: React.Dispatch<React.SetStateAction<AdminPlace[]>>
  onAnnounce: (text: string) => void
}) {
  const ordered = orderedPlaces(places)
  const active = ordered.filter((p) => !p.archivedAt)
  const archived = ordered.filter((p) => p.archivedAt)
  const [newName, setNewName] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameError, setRenameError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // A failed archive or restore, under its row (role=alert), until the next action.
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const pendingFocus = useRef<FocusCandidate[] | null>(null)
  const byId = (id: string) => () => document.getElementById(id)

  // Arriving from the protection card's link (#lieux): the browser scrolls, focus lands on the heading.
  useEffect(() => { if (window.location.hash === "#lieux") headingRef.current?.focus() }, [])

  // A row that changed list (archived, restored) or a closed rename hands focus over after render.
  useLayoutEffect(() => {
    if (!pendingFocus.current) return
    const candidates = pendingFocus.current
    pendingFocus.current = null
    focusFirstAvailable([...candidates, addInputRef.current, headingRef.current])
  })

  async function add() {
    if (adding) return
    const name = newName.replace(/\s+/g, " ").trim()
    if (!name) {
      setAddError(`Indiquez le nom du lieu (${PLACE_NAME_MAX} caractères au plus).`)
      addInputRef.current?.focus()
      return
    }
    setAdding(true)
    setAddError(null)
    const outcome = await requestJson<{ place: AdminPlace }>(() => fetch(`/api/admin/events/${eventId}/places`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    }), "Le lieu n'a pas pu être ajouté. Réessayez.")
    setAdding(false)
    if (!outcome.ok) { setAddError(outcome.error); return }
    setPlaces((prev) => [...prev, toAdmin(outcome.data.place)])
    setNewName("")
    onAnnounce(`Lieu « ${outcome.data.place.name} » ajouté.`)
  }

  function startRename(p: AdminPlace) {
    setRenaming(p.id)
    setRenameValue(p.name)
    setRenameError(null)
  }

  function closeRename(p: AdminPlace) {
    setRenaming(null)
    setRenameError(null)
    pendingFocus.current = [byId(`place-rename-btn-${p.id}`)]
  }

  async function patch(p: AdminPlace, body: { name?: string; archived?: boolean }): Promise<AdminPlace | string> {
    setBusy(p.id)
    const outcome = await requestJson<{ place: AdminPlace }>(() => fetch(`/api/admin/events/${eventId}/places/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), "La modification n'a pas pu être enregistrée. Réessayez.")
    setBusy(null)
    if (!outcome.ok) return outcome.error
    const saved = toAdmin(outcome.data.place)
    setPlaces((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
    return saved
  }

  async function submitRename(p: AdminPlace) {
    if (busy) return
    const name = renameValue.replace(/\s+/g, " ").trim()
    const focusInput = () => document.getElementById(`place-rename-${p.id}`)?.focus()
    if (!name) { setRenameError(`Indiquez le nom du lieu (${PLACE_NAME_MAX} caractères au plus).`); focusInput(); return }
    if (name === p.name) { closeRename(p); return }
    const result = await patch(p, { name })
    if (typeof result === "string") { setRenameError(result); focusInput(); return }
    closeRename(p)
    onAnnounce(`Lieu « ${p.name} » renommé en « ${result.name} ».`)
  }

  async function archive(p: AdminPlace) {
    if (busy) return
    const i = active.findIndex((x) => x.id === p.id)
    const next = active[i + 1], prev = active[i - 1]
    setRowError(null)
    const result = await patch(p, { archived: true })
    if (typeof result === "string") { setRowError({ id: p.id, text: result }); return }
    pendingFocus.current = [next && byId(`place-rename-btn-${next.id}`), prev && byId(`place-rename-btn-${prev.id}`), byId(`place-restore-${p.id}`)]
    onAnnounce(`Lieu « ${p.name} » archivé. Les créneaux qui l'ont le gardent et restent vérifiés ; il n'est plus proposé pour les autres.`)
  }

  async function restore(p: AdminPlace) {
    if (busy) return
    setRowError(null)
    const result = await patch(p, { archived: false })
    if (typeof result === "string") { setRowError({ id: p.id, text: result }); return }
    pendingFocus.current = [byId(`place-rename-btn-${p.id}`)]
    onAnnounce(`Lieu « ${p.name} » rétabli.`)
  }

  return (
    <section id="lieux" aria-labelledby="places-title" className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 scroll-mt-6" data-places-section="1">
      <h2 id="places-title" ref={headingRef} tabIndex={-1} className={`text-base font-semibold text-gray-900 rounded ${focusRing}`}>
        Lieux des missions <span className="ml-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">bêta</span>
      </h2>
      <p className="text-xs text-gray-600">
        Les lieux où se passent les missions (une scène, un chapiteau, un dépôt), pour la marge de trajet de la protection des pauses et de la charge. Chaque créneau en reçoit un dans sa fiche. Les bénévoles ne voient pas ces lieux : ils lisent le lieu de rendez-vous de chaque créneau.
      </p>

      {active.length === 0 ? (
        <p className="text-sm text-gray-700">Aucun lieu pour l&apos;instant.</p>
      ) : (
        <ul role="list" className="divide-y divide-gray-100">
          {active.map((p) => (
            <li key={p.id} className="py-2">
              {renaming === p.id ? (
                <form
                  noValidate
                  onSubmit={(e) => { e.preventDefault(); void submitRename(p) }}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeRename(p) } }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <label className="sr-only" htmlFor={`place-rename-${p.id}`}>Nouveau nom du lieu « {p.name} »</label>
                  <input
                    id={`place-rename-${p.id}`}
                    autoFocus
                    className="input max-w-64"
                    value={renameValue}
                    maxLength={PLACE_NAME_MAX}
                    aria-invalid={renameError ? true : undefined}
                    aria-describedby={renameError ? `place-rename-error-${p.id}` : undefined}
                    onChange={(e) => { setRenameValue(e.target.value); setRenameError(null) }}
                  />
                  <button type="submit" aria-disabled={busy !== null || undefined} className={`text-blue-700 hover:text-blue-900 ${smallButton}`}>Valider</button>
                  <button type="button" onClick={() => closeRename(p)} className={`text-gray-600 hover:text-gray-900 ${smallButton}`}>Annuler</button>
                  {renameError && <p id={`place-rename-error-${p.id}`} role="alert" className="basis-full text-sm text-red-700">{renameError}</p>}
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm text-gray-900 [overflow-wrap:anywhere] min-w-0">{p.name}</span>
                  <button id={`place-rename-btn-${p.id}`} type="button" onClick={() => startRename(p)} aria-label={`Renommer le lieu ${p.name}`} aria-disabled={busy !== null || undefined} className={`text-gray-600 hover:text-blue-600 ${smallButton}`}>Renommer</button>
                  <button type="button" onClick={() => void archive(p)} aria-label={`Archiver le lieu ${p.name}`} aria-disabled={busy !== null || undefined} aria-describedby={rowError?.id === p.id ? `place-row-error-${p.id}` : undefined} className={`text-gray-600 hover:text-blue-600 ${smallButton}`}>Archiver</button>
                  {rowError?.id === p.id && <p id={`place-row-error-${p.id}`} role="alert" className="basis-full text-sm text-red-700">{rowError.text}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form noValidate onSubmit={(e) => { e.preventDefault(); void add() }} className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="place-new" className="block text-xs font-medium text-gray-700 mb-1">Nouveau lieu</label>
          <input
            id="place-new"
            ref={addInputRef}
            className="input max-w-64"
            value={newName}
            maxLength={PLACE_NAME_MAX}
            aria-invalid={addError ? true : undefined}
            aria-describedby={addError ? "place-new-error" : undefined}
            onChange={(e) => { setNewName(e.target.value); setAddError(null) }}
          />
        </div>
        <button type="submit" aria-disabled={adding || undefined} className={`min-h-11 sm:min-h-6 rounded-xl border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 ${adding ? "opacity-60" : ""} ${focusRing}`}>
          {adding ? "Enregistrement…" : "Ajouter le lieu"}
        </button>
        {addError && <p id="place-new-error" role="alert" className="basis-full text-sm text-red-700">{addError}</p>}
      </form>

      {archived.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Lieux archivés</h3>
          <ul role="list" className="divide-y divide-gray-100">
            {archived.map((p) => (
              <li key={p.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm text-gray-700 [overflow-wrap:anywhere] min-w-0">{p.name}</span>
                <button id={`place-restore-${p.id}`} type="button" onClick={() => void restore(p)} aria-label={`Rétablir le lieu ${p.name}`} aria-disabled={busy !== null || undefined} aria-describedby={rowError?.id === p.id ? `place-row-error-${p.id}` : undefined} className={`text-gray-600 hover:text-blue-600 ${smallButton}`}>Rétablir</button>
                {rowError?.id === p.id && <p id={`place-row-error-${p.id}`} role="alert" className="basis-full text-sm text-red-700">{rowError.text}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
