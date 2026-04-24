"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

type Show = { name: string; date: string; startTime: string; endTime: string }

type EventFormData = {
  title: string
  description: string
  location: string
  startDate: string
  endDate: string
  publicInstructions: string
  confirmationMessage: string
  publicStatus: "draft" | "published" | "archived"
}

type Props = {
  initialData?: Partial<EventFormData> & { id?: string; showSchedule?: Show[] }
}

const defaultData: EventFormData = {
  title: "",
  description: "",
  location: "",
  startDate: "",
  endDate: "",
  publicInstructions: "",
  confirmationMessage: "Merci pour votre inscription ! À bientôt.",
  publicStatus: "draft",
}

const emptyShow: Show = { name: "", date: "", startTime: "", endTime: "" }
const inputCls = "w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function EventForm({ initialData }: Props) {
  const router = useRouter()
  const isEdit = !!initialData?.id

  const [form, setForm]       = useState<EventFormData>({ ...defaultData, ...initialData })
  const [shows, setShows]     = useState<Show[]>(initialData?.showSchedule ?? [])
  const [newShow, setNewShow] = useState<Show>(emptyShow)
  const [addingShow, setAddingShow] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editShow, setEditShow]     = useState<Show>(emptyShow)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null)

  const mounted = useRef(false)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2500)
  }

  // Auto-save in edit mode with 800ms debounce
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    if (!isEdit || !form.title) return

    const timer = setTimeout(async () => {
      setSaving(true)
      const res = await fetch(`/api/admin/events/${initialData!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, showSchedule: shows }),
      })
      setSaving(false)
      if (res.ok) showToast("Enregistré ✓")
      else {
        console.error("Save error:", res.status)
        showToast("Erreur lors de la sauvegarde", false)
      }
    }, 800)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, shows])

  function set(field: keyof EventFormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function setShow(field: keyof Show, value: string) {
    setNewShow((s) => ({ ...s, [field]: value }))
  }

  function addShow() {
    if (!newShow.name || !newShow.date || !newShow.startTime || !newShow.endTime) return
    setShows((prev) =>
      [...prev, newShow].sort(
        (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
      )
    )
    setNewShow(emptyShow)
    setAddingShow(false)
  }

  function removeShow(idx: number) {
    setShows((prev) => prev.filter((_, i) => i !== idx))
  }

  function startEditShow(idx: number) {
    setEditingIdx(idx)
    setEditShow(shows[idx])
    setAddingShow(false)
  }

  function confirmEditShow() {
    if (!editShow.name || !editShow.date || !editShow.startTime || !editShow.endTime) return
    setShows((prev) =>
      prev.map((s, i) => (i === editingIdx ? editShow : s))
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    )
    setEditingIdx(null)
  }

  // Create mode: manual submit
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, showSchedule: shows }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) { setError("Erreur lors de la création."); return }
    router.push(`/admin/events/${data.id}`)
    router.refresh()
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${toast.ok ? "bg-green-500" : "bg-red-500"}`}>
          {toast.msg}
        </div>
      )}

      <form onSubmit={isEdit ? (e) => e.preventDefault() : handleCreate} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">

        {/* Saving indicator (edit mode) */}
        {isEdit && (
          <div className="flex justify-end -mb-3">
            <span className={`text-xs transition-opacity ${saving ? "text-gray-400 opacity-100" : "opacity-0"}`}>
              Sauvegarde…
            </span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
          <input type="text" required value={form.title} onChange={(e) => set("title", e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} className={`${inputCls} resize-none`} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
          <input type="text" value={form.location} onChange={(e) => set("location", e.target.value)} className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date début *</label>
            <input type="date" required value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date fin *</label>
            <input type="date" required value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Spectacles */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Spectacles</label>
            {!addingShow && (
              <button type="button" onClick={() => setAddingShow(true)} className="text-xs text-blue-600 hover:underline">
                + Ajouter
              </button>
            )}
          </div>

          {shows.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {shows.map((show, i) =>
                editingIdx === i ? (
                  <div key={i} className="border border-blue-200 rounded-xl p-3 space-y-2.5 bg-blue-50/40">
                    <input
                      type="text"
                      placeholder="Nom du spectacle"
                      value={editShow.name}
                      onChange={(e) => setEditShow((s) => ({ ...s, name: e.target.value }))}
                      className={inputCls}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Date</label>
                        <input type="date" value={editShow.date} onChange={(e) => setEditShow((s) => ({ ...s, date: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Début</label>
                        <input type="time" value={editShow.startTime} onChange={(e) => setEditShow((s) => ({ ...s, startTime: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Fin</label>
                        <input type="time" value={editShow.endTime} onChange={(e) => setEditShow((s) => ({ ...s, endTime: e.target.value }))} className={inputCls} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={confirmEditShow}
                        className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                        Confirmer
                      </button>
                      <button type="button" onClick={() => setEditingIdx(null)}
                        className="text-sm text-gray-500 hover:text-gray-800 px-2">
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                    <span className="text-[11px] text-indigo-400 font-mono whitespace-nowrap">
                      {show.date} · {show.startTime}–{show.endTime}
                    </span>
                    <span className="flex-1 text-sm text-indigo-800 truncate">{show.name}</span>
                    <button type="button" onClick={() => startEditShow(i)} className="text-indigo-300 hover:text-indigo-600 flex-shrink-0 text-xs">✎</button>
                    <button type="button" onClick={() => removeShow(i)} className="text-indigo-300 hover:text-red-400 flex-shrink-0 text-xs">✕</button>
                  </div>
                )
              )}
            </div>
          )}

          {shows.length === 0 && !addingShow && (
            <p className="text-xs text-gray-400 mb-2">Aucun spectacle configuré.</p>
          )}

          {addingShow && (
            <div className="border border-blue-200 rounded-xl p-3 space-y-2.5 bg-blue-50/40">
              <input
                type="text"
                placeholder="Nom du spectacle"
                value={newShow.name}
                onChange={(e) => setShow("name", e.target.value)}
                className={inputCls}
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input type="date" value={newShow.date} onChange={(e) => setShow("date", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Début</label>
                  <input type="time" value={newShow.startTime} onChange={(e) => setShow("startTime", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fin</label>
                  <input type="time" value={newShow.endTime} onChange={(e) => setShow("endTime", e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={addShow}
                  className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                  Ajouter
                </button>
                <button type="button" onClick={() => { setAddingShow(false); setNewShow(emptyShow) }}
                  className="text-sm text-gray-500 hover:text-gray-800 px-2">
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Instructions publiques</label>
          <textarea rows={2} value={form.publicInstructions} onChange={(e) => set("publicInstructions", e.target.value)}
            placeholder="Texte affiché aux bénévoles en haut de la page"
            className={`${inputCls} resize-none`} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message de confirmation</label>
          <textarea rows={2} value={form.confirmationMessage} onChange={(e) => set("confirmationMessage", e.target.value)}
            className={`${inputCls} resize-none`} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
          <select value={form.publicStatus} onChange={(e) => set("publicStatus", e.target.value)} className={inputCls}>
            <option value="draft">Brouillon (non visible)</option>
            <option value="published">Publié (visible)</option>
            <option value="archived">Archivé</option>
          </select>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

        <div className="flex gap-3 pt-2">
          {!isEdit && (
            <button type="submit" disabled={saving}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {saving ? "Création…" : "Créer l'événement"}
            </button>
          )}
          <button type="button" onClick={() => router.back()} className="text-gray-500 px-4 py-2.5 text-sm hover:text-gray-800">
            ← Retour
          </button>
        </div>

      </form>
    </>
  )
}
