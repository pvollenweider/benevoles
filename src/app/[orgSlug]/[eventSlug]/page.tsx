"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { formatDate, shiftsOverlap } from "@/lib/utils"
import DayTimeline, { fmt } from "@/components/DayTimeline"
import PublicFooter from "@/components/PublicFooter"

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
  displayOrder: number
}

type Show = { name: string; date: string; startTime: string; endTime: string }

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
  showSchedule: Show[]
  shifts: Shift[]
}

export default function EventPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const orgSlug = params.orgSlug as string
  const eventSlug = params.eventSlug as string
  const inviteToken = searchParams.get("token")

  type MyReg = { shiftId: string; token: string; label: string; roleName: string; startTime: string; endTime: string }

  const [event, setEvent] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set())
  const [myRegistrations, setMyRegistrations] = useState<MyReg[]>([])
  const [pendingCancel, setPendingCancel] = useState<{ token: string; shiftId: string; label: string } | null>(null)
  const [step, setStep] = useState<"select" | "form">("select")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", comment: "", consent: false,
  })

  const storageKey = `benevoles_token_${orgSlug}_${eventSlug}`
  const myShiftIds = new Set(myRegistrations.map((r) => r.shiftId))

  useEffect(() => {
    fetch(`/api/public/${orgSlug}/${eventSlug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setLoading(false); return }
        setEvent(data)
        setLoading(false)
      })
  }, [orgSlug, eventSlug])

  useEffect(() => {
    if (!inviteToken) return
    const sessionToken = localStorage.getItem(storageKey)
    if (sessionToken) return
    fetch(`/api/public/member-invite/${inviteToken}?slug=${encodeURIComponent(eventSlug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.member) return
        setForm((f) => ({
          ...f,
          firstName: f.firstName || data.member.firstName,
          lastName: f.lastName || data.member.lastName,
          email: f.email || data.member.email,
          phone: f.phone || data.member.phone,
        }))
      })
      .catch(() => {})
  }, [inviteToken, eventSlug, storageKey])

  useEffect(() => {
    const token = localStorage.getItem(storageKey)
    if (!token) return
    fetch(`/api/public/registrations/${token}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.registrations) return
        const regs: MyReg[] = data.registrations.map((r: { editToken: string; shift: { id: string; label: string; roleName?: string; startTime: string; endTime: string } }) => ({
          shiftId: r.shift.id,
          token: r.editToken,
          label: r.shift.label,
          roleName: r.shift.roleName ?? "",
          startTime: r.shift.startTime,
          endTime: r.shift.endTime,
        }))
        setMyRegistrations(regs)
        if (data.volunteer) {
          setForm((f) => ({
            ...f,
            firstName: data.volunteer.firstName || f.firstName,
            lastName:  data.volunteer.lastName  || f.lastName,
            email:     data.volunteer.email     || f.email,
            phone:     data.volunteer.phone     || f.phone,
          }))
        }
        setSelectedShifts((prev) => {
          const next = new Set(prev)
          regs.forEach((r) => next.add(r.shiftId))
          return next
        })
      })
      .catch(() => {})
  }, [storageKey])

  async function cancelRegistration(regToken: string, shiftId: string) {
    await fetch(`/api/public/registrations/${regToken}`, { method: "DELETE" })
    setMyRegistrations((prev) => prev.filter((r) => r.token !== regToken))
    setSelectedShifts((prev) => { const next = new Set(prev); next.delete(shiftId); return next })
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Chargement…</div>
  if (!event) return <div className="flex items-center justify-center min-h-screen text-gray-400">Événement introuvable.</div>

  const shiftsByDay = event.shifts.reduce<Record<string, Shift[]>>((acc, shift) => {
    const day = new Date(shift.date).toISOString().split("T")[0]
    if (!acc[day]) acc[day] = []
    acc[day].push(shift)
    return acc
  }, {})

  const hasAvailableShift = event.shifts.some(
    (s) => s.status !== "full" && s.status !== "closed" && s.status !== "cancelled"
  )

  function toggleShift(id: string, status: string) {
    if (status === "full" || status === "closed" || status === "cancelled") return
    if (myShiftIds.has(id)) return
    setSelectedShifts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); return next }
      next.add(id)
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
        shiftIds: Array.from(selectedShifts).filter((id) => !myShiftIds.has(id)),
        ...form,
        inviteToken: inviteToken ?? undefined,
      }),
    })

    let data: Record<string, string> = {}
    try {
      data = await res.json()
    } catch {
      setError("Une erreur inattendue est survenue. Veuillez réessayer.")
      setSubmitting(false)
      return
    }
    setSubmitting(false)

    if (!res.ok) {
      if (data.editToken) {
        localStorage.setItem(storageKey, data.editToken)
        try {
          const regRes = await fetch(`/api/public/registrations/${data.editToken}`)
          if (regRes.ok) {
            const regData = await regRes.json()
            if (regData.registrations) {
              const regs: MyReg[] = regData.registrations.map((r: { editToken: string; shift: { id: string; label: string; roleName?: string; startTime: string; endTime: string } }) => ({
                shiftId: r.shift.id,
                token: r.editToken,
                label: r.shift.label,
                roleName: r.shift.roleName ?? "",
                startTime: r.shift.startTime,
                endTime: r.shift.endTime,
              }))
              setMyRegistrations(regs)
              setSelectedShifts(new Set(regs.map((r) => r.shiftId)))
              if (regData.volunteer) {
                setForm((f) => ({
                  ...f,
                  firstName: regData.volunteer.firstName || f.firstName,
                  lastName:  regData.volunteer.lastName  || f.lastName,
                  email:     regData.volunteer.email     || f.email,
                  phone:     regData.volunteer.phone     || f.phone,
                }))
              }
            }
          }
        } catch { /* ignore */ }
        setError(data.error ?? "Une erreur est survenue.")
        setStep("select")
        return
      }
      setError(data.error ?? "Une erreur est survenue.")
      return
    }

    localStorage.setItem(storageKey, data.editToken)
    router.push(`/${orgSlug}/${eventSlug}/success?token=${data.editToken}`)
  }

  const conflictingShiftIds = new Set(
    event.shifts
      .filter((s) => !selectedShifts.has(s.id) && !myShiftIds.has(s.id))
      .filter((candidate) =>
        event.shifts.some(
          (ref) => (selectedShifts.has(ref.id) || myShiftIds.has(ref.id)) && shiftsOverlap(candidate, ref)
        )
      )
      .map((s) => s.id)
  )

  function quitSession() {
    localStorage.removeItem(storageKey)
    setMyRegistrations([])
    setSelectedShifts(new Set())
    setForm({ firstName: "", lastName: "", email: "", phone: "", comment: "", consent: false })
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl lg:max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-blue-600 text-sm">← Retour</Link>
            {myRegistrations.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 font-medium">
                  {form.firstName} {form.lastName}
                </span>
                <button
                  onClick={quitSession}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors border border-gray-200 rounded-lg px-2 py-1"
                >
                  Quitter la session
                </button>
              </div>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mt-2">{event.title}</h1>
          {event.location && <p className="text-sm text-gray-400">📍 {event.location}</p>}
        </div>
      </header>

      <div className="max-w-2xl lg:max-w-4xl mx-auto px-4 py-6 pb-28 space-y-6">
        {event.publicInstructions && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
            {event.publicInstructions}
          </div>
        )}

        {step === "select" && (
          <>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="text-red-300 hover:text-red-500 flex-shrink-0">✕</button>
              </div>
            )}
            <div className="space-y-6">
              {Object.entries(shiftsByDay).map(([day, dayShifts]) => {
                const dayShows = (event.showSchedule ?? []).filter((s) => s.date === day)
                return (
                  <div key={day}>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
                      {formatDate(day)}
                    </h2>
                    <p className="sm:hidden text-[11px] text-gray-400 text-center mb-1.5">
                      ← Faites défiler pour voir toutes les plages →
                    </p>
                    <DayTimeline
                      shifts={dayShifts}
                      shows={dayShows}
                      selected={selectedShifts}
                      registered={myShiftIds}
                      conflicts={conflictingShiftIds}
                      onToggle={toggleShift}
                    />
                  </div>
                )
              })}
            </div>

            {selectedShifts.size > 0 && (() => {
              const newShiftIds = new Set([...selectedShifts].filter((id) => !myShiftIds.has(id)))
              const allSelected = event.shifts.filter((s) => selectedShifts.has(s.id))
              return (
                <>
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
                    {allSelected.map((s) => {
                      const isReg = myShiftIds.has(s.id)
                      const reg   = isReg ? myRegistrations.find((r) => r.shiftId === s.id) : null
                      return (
                        <div key={s.id} className={`flex items-center gap-3 px-4 py-2.5 ${isReg ? "bg-green-50" : ""}`}>
                          <svg className={`w-3.5 h-3.5 flex-shrink-0 ${isReg ? "text-green-400" : "text-blue-400"}`} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className={`flex-1 text-sm ${isReg ? "text-green-900" : "text-blue-900"}`}>
                            {s.label && s.label !== s.roleName ? s.label : s.roleName}
                          </span>
                          <span className={`text-xs font-mono flex-shrink-0 ${isReg ? "text-green-500" : "text-blue-400"}`}>
                            {fmt(s.startTime)}–{fmt(s.endTime)}
                          </span>
                          {isReg ? (
                            <button
                              onClick={() => reg && setPendingCancel({ token: reg.token, shiftId: s.id, label: s.label || s.roleName })}
                              className="text-green-300 hover:text-red-400 text-xs flex-shrink-0 ml-1 transition-colors"
                              aria-label="Annuler l'inscription"
                            >✕</button>
                          ) : (
                            <button
                              onClick={() => toggleShift(s.id, s.status)}
                              className="text-blue-300 hover:text-red-400 text-xs flex-shrink-0 ml-1 transition-colors"
                              aria-label="Retirer"
                            >✕</button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {newShiftIds.size > 0 && (
                    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
                      <div className="max-w-2xl lg:max-w-4xl mx-auto px-4 pb-5 pt-10 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pointer-events-none">
                        <button
                          onClick={() => setStep("form")}
                          className="w-full bg-blue-600 text-white rounded-2xl py-4 text-base font-semibold shadow-xl hover:bg-blue-700 transition-colors pointer-events-auto"
                        >
                          Continuer ({newShiftIds.size} nouveau{newShiftIds.size > 1 ? "x" : ""} créneau{newShiftIds.size > 1 ? "x" : ""})
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {!hasAvailableShift && (
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

      {pendingCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Se désinscrire ?</h2>
            <p className="text-sm text-gray-600">
              Voulez-vous annuler votre inscription à&nbsp;
              <span className="font-medium text-gray-900">« {pendingCancel.label} »</span>&nbsp;?
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => {
                  cancelRegistration(pendingCancel.token, pendingCancel.shiftId)
                  setPendingCancel(null)
                }}
                className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-red-600 transition-colors"
              >
                Me désinscrire
              </button>
              <button
                onClick={() => setPendingCancel(null)}
                className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
      <PublicFooter />
    </main>
  )
}
