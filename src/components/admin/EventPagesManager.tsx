"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useId, useRef } from "react"
import { flushSync } from "react-dom"
import { announce } from "@/lib/announce"
import { deletePageRecap } from "@/lib/action-recap"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import FormStatus from "@/components/FormStatus"
import { requestJson, useSubmit } from "@/lib/use-submit"
import ModalShell from "./ModalShell"

export type EventPageRow = {
  id: string
  slug: string
  title: string
  content: string
  displayOrder: number
}

export default function EventPagesManager({ eventId, initialPages }: { eventId: string; initialPages: EventPageRow[] }) {
  const [pages, setPages] = useState(initialPages)
  const [editing, setEditing] = useState<EventPageRow | "new" | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [savingOrder, setSavingOrder] = useState(false)
  // Deletion goes through a confirmation (#379); its failure stays in the dialog.
  const [pendingDelete, setPendingDelete] = useState<EventPageRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // Outcome of a move or a deletion: visible when it is an error, voiced in both cases.
  const [outcome, setOutcome] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const outcomeRef = useRef<HTMLParagraphElement>(null)
  const listId = useId()

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= pages.length || savingOrder) return
    const previous = pages
    const moved = pages[index]
    const next = [...pages]
    ;[next[index], next[target]] = [next[target], next[index]]
    // The row moves in the DOM, which blurs its button: commit, then put the focus back on the
    // arrow that was pressed, or on the opposite one when the page has reached an end.
    flushSync(() => { setPages(next); setOutcome(null); setSavingOrder(true) })
    focusArrow(moved.id, direction, target === (direction === -1 ? 0 : next.length - 1))
    const result = await requestJson(() => fetch(`/api/admin/events/${eventId}/pages/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageIds: next.map((p) => p.id) }),
    }), "L'ordre n'a pas pu être enregistré.")
    setSavingOrder(false)
    // The order shown must be the one saved: put it back and say so.
    if (!result.ok) {
      flushSync(() => { setPages(previous); setOutcome({ kind: "error", text: `${result.error} « ${moved.title} » reste à sa place.` }) })
      outcomeRef.current?.focus()
      return
    }
    announce(setAnnouncement, `« ${moved.title} » déplacée.`)
  }

  function focusArrow(pageId: string, direction: -1 | 1, atEnd: boolean) {
    const wanted = atEnd ? -direction : direction
    document.getElementById(`${listId}-${pageId}-${wanted === -1 ? "up" : "down"}`)?.focus()
  }

  function handleDelete(page: EventPageRow) {
    setDeleteError(null)
    setPendingDelete(page)
  }

  async function runDelete(page: EventPageRow) {
    setDeleting(true)
    setDeleteError(null)
    const result = await requestJson(() => fetch(`/api/admin/events/${eventId}/pages/${page.id}`, { method: "DELETE" }), `Impossible de supprimer la page « ${page.title} ».`)
    setDeleting(false)
    if (!result.ok) { setDeleteError(result.error); return }
    // The row's button that opened the dialog disappears with it: park the focus on the outcome.
    flushSync(() => {
      setPendingDelete(null)
      setPages((prev) => prev.filter((p) => p.id !== page.id))
      setOutcome({ kind: "ok", text: `Page « ${page.title} » supprimée.` })
    })
    outcomeRef.current?.focus()
  }

  function handleSaved(page: EventPageRow, isNew: boolean) {
    setPages((prev) => (isNew ? [...prev, page] : prev.map((p) => (p.id === page.id ? page : p))))
    announce(setAnnouncement, isNew ? `Page « ${page.title} » créée.` : `Page « ${page.title} » enregistrée.`)
    setEditing(null)
  }

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
      {pendingDelete && (
        <ConfirmActionModal recap={deletePageRecap(pendingDelete.title)} busy={deleting} error={deleteError} onConfirm={() => void runDelete(pendingDelete)} onCancel={() => setPendingDelete(null)} />
      )}
      <p
        ref={outcomeRef}
        tabIndex={-1}
        role={outcome?.kind === "error" ? "alert" : "status"}
        className={outcome ? `text-sm rounded-xl px-3 py-2 border focus:outline-none ${outcome.kind === "error" ? "text-red-800 bg-red-50 border-red-200" : "text-gray-800 bg-green-50 border-green-200"}` : "sr-only"}
      >
        {outcome?.text ?? ""}
      </p>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {pages.length === 0 ? "Aucune page pour l'instant." : `${pages.length} page${pages.length > 1 ? "s" : ""}`}
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Ajouter une page
        </button>
      </div>

      {pages.length > 0 && (
        <ul className="space-y-2">
          {pages.map((page, i) => (
            <li key={page.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{page.title}</p>
                <p className="text-xs text-gray-400">/{page.slug}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  id={`${listId}-${page.id}-up`}
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-disabled={savingOrder || undefined}
                  aria-label={`Monter « ${page.title} »`}
                  className="border border-gray-200 rounded-full w-8 h-8 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30 transition-colors"
                >
                  ↑
                </button>
                <button
                  type="button"
                  id={`${listId}-${page.id}-down`}
                  onClick={() => move(i, 1)}
                  disabled={i === pages.length - 1}
                  aria-disabled={savingOrder || undefined}
                  aria-label={`Descendre « ${page.title} »`}
                  className="border border-gray-200 rounded-full w-8 h-8 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30 transition-colors"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(page)}
                  className="text-xs border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors ml-2"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(page)}
                  aria-label={`Supprimer la page « ${page.title} »`}
                  className="text-xs text-red-700 px-3 py-1.5 rounded-full hover:bg-red-50 transition-colors"
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <PageFormModal
          eventId={eventId}
          page={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(page) => handleSaved(page, editing === "new")}
        />
      )}
    </div>
  )
}

function PageFormModal({
  eventId, page, onClose, onSaved,
}: {
  eventId: string
  page: EventPageRow | null
  onClose: () => void
  onSaved: (page: EventPageRow) => void
}) {
  const [title, setTitle] = useState(page?.title ?? "")
  const [content, setContent] = useState(page?.content ?? "")
  const { submit: run, busy: saving, error, fail, isInvalid } = useSubmit()
  const titleId = useId()
  const contentId = useId()
  const errorId = useId()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { fail("Indiquez le titre de la page.", "title", document.getElementById(titleId)); return }
    const url = page ? `/api/admin/events/${eventId}/pages/${page.id}` : `/api/admin/events/${eventId}/pages`
    const outcome = await run<EventPageRow>(() => fetch(url, {
      method: page ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content }),
    }), { silent: true })
    if (!outcome.ok) {
      fail(outcome.error, outcome.status === 400 ? "title" : undefined, outcome.status === 400 ? document.getElementById(titleId) : null)
      return
    }
    onSaved(outcome.data)
  }

  return (
    <ModalShell title={page ? "Modifier la page" : "Nouvelle page"} busy={saving} onClose={() => { if (!saving) onClose() }} panelClassName="max-w-2xl">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor={titleId} className="block text-sm text-gray-700 mb-1">Titre *</label>
          <input
            id={titleId}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={isInvalid("title")}
            aria-describedby={isInvalid("title") ? errorId : undefined}
            maxLength={120}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor={contentId} className="block text-sm text-gray-700 mb-1">
            Contenu (Markdown : **gras**, listes avec « - », titres avec #, liens [texte](url))
          </label>
          <textarea
            id={contentId}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            maxLength={20000}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono"
          />
        </div>
        <FormStatus error={error} errorId={errorId} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { if (!saving) onClose() }} aria-disabled={saving || undefined} className="text-sm text-gray-600 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button
            type="submit"
            aria-disabled={saving || undefined}
            className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 aria-disabled:cursor-wait transition-colors"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
