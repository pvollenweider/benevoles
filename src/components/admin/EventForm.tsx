"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react"
import { ACCENT_KEYS, eventAccent } from "@/lib/event-accent"
import CoordinatesField from "@/components/admin/CoordinatesField"
import { useRouter } from "next/navigation"
import { WINDOW_ORDER_ERROR, localWindowOrderInvalid } from "@/lib/registration-window"
import { isCompleteTime, addMinutes } from "@/lib/gantt-utils"
import { LISTED_FIELD_HELP, LISTED_FIELD_LABEL, UNLISTED_HINT, visibilityLabel } from "@/lib/event-visibility"

type Show = { name: string; date: string; startTime: string; endTime: string }

type EventFormData = {
  title: string
  description: string
  location: string
  startDate: string
  endDate: string
  publicInstructions: string
  confirmationMessage: string
  reminderMessage: string
  publicStatus: "draft" | "published" | "archived"
  requirePhone: boolean
  /** Unlisted events (#414): false = reachable by link only. */
  isListed: boolean
  /** Accent colour of the public page (#300): a palette key, or null for the neutral header. */
  accentColorKey: string | null
  /** Registration window (#463): the switch, and local « YYYY-MM-DDTHH:MM » (empty = none). */
  registrationsOpen: boolean
  registrationOpensAt: string
  registrationClosesAt: string
  /** Coordinates of the place (#191), or null. */
  latitude: number | null
  longitude: number | null
}

type Props = {
  initialData?: Partial<EventFormData> & { id?: string; showSchedule?: Show[] }
  /** Where to go once created (create mode), `{id}` replaced; defaults to the event page. A
   *  string, not a function: this component is rendered from server pages. */
  createdHref?: string
  /** Organisation time zone, for the registration schedule (#463). */
  timeZone?: string
}

const defaultData: EventFormData = {
  title: "",
  description: "",
  location: "",
  startDate: "",
  endDate: "",
  publicInstructions: "",
  confirmationMessage: "Merci pour ton inscription ! À bientôt.",
  reminderMessage: "",
  publicStatus: "draft",
  requirePhone: false,
  isListed: true,
  accentColorKey: null,
  latitude: null,
  longitude: null,
  registrationsOpen: true,
  registrationOpensAt: "",
  registrationClosesAt: "",
}

const emptyShow: Show = { name: "", date: "", startTime: "", endTime: "" }
const inputCls = "w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"

export default function EventForm({ initialData, createdHref, timeZone = "Europe/Zurich" }: Props) {
  const router = useRouter()
  const isEdit = !!initialData?.id

  const [form, setForm]       = useState<EventFormData>({ ...defaultData, ...initialData })
  const windowOrderBad = localWindowOrderInvalid(form.registrationOpensAt, form.registrationClosesAt)
  const [shows, setShows]     = useState<Show[]>(initialData?.showSchedule ?? [])
  const [newShow, setNewShow] = useState<Show>(emptyShow)
  const [addingShow, setAddingShow] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editShow, setEditShow]     = useState<Show>(emptyShow)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null)

  const mounted = useRef(false)
  // The last status the server confirmed (each PATCH answers with the saved event), so a
  // refused publication restores what's really stored, not what the page loaded with.
  const savedStatusRef = useRef<EventFormData["publicStatus"]>(initialData?.publicStatus ?? "draft")

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
      try {
        const res = await fetch(`/api/admin/events/${initialData!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, showSchedule: shows }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          if (data?.publicStatus) savedStatusRef.current = data.publicStatus
          setError(null)
          showToast("Enregistré ✓")
          return
        }
        // A refused publication (no shift yet) is a rule, not a glitch: say it and go back to
        // the last status the server confirmed.
        if (res.status === 409) {
          const previous = savedStatusRef.current
          setForm((f) => ({ ...f, publicStatus: previous }))
          setError(`${typeof data?.error === "string" ? data.error : "Modification refusée."} Le statut a été remis sur « ${previous === "archived" ? "Archivé" : previous === "published" ? "Publié" : "Brouillon"} ».`)
          return
        }
        console.error("Save error:", res.status)
        showToast("Erreur lors de la sauvegarde", false)
      } catch {
        showToast("Erreur réseau, modification non enregistrée", false)
      } finally {
        setSaving(false)
      }
    }, 800)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, shows])

  function set(field: keyof EventFormData, value: string) {
    setForm((f) => {
      const next = { ...f, [field]: value }
      if (field === "startDate" && (!f.endDate || f.endDate < value)) {
        next.endDate = value
      }
      return next
    })
  }

  function setShow(field: keyof Show, value: string) {
    setNewShow((s) => {
      const next = { ...s, [field]: value }
      if (field === "startTime" && isCompleteTime(value) && !s.endTime) {
        next.endTime = addMinutes(value, 90)
      }
      return next
    })
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
    try {
      // Always a draft: shifts come next, and publication is the last step.
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, publicStatus: "draft", showSchedule: shows }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(typeof data?.error === "string" ? data.error : "Erreur lors de la création."); return }
      router.push(createdHref ? createdHref.replace("{id}", data.id) : `/admin/events/${data.id}`)
      router.refresh()
    } catch {
      setError("Erreur réseau : l'événement n'a pas été créé. Réessayez.")
    } finally {
      setSaving(false)
    }
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
            <span className={`text-xs transition-opacity ${saving ? "text-gray-500 opacity-100" : "opacity-0"}`}>
              Sauvegarde…
            </span>
          </div>
        )}

        <div>
          <label htmlFor="event-title" className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
          <input id="event-title" type="text" required value={form.title} onChange={(e) => set("title", e.target.value)} className={inputCls} />
        </div>

        <div>
          <label htmlFor="event-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea id="event-description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} className={`${inputCls} resize-none`} />
        </div>

        <div>
          <label htmlFor="event-location" className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
          <input id="event-location" type="text" value={form.location} onChange={(e) => set("location", e.target.value)} className={inputCls} />
        </div>

        <CoordinatesField
          id="event-coordinates"
          value={{ latitude: form.latitude, longitude: form.longitude }}
          onChange={(c) => setForm((f) => ({ ...f, latitude: c?.latitude ?? null, longitude: c?.longitude ?? null }))}
          hint="Les bénévoles auront un lien « Voir sur la carte » (OpenStreetMap) sur la page d'inscription, dans les emails et sur leur page personnelle ; les créneaux sans lieu propre l'utilisent aussi."
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="event-start" className="block text-sm font-medium text-gray-700 mb-1">Date début *</label>
            <input id="event-start" type="date" required value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="event-end" className="block text-sm font-medium text-gray-700 mb-1">Date fin *</label>
            <input id="event-end" type="date" required value={form.endDate} min={form.startDate || undefined} onChange={(e) => set("endDate", e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Spectacles — visible only once both dates are set */}
        {form.startDate && form.endDate && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Spectacles</label>
            {!addingShow && (
              <button type="button" onClick={() => { setNewShow({ ...emptyShow, date: form.startDate }); setAddingShow(true) }} className="text-xs text-blue-600 hover:underline">
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
                        <input type="date" value={editShow.date} min={form.startDate} max={form.endDate} onChange={(e) => setEditShow((s) => ({ ...s, date: e.target.value }))} className={inputCls} />
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
            <p className="text-xs text-gray-500 mb-2">Aucun spectacle configuré.</p>
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
                  <input type="date" value={newShow.date} min={form.startDate} max={form.endDate} onChange={(e) => setShow("date", e.target.value)} className={inputCls} />
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
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Instructions publiques</label>
          <textarea rows={2} value={form.publicInstructions} onChange={(e) => set("publicInstructions", e.target.value)}
            placeholder="Texte affiché aux bénévoles en haut de la page"
            className={`${inputCls} resize-none`} />
        </div>

        <div className="flex items-start gap-3">
          <input
            id="event-require-phone"
            type="checkbox"
            aria-describedby="event-require-phone-hint"
            checked={form.requirePhone}
            onChange={(e) => setForm((f) => ({ ...f, requirePhone: e.target.checked }))}
            className="mt-0.5 h-4 w-4"
          />
          <div>
            <label htmlFor="event-require-phone" className="text-sm font-medium text-gray-700">
              Téléphone obligatoire à l&apos;inscription
            </label>
            <p id="event-require-phone-hint" className="text-xs text-gray-500">
              Les bénévoles devront indiquer un numéro pour s&apos;inscrire via le formulaire public.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message de confirmation</label>
          <textarea rows={2} value={form.confirmationMessage} onChange={(e) => set("confirmationMessage", e.target.value)}
            className={`${inputCls} resize-none`} />
          <p className="text-xs text-gray-500 mt-1">{"Supporte le **gras**, les listes (- item) et les liens [texte](url). Variables : {{prenom}}, {{créneau}}, {{date}}."}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Message de rappel <span className="text-gray-500 font-normal">(envoyé manuellement avant l&apos;événement)</span>
          </label>
          <textarea rows={3} value={form.reminderMessage} onChange={(e) => set("reminderMessage", e.target.value)}
            placeholder="Consignes vestimentaires, point de RDV, accès, parking…"
            className={`${inputCls} resize-none`} />
        </div>

        {isEdit ? (
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">Visibilité</legend>
            <label htmlFor="event-status" className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
            <select id="event-status" aria-describedby="event-status-hint" value={form.publicStatus} onChange={(e) => set("publicStatus", e.target.value)} className={inputCls}>
              <option value="draft">Brouillon (non visible)</option>
              <option value="published">Publié (visible)</option>
              <option value="archived">Archivé</option>
            </select>
            <p id="event-status-hint" className="text-xs text-gray-600 mt-1">Un événement ne peut être publié qu&apos;avec au moins un créneau.</p>
            <div className="mt-3 flex items-start gap-2">
              <input
                id="event-listed"
                type="checkbox"
                checked={form.isListed}
                aria-describedby={form.publicStatus === "published" && !form.isListed ? "event-listed-help event-listed-warning" : "event-listed-help"}
                onChange={(e) => setForm((f) => ({ ...f, isListed: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <div>
                <label htmlFor="event-listed" className="text-sm font-medium text-gray-700">{LISTED_FIELD_LABEL}</label>
                <p id="event-listed-help" className="text-xs text-gray-600 mt-0.5">{LISTED_FIELD_HELP}</p>
                {form.publicStatus === "published" && !form.isListed && (
                  <p id="event-listed-warning" role="status" className="text-xs text-amber-900 mt-1"><strong>{visibilityLabel(form)}.</strong> {UNLISTED_HINT}</p>
                )}
              </div>
            </div>
          </fieldset>
        ) : null}

        {isEdit && (
          <fieldset aria-describedby="event-registrations-hint">
            <legend className="text-sm font-medium text-gray-700 mb-1">Inscriptions</legend>
            <p id="event-registrations-hint" className="text-xs text-gray-600 mb-2">
              Indépendantes de la publication : un événement publié reste visible même quand ses inscriptions sont fermées. Vous pouvez toujours ajouter des bénévoles vous-même, et les liens personnels restent valables.
            </p>
            <div className="flex items-start gap-2">
              <input
                id="event-registrations-open"
                type="checkbox"
                aria-describedby="event-registrations-hint event-registrations-zone"
                checked={form.registrationsOpen}
                onChange={(e) => setForm((f) => ({ ...f, registrationsOpen: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="event-registrations-open" className="text-sm font-medium text-gray-700">Inscriptions ouvertes</label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 mt-3">
              <div>
                <label htmlFor="event-registrations-opens" className="block text-sm font-medium text-gray-700 mb-1">Ouverture programmée (facultatif)</label>
                <input id="event-registrations-opens" type="datetime-local" value={form.registrationOpensAt} onChange={(e) => set("registrationOpensAt", e.target.value)} aria-describedby="event-registrations-zone" className={inputCls} />
              </div>
              <div>
                <label htmlFor="event-registrations-closes" className="block text-sm font-medium text-gray-700 mb-1">Fermeture programmée (facultatif)</label>
                <input id="event-registrations-closes" type="datetime-local" value={form.registrationClosesAt} onChange={(e) => set("registrationClosesAt", e.target.value)} aria-invalid={windowOrderBad || undefined} aria-describedby={windowOrderBad ? "event-registrations-order event-registrations-zone" : "event-registrations-zone"} className={inputCls} />
                {windowOrderBad && <p id="event-registrations-order" className="text-xs text-red-700 mt-1">{WINDOW_ORDER_ERROR}</p>}
              </div>
            </div>
            <p id="event-registrations-zone" className="text-xs text-gray-600 mt-1">Heures du fuseau de l&apos;organisation ({timeZone}). La case « Inscriptions ouvertes » doit être cochée pour qu&apos;une ouverture programmée prenne effet.</p>
          </fieldset>
        )}

        {isEdit ? null : (
          <p className="text-sm text-gray-700">L&apos;événement est créé en brouillon : les créneaux viennent ensuite, la publication à la fin.</p>
        )}

        <fieldset aria-describedby="event-accent-hint">
          <legend className="text-sm font-medium text-gray-700 mb-1">Couleur de la page publique</legend>
          <p id="event-accent-hint" className="text-xs text-gray-600 mb-2">Une couleur de la palette derrière le titre de la page d&apos;inscription (le texte reste lisible). Sans couleur, l&apos;en-tête reste blanc.</p>
          <div className="flex flex-wrap gap-2">
            {/* The radio covers its pill (screen-reader cursor and hit area match); the selected
                state is a border, a check mark in currentColor and a weight change, so it survives
                forced-colours mode. */}
            <AccentPill selected={form.accentColorKey === null} onSelect={() => setForm((f) => ({ ...f, accentColorKey: null }))} value="">
              <span aria-hidden="true" className="w-4 h-4 rounded-full border border-gray-400 bg-white forced-colors:border-[CanvasText]" />
              Aucune<span className="sr-only"> (en-tête blanc)</span>
            </AccentPill>
            {ACCENT_KEYS.map((key) => {
              const a = eventAccent(key)!
              return (
                <AccentPill key={key} value={key} selected={form.accentColorKey === key} onSelect={() => setForm((f) => ({ ...f, accentColorKey: key }))}>
                  <span aria-hidden="true" className={`w-4 h-4 rounded-full ${a.swatch} forced-colors:border forced-colors:border-[CanvasText]`} />
                  {a.label}
                </AccentPill>
              )
            })}
          </div>
          {form.accentColorKey && eventAccent(form.accentColorKey) && (
            <div aria-hidden="true" className={`mt-3 rounded-xl px-4 py-3 ${eventAccent(form.accentColorKey)!.band}`}>
              <p className={`text-xs font-medium ${eventAccent(form.accentColorKey)!.soft}`}>Aperçu de l&apos;en-tête</p>
              <p className="text-lg font-bold">{form.title || "Titre de l'événement"}</p>
            </div>
          )}
        </fieldset>


        {error && <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

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

/** One option of the accent colour picker: a pill whose native radio covers it. */
function AccentPill({ value, selected, onSelect, children }: { value: string; selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <label
      className={`relative inline-flex items-center gap-2 text-sm border rounded-full px-3 py-1.5 cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue-600 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600 ${
        selected ? "border-gray-900 bg-gray-100 font-medium shadow-[inset_0_0_0_1px_#101828]" : "border-gray-300 hover:border-gray-500"
      }`}
    >
      <input type="radio" name="event-accent" value={value} checked={selected} onChange={onSelect} className="absolute inset-0 h-full w-full appearance-none opacity-0 cursor-pointer rounded-full" />
      {children}
      <svg aria-hidden="true" viewBox="0 0 16 16" className={`w-4 h-4 shrink-0 ${selected ? "" : "invisible"}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8.5l3 3 7-7" /></svg>
    </label>
  )
}
