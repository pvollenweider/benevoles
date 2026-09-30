"use client"

import { useEffect, useState } from "react"
import PersonalLinkPanel from "@/components/PersonalLinkPanel"
import LinkRequestForm from "@/components/LinkRequestForm"
import { offerDeadline, WAITLIST_STEPS, waitlistLabel } from "@/lib/waitlist-copy"
import { fmtRange } from "@/lib/gantt-utils"
import { useParams } from "next/navigation"
import Link from "next/link"
import PublicFooter from "@/components/PublicFooter"
import { renderMarkdown, interpolate } from "@/lib/markdown"
import PushSubscribeButton from "@/components/PushSubscribeButton"
import ShiftInfoList from "@/components/ShiftInfoList"
import AvailabilityForm from "@/components/AvailabilityForm"

type ShiftRef = {
  label: string
  date: string
  startTime: string
  endTime: string
  locationDetails?: string | null
  contactName?: string | null
  contactPhone?: string | null
  instructions?: string | null
  latitude?: number | null
  longitude?: number | null
}

type RegistrationItem = {
  id: string
  editToken: string
  status: string
  waitingPosition?: number | null
  waitingExpiresAt?: string | null
  shift: ShiftRef
}

type PageData = {
  event: { id: string; title: string; slug: string }
  volunteer: { firstName: string; lastName: string; email: string; availabilityPeriods?: string[]; availabilityNote?: string | null }
  registrations: RegistrationItem[]
  orgHomeUrl: string
  eventUrl: string
  timeZone?: string
  linkEmailedAt?: string | null
  contactEmail?: string | null
  confirmationMessage: string | null
}

export default function MyRegistrationPage() {
  const params = useParams()
  const token = params.token as string

  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [pendingCancel, setPendingCancel] = useState<{ editToken: string; label: string } | null>(null)

  useEffect(() => {
    fetch(`/api/public/registrations/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error)
        } else {
          setData(d)
          if (d.event?.slug) {
            localStorage.setItem(`benevoles_token_${d.event.slug}`, token)
          }
        }
        setLoading(false)
      })
      .catch(() => {
        setError("Une erreur est survenue. Réessaie.")
        setLoading(false)
      })
  }, [token])

  async function handleCancel(editToken: string) {
    setCancelling(editToken)
    setPendingCancel(null)

    const res = await fetch(`/api/public/registrations/${editToken}`, { method: "DELETE" })

    if (res.ok) {
      setData((prev) =>
        prev
          ? { ...prev, registrations: prev.registrations.filter((r) => r.editToken !== editToken) }
          : prev
      )
    } else {
      const d = await res.json()
      setError(d.error)
    }
    setCancelling(null)
  }

  if (loading) return <div role="status" className="flex items-center justify-center min-h-screen text-gray-500">Chargement…</div>

  if (error || !data) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Ce lien ne fonctionne pas</h1>
          <p className="text-sm text-gray-700 mb-4">{error ?? "Ce lien est invalide ou a déjà été annulé."}</p>
          <LinkRequestForm />
          <Link href={data?.eventUrl ?? data?.orgHomeUrl ?? "/"} className="inline-block mt-6 text-blue-700 text-sm underline underline-offset-2">Retour à l&apos;accueil</Link>
        </div>
      </main>
    )
  }

  if (data.registrations.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <span aria-hidden="true" className="text-4xl block mb-4">✓</span>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Toutes tes inscriptions ont été annulées</h1>
          <Link href={data?.eventUrl ?? data?.orgHomeUrl ?? "/"} className="text-blue-600 text-sm mt-4 block">Retour à l'accueil</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-md mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mes inscriptions</h1>
          <p className="text-sm text-gray-600 mt-1">{data.event.title}</p>
          <p className="text-sm text-gray-500">
            {data.volunteer.firstName} {data.volunteer.lastName} · {data.volunteer.email}
          </p>
        </div>

        <div className="space-y-3">
          {data.registrations.map((reg) => {
            const date = new Date(reg.shift.date).toLocaleDateString("fr-FR", {
              weekday: "long", day: "numeric", month: "long",
            })
            const isPending = pendingCancel?.editToken === reg.editToken
            return (
              <div key={reg.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">
                      {reg.shift.label}
                      {waitlistLabel(reg) && <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{waitlistLabel(reg)}</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{date} · {fmtRange(reg.shift.startTime, reg.shift.endTime)}</p>
                    {reg.status === "offered" && (
                      <p className="text-xs text-amber-900 mt-1">
                        {offerDeadline(reg.waitingExpiresAt, data.timeZone ?? "Europe/Zurich")}{" "}
                        <Link href={`/waitlist/${reg.editToken}/confirm`} aria-label={`Prendre la place : ${reg.shift.label}`} className="font-medium underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900">Prendre la place</Link>
                      </p>
                    )}
                    <ShiftInfoList info={reg.shift} className="mt-2 text-xs text-gray-700" />
                  </div>
                  {!isPending && (
                    <button
                      onClick={() => setPendingCancel({ editToken: reg.editToken, label: reg.shift.label })}
                      disabled={cancelling === reg.editToken}
                      aria-label={`Annuler le créneau ${reg.shift.label}`}
                      className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 flex-shrink-0 transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                    >
                      {cancelling === reg.editToken ? "…" : "Annuler"}
                    </button>
                  )}
                </div>

                {isPending && (
                  <div
                    role="alertdialog"
                    aria-labelledby={`cancel-title-${reg.id}`}
                    aria-describedby={`cancel-desc-${reg.id}`}
                    className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 space-y-2"
                  >
                    <p id={`cancel-title-${reg.id}`} className="text-sm font-medium text-red-800">Confirmer l'annulation ?</p>
                    <p id={`cancel-desc-${reg.id}`} className="text-xs text-red-600">
                      Tu veux annuler le créneau <strong>{reg.shift.label}</strong> ?
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleCancel(reg.editToken)}
                        disabled={cancelling === reg.editToken}
                        className="flex-1 bg-red-500 text-white rounded-lg py-1.5 text-xs font-medium hover:bg-red-600 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                      >
                        {cancelling === reg.editToken ? "…" : "Oui, annuler"}
                      </button>
                      <button
                        onClick={() => setPendingCancel(null)}
                        className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-1.5 text-xs font-medium hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        Non, garder
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <PersonalLinkPanel
          token={token}
          linkEmailedAt={data.linkEmailedAt ?? null}
          timeZone={data.timeZone ?? "Europe/Zurich"}
          contactEmail={data.contactEmail ?? null}
          eventTitle={data.event.title}
        />

        {data.registrations.some((r) => r.status !== "active") && (
          <section aria-labelledby="waitlist-how" className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-900">
            <h2 id="waitlist-how" className="font-medium mb-2">Liste d&apos;attente : comment ça marche</h2>
            <ol className="list-decimal pl-5 space-y-1">
              {WAITLIST_STEPS.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </section>
        )}

        {data.confirmationMessage && data.confirmationMessage.trim() && (() => {
          const html = renderMarkdown(interpolate(data.confirmationMessage, { prenom: data.volunteer.firstName, "créneau": data.registrations[0]?.shift.label ?? "", date: "", heure: "" }))
          return (
            <div>
              <h2 className="text-xs font-semibold text-gray-600 mb-2">Informations pratiques</h2>
              <div
                className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          )
        })()}

        <AvailabilityForm token={token} initialPeriods={data.volunteer.availabilityPeriods ?? []} initialNote={data.volunteer.availabilityNote ?? null} />

        <div className="flex items-center justify-between pt-2">
          <Link href={data?.eventUrl ?? data?.orgHomeUrl ?? "/"} className="text-sm text-gray-500 hover:text-gray-700">
            Retour à l&apos;accueil
          </Link>
          <PushSubscribeButton editToken={token} />
        </div>
      </div>
      <PublicFooter />
    </main>
  )
}
