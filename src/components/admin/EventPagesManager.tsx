"use client"

import { useState, useId } from "react"
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

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= pages.length) return
    const next = [...pages]
    ;[next[index], next[target]] = [next[target], next[index]]
    setPages(next)
    setAnnouncement(`« ${next[direction === -1 ? target : index].title} » déplacée.`)
    setSavingOrder(true)
    await fetch(`/api/admin/events/${eventId}/pages/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageIds: next.map((p) => p.id) }),
    })
    setSavingOrder(false)
  }

  async function handleDelete(page: EventPageRow) {
    if (!confirm(`Supprimer la page « ${page.title} » ?`)) return
    const res = await fetch(`/api/admin/events/${eventId}/pages/${page.id}`, { method: "DELETE" })
    if (res.ok) {
      setPages((prev) => prev.filter((p) => p.id !== page.id))
      setAnnouncement(`Page « ${page.title} » supprimée.`)
    }
  }

  function handleSaved(page: EventPageRow, isNew: boolean) {
    setPages((prev) => (isNew ? [...prev, page] : prev.map((p) => (p.id === page.id ? page : p))))
    setAnnouncement(isNew ? `Page « ${page.title} » créée.` : `Page « ${page.title} » enregistrée.`)
    setEditing(null)
  }

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {pages.length === 0 ? "Aucune page pour l'instant." : `${pages.length} page${pages.length > 1 ? "s" : ""}`}
        </p>
        <button
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
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || savingOrder}
                  aria-label={`Monter « ${page.title} »`}
                  className="border border-gray-200 rounded-full w-8 h-8 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30 transition-colors"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === pages.length - 1 || savingOrder}
                  aria-label={`Descendre « ${page.title} »`}
                  className="border border-gray-200 rounded-full w-8 h-8 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30 transition-colors"
                >
                  ↓
                </button>
                <button
                  onClick={() => setEditing(page)}
                  className="text-xs border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors ml-2"
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleDelete(page)}
                  className="text-xs text-red-600 px-3 py-1.5 rounded-full hover:bg-red-50 transition-colors"
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const contentId = useId()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const url = page ? `/api/admin/events/${eventId}/pages/${page.id}` : `/api/admin/events/${eventId}/pages`
    const res = await fetch(url, {
      method: page ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Une erreur est survenue.")
      return
    }
    onSaved(await res.json())
  }

  return (
    <ModalShell title={page ? "Modifier la page" : "Nouvelle page"} onClose={onClose} panelClassName="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={titleId} className="block text-sm text-gray-700 mb-1">Titre *</label>
          <input
            id={titleId}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
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
        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm text-gray-600 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
