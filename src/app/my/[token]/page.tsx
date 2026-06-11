"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import PublicFooter from "@/components/PublicFooter"
import { renderMarkdown, interpolate } from "@/lib/markdown"
import PushSubscribeButton from "@/components/PushSubscribeButton"

type ShiftRef = {
  label: string
  date: string
  startTime: string
  endTime: string
}

type RegistrationItem = {
  id: string
  editToken: string
  shift: ShiftRef
}

type PageData = {
  event: { id: string; title: string; slug: string }
  volunteer: { firstName: string; lastName: string; email: string }
  registrations: RegistrationItem[]
  orgHomeUrl: string
  eventUrl: string
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
          <h1 className="text-lg font-semibold text-gray-700 mb-2">Inscription introuvable</h1>
          <p className="text-sm text-gray-500 mb-6">{error ?? "Ce lien est invalide ou a déjà été annulé."}</p>
          <Link href={data?.eventUrl ?? data?.orgHomeUrl ?? "/"} className="text-blue-600 text-sm">Retour à l'accueil</Link>
        </div>
      </main>
    )
  }

  if (data.registrations.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <span aria-hidden="true" className="text-4xl block mb-4">✓</span>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Toutes vos inscriptions ont été annulées</h1>
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
                    <p className="font-medium text-gray-900 text-sm">{reg.shift.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{date} · {reg.shift.startTime}–{reg.shift.endTime}</p>
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

        {data.confirmationMessage && data.confirmationMessage.trim() && (() => {
          const html = renderMarkdown(interpolate(data.confirmationMessage, { prenom: data.volunteer.firstName, "créneau": data.registrations[0]?.shift.label ?? "", date: "", heure: "" }))
          return (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Informations pratiques</p>
              <div
                className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          )
        })()}

        <div className="flex items-center justify-between pt-2">
          <Link href={data?.eventUrl ?? data?.orgHomeUrl ?? "/"} className="text-sm text-gray-500 hover:text-gray-700">
            Retour à l&apos;accueil
          </Link>
          <PushSubscribeButton email={data.volunteer.email} />
        </div>
      </div>
      <PublicFooter />
    </main>
  )
}
