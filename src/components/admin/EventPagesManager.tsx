"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { announce } from "@/lib/announce"
import { deletePageRecap } from "@/lib/action-recap"
import { focusFirstAvailable, isFocusDropped, type FocusCandidate } from "@/lib/focus-return"
import { movePageId, pageMoveBoundaryMessage, pageMoveMessage, PAGE_ORDER_FAILED, type MoveDirection } from "@/lib/page-order"
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

/** Ref callback body: keeps a map of buttons keyed by id while each is mounted (#554 pattern). */
function setButtonRef(map: Map<string, HTMLButtonElement>, key: string, el: HTMLButtonElement | null) {
  if (el) map.set(key, el)
  else map.delete(key)
}

/** Puts `rows` back in `order`; a row missing from `order` (added after it was captured) is kept, appended. */
function reorderByIds(rows: EventPageRow[], order: string[]): EventPageRow[] {
  const byId = new Map(rows.map((r) => [r.id, r] as const))
  const ordered = order.map((id) => byId.get(id)).filter((r): r is EventPageRow => !!r)
  const extra = rows.filter((r) => !order.includes(r.id))
  return [...ordered, ...extra]
}

export default function EventPagesManager({ eventId, initialPages }: { eventId: string; initialPages: EventPageRow[] }) {
  const [pages, setPages] = useState(initialPages)
  const [editing, setEditing] = useState<EventPageRow | "new" | null>(null)
  const [announcement, setAnnouncement] = useState("")
  // Deletion goes through a confirmation (#379); its failure stays in the dialog.
  const [pendingDelete, setPendingDelete] = useState<EventPageRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // Outcome of a failed reorder save or a deletion: visible when it is an error, voiced in both cases.
  const [outcome, setOutcome] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const outcomeRef = useRef<HTMLParagraphElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Monter / Descendre buttons, keyed `up:<id>` / `down:<id>`, and « Modifier », keyed by id (#605).
  const moveBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  const modifyBtnRefs = useRef(new Map<string, HTMLButtonElement>())

  // Focus to give back once React has committed a move or a reverted order (the #554 pattern).
  const [focusRequest, setFocusRequest] = useState<{ candidates: FocusCandidate[] } | null>(null)
  useLayoutEffect(() => {
    if (!focusRequest) return
    const active = document.activeElement
    const inList = isFocusDropped(active) || !!listRef.current?.contains(active)
    if (inList) focusFirstAvailable(focusRequest.candidates)
  }, [focusRequest])

  // Order last confirmed by the server, reverted to on a failed save (D10 option A): moves stay
  // possible while a save is in flight, saves are serialised, and a failure undoes every move made
  // since the last confirmed order rather than trying to keep the ones queued behind it.
  const confirmedOrderRef = useRef(initialPages.map((p) => p.id))
  const savingRef = useRef(false)
  const pendingOrderRef = useRef<string[] | null>(null)
  const lastPressRef = useRef<{ pageId: string; dir: MoveDirection } | null>(null)

  function focusMoveButtons(pageId: string, dir: MoveDirection) {
    setFocusRequest({ candidates: [
      () => moveBtnRefs.current.get(`${dir}:${pageId}`),
      () => moveBtnRefs.current.get(`${dir === "up" ? "down" : "up"}:${pageId}`),
      () => modifyBtnRefs.current.get(pageId),
    ] })
  }

  async function flushOrderSave() {
    if (savingRef.current) return
    const order = pendingOrderRef.current
    if (!order) return
    pendingOrderRef.current = null
    savingRef.current = true
    const result = await requestJson(() => fetch(`/api/admin/events/${eventId}/pages/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageIds: order }),
    }), PAGE_ORDER_FAILED)
    savingRef.current = false
    if (!result.ok) {
      const confirmed = confirmedOrderRef.current
      pendingOrderRef.current = null
      setPages((prev) => reorderByIds(prev, confirmed))
      setOutcome({ kind: "error", text: PAGE_ORDER_FAILED })
      const lastPress = lastPressRef.current
      if (lastPress) focusMoveButtons(lastPress.pageId, lastPress.dir)
      return
    }
    confirmedOrderRef.current = order
    if (pendingOrderRef.current) void flushOrderSave()
  }

  function move(pageId: string, dir: MoveDirection) {
    const page = pages.find((p) => p.id === pageId)
    if (!page) return
    setOutcome(null)
    const moved = movePageId(pages.map((p) => p.id), pageId, dir)
    if (!moved) { announce(setAnnouncement, pageMoveBoundaryMessage(page.title, dir)); return }
    const next = moved.roles.map((id) => pages.find((p) => p.id === id)!)
    setPages(next)
    lastPressRef.current = { pageId, dir }
    focusMoveButtons(pageId, dir)
    announce(setAnnouncement, pageMoveMessage(page.title, moved.index, next.length))
    pendingOrderRef.current = next.map((p) => p.id)
    void flushOrderSave()
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
    confirmedOrderRef.current = confirmedOrderRef.current.filter((id) => id !== page.id)
    flushSync(() => {
      setPendingDelete(null)
      setPages((prev) => prev.filter((p) => p.id !== page.id))
      setOutcome({ kind: "ok", text: `Page « ${page.title} » supprimée.` })
    })
    outcomeRef.current?.focus()
  }

  function handleSaved(page: EventPageRow, isNew: boolean) {
    if (isNew) confirmedOrderRef.current = [...confirmedOrderRef.current, page.id]
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
        <ul ref={listRef} role="list" aria-label="Ordre des pages" className="space-y-2">
          {pages.map((page, i) => (
            <li key={page.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{page.title}</p>
                <p className="text-xs text-gray-600"><span className="sr-only">Adresse : </span>/{page.slug}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {(["up", "down"] as const).map((dir) => {
                  const atEnd = dir === "up" ? i === 0 : i === pages.length - 1
                  return (
                    // aria-disabled, not disabled: the button just pressed keeps focus at an end (#605).
                    <button
                      key={dir}
                      ref={(el) => setButtonRef(moveBtnRefs.current, `${dir}:${page.id}`, el)}
                      type="button"
                      onClick={() => move(page.id, dir)}
                      aria-label={`${dir === "up" ? "Monter" : "Descendre"} la page « ${page.title} »`}
                      aria-disabled={atEnd || undefined}
                      className="border border-gray-200 rounded-full w-8 h-8 inline-flex items-center justify-center text-gray-700 hover:bg-gray-50 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent forced-colors:aria-disabled:text-[GrayText] transition-colors"
                    >
                      <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d={dir === "up" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                      </svg>
                    </button>
                  )
                })}
                <button
                  ref={(el) => setButtonRef(modifyBtnRefs.current, page.id, el)}
                  type="button"
                  onClick={() => setEditing(page)}
                  className="text-xs border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors ml-2"
                >
                  Modifier{" "}<span className="sr-only">la page « {page.title} »</span>
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
