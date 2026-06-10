"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { formatDate, shiftsOverlap } from "@/lib/utils"
import DayTimeline, { fmt } from "@/components/DayTimeline"
import PublicFooter from "@/components/PublicFooter"
import { DEFAULT_VOLUNTEER_CHARTER } from "@/lib/volunteer-charter"

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
  waitlistEnabled: boolean
}

type Show = { name: string; date: string; startTime: string; endTime: string }

type EventData = {
  id: string
  slug: string
  title: string
  organizationName: string
  description: string | null
  location: string | null
  startDate: string
  endDate: string
  publicInstructions: string | null
  confirmationMessage: string | null
  showSchedule: Show[]
  volunteerCharter: string | null
  shifts: Shift[]
}

export default function EventPageClient({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const [charterAccepted, setCharterAccepted] = useState(false)
  const [showCharter, setShowCharter] = useState(false)
  const charterTriggerRef = useRef<HTMLButtonElement>(null)
  const cancelTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", comment: "", consent: false,
  })

  const storageKey = `benevoles_token_${eventSlug}`
  const myShiftIds = useMemo(() => new Set(myRegistrations.map((r) => r.shiftId)), [myRegistrations])

  const conflictingShiftIds = useMemo(() => {
    if (!event) return new Set<string>()
    return new Set(
      event.shifts
        .filter((s) => !selectedShifts.has(s.id) && !myShiftIds.has(s.id))
        .filter((candidate) =>
          event.shifts.some(
            (ref) => (selectedShifts.has(ref.id) || myShiftIds.has(ref.id)) && shiftsOverlap(candidate, ref)
          )
        )
        .map((s) => s.id)
    )
  }, [event, selectedShifts, myShiftIds])

  useEffect(() => {
    const url = `/api/public/${eventSlug}?org=${encodeURIComponent(orgSlug)}`
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setLoading(false); return }
        setEvent(data)
        setLoading(false)
      })
  }, [eventSlug, orgSlug])

  useEffect(() => {
    if (!inviteToken) return
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
  }, [inviteToken, eventSlug])

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
          regs.forEach((r: MyReg) => next.add(r.shiftId))
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

  if (loading) return <div role="status" className="flex items-center justify-center min-h-screen text-gray-400">Chargement…</div>
  if (!event) return <div role="alert" className="flex items-center justify-center min-h-screen text-gray-500">Événement introuvable.</div>

  const shiftsByDay = event.shifts.reduce<Record<string, Shift[]>>((acc, shift) => {
    const day = new Date(shift.date).toISOString().split("T")[0]
    if (!acc[day]) acc[day] = []
    acc[day].push(shift)
    return acc
  }, {})

  const hasAvailableShift = event.shifts.some(
    (s) =>
      (s.status !== "full" && s.status !== "closed" && s.status !== "cancelled") ||
      (s.status === "full" && s.waitlistEnabled)
  )

  function toggleShift(id: string, status: string) {
    if (status === "closed" || status === "cancelled") return
    if (status === "full") {
      const shift = event?.shifts.find((s) => s.id === id)
      if (!shift?.waitlistEnabled) return
    }
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
    if (!charterAccepted) { setError("Veuillez accepter la convention des bénévoles."); return }
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
    if (data.onWaitlist) {
      router.push(`/${eventSlug}/success?token=${data.editToken}&waitlist=1`)
    } else {
      router.push(`/${eventSlug}/success?token=${data.editToken}`)
    }
  }

  function quitSession() {
    localStorage.removeItem(storageKey)
    setMyRegistrations([])
    setSelectedShifts(new Set())
    setForm({ firstName: "", lastName: "", email: "", phone: "", comment: "", consent: false })
  }

  // orgSlug is received as prop but only used in the storageKey (already included via eventSlug)
  void orgSlug

  // Shared shift row used in both the mobile summary card and the desktop sidebar
  function ShiftRow({ s, compact = false }: { s: Shift; compact?: boolean }) {
    const isReg = myShiftIds.has(s.id)
    const reg = isReg ? myRegistrations.find((r) => r.shiftId === s.id) : null
    const isWaitlistPending = !isReg && s.status === "full" && (s.waitlistEnabled ?? false)
    const name = s.label && s.label !== s.roleName ? s.label : s.roleName
    return (
      <div className={`flex items-start gap-2 px-4 ${compact ? "py-2" : "py-2.5"} ${isReg ? "bg-green-50" : selectedShifts.has(s.id) ? "bg-blue-50/60" : ""}`}>
        <svg aria-hidden="true" className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${isReg ? "text-green-400" : "text-blue-400"}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium leading-snug ${isReg ? "text-green-900" : "text-gray-900"}`}>{name}</p>
          <p className="text-[11px] text-gray-500 mt-0.5 font-mono">{fmt(s.startTime)}–{fmt(s.endTime)}</p>
          {isWaitlistPending && (
            <p className="text-[11px] text-gray-500 mt-0.5">Complet · liste d&apos;attente si place libérée</p>
          )}
        </div>
        {isReg ? (
          <button
            onClick={(e) => { cancelTriggerRef.current = e.currentTarget as HTMLButtonElement; if (reg) setPendingCancel({ token: reg.token, shiftId: s.id, label: s.label || s.roleName }) }}
            className="text-green-300 hover:text-red-400 text-xs flex-shrink-0 transition-colors mt-0.5"
            aria-label={`Annuler l'inscription à ${name}`}
          ><span aria-hidden="true">✕</span></button>
        ) : (
          <button
            onClick={() => toggleShift(s.id, s.status)}
            className="text-blue-300 hover:text-red-400 text-xs flex-shrink-0 transition-colors mt-0.5"
            aria-label={`Retirer ${name} de la sélection`}
          ><span aria-hidden="true">✕</span></button>
        )}
      </div>
    )
  }

  const allSelectedShifts = event.shifts.filter((s) => selectedShifts.has(s.id))
  const newShiftIds = new Set(allSelectedShifts.map((s) => s.id).filter((id) => !myShiftIds.has(id)))

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-6xl mx-auto">
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
          <p className="text-xs text-gray-500 font-medium mt-2">{event.organizationName}</p>
          <h1 className="text-xl font-bold text-gray-900">{event.title}</h1>
          {event.location && <p className="text-sm text-gray-500"><span aria-hidden="true">📍 </span>{event.location}</p>}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 pb-28 lg:pb-10 space-y-4">
        {event.publicInstructions && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
            {event.publicInstructions}
          </div>
        )}

        {step === "select" && (
          <>
            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} aria-label="Fermer le message d'erreur" className="text-red-300 hover:text-red-500 flex-shrink-0"><span aria-hidden="true">✕</span></button>
              </div>
            )}

            <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-8 lg:items-start">
              {/* Left: timelines */}
              <div className="space-y-6">
                {Object.entries(shiftsByDay).map(([day, dayShifts]) => {
                  const dayShows = (event.showSchedule ?? []).filter((s) => s.date === day)
                  return (
                    <div key={day}>
                      <h2 className="text-sm font-semibold text-gray-600 mb-3">
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

                {!hasAvailableShift && (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-lg font-medium">Tous les créneaux sont complets.</p>
                    <p className="text-sm mt-1">Merci pour ton intérêt !</p>
                  </div>
                )}

                {/* Mobile: selected shifts summary card */}
                {allSelectedShifts.length > 0 && (
                  <div className="lg:hidden rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
                    {allSelectedShifts.map((s) => <ShiftRow key={s.id} s={s} />)}
                  </div>
                )}
              </div>

              {/* Desktop right sidebar */}
              <div className="hidden lg:block">
                <div className="sticky top-6 space-y-4">
                  {/* Event info card */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500 font-semibold mb-1">{event.organizationName}</p>
                    <p className="text-sm font-bold text-gray-900">{event.title}</p>
                    {event.description && (
                      <p className="text-sm text-gray-500 mt-2 leading-relaxed line-clamp-4">{event.description}</p>
                    )}
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-500">
                      <div>
                        <span aria-hidden="true">📅 </span>{formatDate(event.startDate)}
                        {event.startDate !== event.endDate && ` – ${formatDate(event.endDate)}`}
                      </div>
                      {event.location && <div><span aria-hidden="true">📍 </span>{event.location}</div>}
                    </div>
                  </div>

                  {/* Selected shifts + CTA */}
                  {allSelectedShifts.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <p className="px-4 pt-3 pb-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                        Créneaux sélectionnés
                      </p>
                      <div className="divide-y divide-gray-100">
                        {allSelectedShifts.map((s) => <ShiftRow key={s.id} s={s} compact />)}
                      </div>
                      {newShiftIds.size > 0 && (
                        <div className="p-3 border-t border-gray-100">
                          <button
                            onClick={() => setStep("form")}
                            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition-colors"
                          >
                            Continuer ({newShiftIds.size} nouveau{newShiftIds.size > 1 ? "x" : ""} créneau{newShiftIds.size > 1 ? "x" : ""})
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile: fixed bottom CTA */}
            {newShiftIds.size > 0 && (
              <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
                <div className="max-w-2xl mx-auto px-4 pb-5 pt-10 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pointer-events-none">
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
        )}

        {step === "form" && (
          <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-8 lg:items-start">
            {/* Form */}
            <div className="bg-white rounded-2xl border border-blue-200 p-5">
              <div className="flex items-center gap-2 mb-5">
                <button onClick={() => setStep("select")} className="text-blue-600 text-sm">← Retour</button>
                <h2 className="text-base font-semibold text-gray-800">Vos informations</h2>
              </div>

              {/* Mobile: shift recap inside form card */}
              <div className="lg:hidden bg-gray-50 rounded-xl p-3 mb-5 space-y-1">
                {event.shifts.filter((s) => selectedShifts.has(s.id)).map((s) => (
                  <div key={s.id} className="text-sm text-gray-700">
                    ✓ {s.label} — {s.startTime}–{s.endTime}
                  </div>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-firstname" className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                    <input
                      id="reg-firstname"
                      type="text"
                      required
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-lastname" className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                    <input
                      id="reg-lastname"
                      type="text"
                      required
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="reg-phone" className="block text-sm font-medium text-gray-700 mb-1">Téléphone <span className="text-gray-400 font-normal">(facultatif, mais super utile)</span></label>
                  <input
                    id="reg-phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="reg-comment" className="block text-sm font-medium text-gray-700 mb-1">Commentaire <span className="text-gray-400 font-normal">(facultatif)</span></label>
                  <textarea
                    id="reg-comment"
                    rows={2}
                    value={form.comment}
                    onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={charterAccepted}
                    onChange={(e) => setCharterAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-600">
                    J&apos;ai lu et j&apos;accepte la{" "}
                    <button
                      ref={charterTriggerRef}
                      type="button"
                      onClick={() => setShowCharter(true)}
                      className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
                    >
                      convention des bénévoles
                    </button>
                    .
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.consent}
                    onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-600">
                    J&apos;accepte que mes données soient utilisées pour la gestion des bénévoles de cet événement.
                  </span>
                </label>

                {error && (
                  <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
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

            {/* Desktop right sidebar for form step */}
            <div className="hidden lg:block">
              <div className="sticky top-6 bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <p className="px-4 pt-3 pb-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                  Vos créneaux
                </p>
                <div className="divide-y divide-gray-100">
                  {event.shifts.filter((s) => selectedShifts.has(s.id)).map((s) => (
                    <div key={s.id} className="px-4 py-3">
                      <p className="text-xs font-medium text-gray-900">{s.label && s.label !== s.roleName ? s.label : s.roleName}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 font-mono">{fmt(s.startTime)}–{fmt(s.endTime)}</p>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                  <p className="text-[11px] text-gray-500 font-medium">{event.organizationName}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{event.title}</p>
                  {event.location && <p className="text-xs text-gray-500 mt-1"><span aria-hidden="true">📍 </span>{event.location}</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCharter && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="charter-dialog-title"
          onKeyDown={(e) => { if (e.key === "Escape") { setShowCharter(false); charterTriggerRef.current?.focus() } }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
            ref={(el) => { if (el) { const first = el.querySelector<HTMLElement>("button,a,[tabindex]"); first?.focus() } }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 id="charter-dialog-title" className="text-base font-semibold text-gray-900">Convention des Bénévoles</h2>
              <button
                onClick={() => { setShowCharter(false); charterTriggerRef.current?.focus() }}
                aria-label="Fermer la convention des bénévoles"
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              ><span aria-hidden="true">✕</span></button>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed flex-1">
              {event.volunteerCharter ?? DEFAULT_VOLUNTEER_CHARTER}
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => { setCharterAccepted(true); setShowCharter(false); charterTriggerRef.current?.focus() }}
                className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                J&apos;ai lu et j&apos;accepte
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingCancel && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cancel-dialog-title"
          aria-describedby="cancel-dialog-desc"
          onKeyDown={(e) => { if (e.key === "Escape") { setPendingCancel(null); cancelTriggerRef.current?.focus() } }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4"
            ref={(el) => { if (el) { const first = el.querySelector<HTMLElement>("button"); first?.focus() } }}
          >
            <h2 id="cancel-dialog-title" className="text-base font-semibold text-gray-900">Se désinscrire ?</h2>
            <p id="cancel-dialog-desc" className="text-sm text-gray-600">
              Tu veux annuler ton inscription à&nbsp;
              <span className="font-medium text-gray-900">« {pendingCancel.label} »</span>&nbsp;?
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => {
                  cancelRegistration(pendingCancel.token, pendingCancel.shiftId)
                  setPendingCancel(null)
                  cancelTriggerRef.current?.focus()
                }}
                className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-red-600 transition-colors"
              >
                Me désinscrire
              </button>
              <button
                onClick={() => { setPendingCancel(null); cancelTriggerRef.current?.focus() }}
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
