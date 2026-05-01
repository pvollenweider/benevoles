"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import PublicFooter from "@/components/PublicFooter"

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
}

export default function MyRegistrationPage() {
  const params = useParams()
  const token = params.token as string

  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/public/registrations/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setData(d)
        setLoading(false)
      })
  }, [token])

  async function handleCancel(editToken: string) {
    if (!confirm("Confirmer l'annulation de ce créneau ?")) return
    setCancelling(editToken)

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

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Chargement…</div>

  if (error || !data) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-700 mb-2">Inscription introuvable</h1>
          <p className="text-sm text-gray-400 mb-6">{error ?? "Ce lien est invalide ou a déjà été annulé."}</p>
          <Link href="/" className="text-blue-600 text-sm">Retour à l'accueil</Link>
        </div>
      </main>
    )
  }

  if (data.registrations.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Toutes vos inscriptions ont été annulées</h1>
          <Link href="/" className="text-blue-600 text-sm mt-4 block">Retour à l'accueil</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-md mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mes inscriptions</h1>
          <p className="text-sm text-gray-500 mt-1">{data.event.title}</p>
          <p className="text-sm text-gray-400">
            {data.volunteer.firstName} {data.volunteer.lastName} · {data.volunteer.email}
          </p>
        </div>

        <div className="space-y-3">
          {data.registrations.map((reg) => {
            const date = new Date(reg.shift.date).toLocaleDateString("fr-FR", {
              weekday: "long", day: "numeric", month: "long",
            })
            return (
              <div key={reg.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{reg.shift.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{date} · {reg.shift.startTime}–{reg.shift.endTime}</p>
                </div>
                <button
                  onClick={() => handleCancel(reg.editToken)}
                  disabled={cancelling === reg.editToken}
                  className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 flex-shrink-0 transition-colors disabled:opacity-40"
                >
                  {cancelling === reg.editToken ? "…" : "Annuler"}
                </button>
              </div>
            )
          })}
        </div>

        <Link href="/" className="block text-center text-sm text-gray-400 hover:text-gray-600 pt-2">
          Retour à l'accueil
        </Link>
      </div>
      <PublicFooter />
    </main>
  )
}
