"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { formatDate } from "@/lib/utils"

type Shift = {
  id: string
  roleName: string
  label: string
  description: string | null
  date: string
  startTime: string
  endTime: string
  capacity: number
  registered: number
  spotsLeft: number
  status: string
  locationDetails: string | null
}

type EventData = {
  id: string
  slug: string
  title: string
  description: string | null
  location: string | null
  startDate: string
  endDate: string
  publicInstructions: string | null
  confirmationMessage: string | null
  shifts: Shift[]
}

export default function EventPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [event, setEvent] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set())
  const [showFull, setShowFull] = useState(false)
  const [step, setStep] = useState<"select" | "form">("select")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", comment: "", consent: false,
  })

  useEffect(() => {
    fetch(`/api/public/events/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setLoading(false); return }
        setEvent(data)
        setLoading(false)
      })
  }, [slug])

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Chargement…</div>
  if (!event) return <div className="flex items-center justify-center min-h-screen text-gray-400">Événement introuvable.</div>

  const shiftsByDay = event.shifts.reduce<Record<string, Shift[]>>((acc, shift) => {
    const day = new Date(shift.date).toISOString().split("T")[0]
    if (!acc[day]) acc[day] = []
    acc[day].push(shift)
    return acc
  }, {})

  const openShifts = event.shifts.filter((s) => s.status !== "full" && s.status !== "closed" && s.status !== "cancelled")
  const fullShifts = event.shifts.filter((s) => s.status === "full")

  function toggleShift(id: string, status: string) {
    if (status === "full" || status === "closed" || status === "cancelled") return
    setSelectedShifts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.consent) { setError("Veuillez accepter la politique de confidentialité."); return }
    if (!form.firstName || !form.lastName || !form.email) { setError("Prénom, nom et email sont obligatoires."); return }

    setSubmitting(true)
    setError(null)

    const res = await fetch("/api/public/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event!.id,
        shiftIds: Array.from(selectedShifts),
        ...form,
      }),
    })

    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setError(data.error ?? "Une erreur est survenue.")
      return
    }

    router.push(`/events/${slug}/success?token=${data.editToken}`)
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <Link href="/" className="text-blue-600 text-sm">← Retour</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-2">{event.title}</h1>
          {event.location && <p className="text-sm text-gray-400">📍 {event.location}</p>}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {event.publicInstructions && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
            {event.publicInstructions}
          </div>
        )}

        {step === "select" && (
          <>
            <div className="space-y-6">
              {Object.entries(shiftsByDay).map(([day, dayShifts]) => {
                const visibleShifts = dayShifts.filter((s) =>
                  s.status !== "full" && s.status !== "closed" && s.status !== "cancelled"
                )
                const hiddenShifts = dayShifts.filter((s) => s.status === "full")

                return (
                  <div key={day}>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
                      {formatDate(day)}
                    </h2>
                    <div className="space-y-2">
                      {visibleShifts.map((shift) => (
                        <ShiftCard
                          key={shift.id}
                          shift={shift}
                          selected={selectedShifts.has(shift.id)}
                          onToggle={() => toggleShift(shift.id, shift.status)}
                        />
                      ))}
                      {hiddenShifts.length > 0 && (
                        <div>
                          <button
                            onClick={() => setShowFull((v) => !v)}
                            className="text-xs text-gray-400 mt-1 underline"
                          >
                            {showFull ? "Masquer" : `Voir ${hiddenShifts.length} créneau(x) complet(s)`}
                          </button>
                          {showFull && hiddenShifts.map((shift) => (
                            <ShiftCard key={shift.id} shift={shift} selected={false} onToggle={() => {}} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {selectedShifts.size > 0 && (
              <div className="sticky bottom-4">
                <button
                  onClick={() => setStep("form")}
                  className="w-full bg-blue-600 text-white rounded-2xl py-4 text-base font-semibold shadow-lg hover:bg-blue-700 transition-colors"
                >
                  Continuer ({selectedShifts.size} créneau{selectedShifts.size > 1 ? "x" : ""} sélectionné{selectedShifts.size > 1 ? "s" : ""})
                </button>
              </div>
            )}

            {openShifts.length === 0 && fullShifts.length === event.shifts.length && (
              <div className="text-center py-8 text-gray-400">
                <p className="text-lg font-medium">Tous les créneaux sont complets.</p>
                <p className="text-sm mt-1">Merci pour votre intérêt !</p>
              </div>
            )}
          </>
        )}

        {step === "form" && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-5">
              <button onClick={() => setStep("select")} className="text-blue-600 text-sm">← Retour</button>
              <h2 className="text-base font-semibold text-gray-800">Vos informations</h2>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 mb-5 space-y-1">
              {event.shifts.filter((s) => selectedShifts.has(s.id)).map((s) => (
                <div key={s.id} className="text-sm text-gray-700">
                  ✓ {s.label} — {s.startTime}–{s.endTime}
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                  <input
                    type="text"
                    required
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                  <input
                    type="text"
                    required
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone <span className="text-gray-400 font-normal">(facultatif)</span></label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commentaire <span className="text-gray-400 font-normal">(facultatif)</span></label>
                <textarea
                  rows={2}
                  value={form.comment}
                  onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-600">
                  J'accepte que mes données soient utilisées pour la gestion des bénévoles de cet événement.
                </span>
              </label>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 text-white rounded-2xl py-4 text-base font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {submitting ? "Envoi en cours…" : "Confirmer mon inscription"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  )
}

function ShiftCard({ shift, selected, onToggle }: { shift: Shift; selected: boolean; onToggle: () => void }) {
  const isFull = shift.status === "full"
  const isClosed = shift.status === "closed" || shift.status === "cancelled"
  const isUnavailable = isFull || isClosed

  return (
    <button
      onClick={onToggle}
      disabled={isUnavailable}
      className={`w-full text-left rounded-xl border p-4 transition-all ${
        selected
          ? "border-blue-500 bg-blue-50"
          : isUnavailable
          ? "border-gray-200 bg-gray-50 opacity-60 cursor-default"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 text-sm">{shift.label}</div>
          <div className="text-sm text-gray-500 mt-0.5">{shift.startTime} – {shift.endTime}</div>
          {shift.description && <div className="text-xs text-gray-400 mt-1">{shift.description}</div>}
        </div>
        <div className="flex-shrink-0 text-right">
          {isFull ? (
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Complet</span>
          ) : isClosed ? (
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Fermé</span>
          ) : (
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              shift.spotsLeft <= 2 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
            }`}>
              {shift.spotsLeft} place{shift.spotsLeft > 1 ? "s" : ""}
            </span>
          )}
          {selected && !isUnavailable && (
            <div className="mt-1 text-blue-600">
              <svg className="w-5 h-5 inline" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
