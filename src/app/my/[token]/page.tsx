"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"

type RegistrationData = {
  id: string
  event: { title: string; slug: string }
  shift: { label: string; date: string; startTime: string; endTime: string }
  volunteer: { firstName: string; lastName: string; email: string }
  createdAt: string
}

export default function MyRegistrationPage() {
  const params = useParams()
  const token = params.token as string

  const [data, setData] = useState<RegistrationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelled, setCancelled] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/public/registrations/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setData(d)
        else setError(d.error)
        setLoading(false)
      })
  }, [token])

  async function handleCancel() {
    if (!confirm("Confirmer l'annulation de cette inscription ?")) return
    setCancelling(true)
    const res = await fetch(`/api/public/registrations/${token}`, { method: "DELETE" })
    if (res.ok) {
      setCancelled(true)
    } else {
      const d = await res.json()
      setError(d.error)
    }
    setCancelling(false)
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Chargement…</div>

  if (cancelled) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Inscription annulée</h1>
          <p className="text-gray-500 text-sm mb-6">Votre place a été libérée.</p>
          <Link href="/" className="text-blue-600 text-sm">Retour à l'accueil</Link>
        </div>
      </main>
    )
  }

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

  const shiftDate = new Date(data.shift.date).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  })

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Mon inscription</h1>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Événement</p>
            <p className="font-semibold text-gray-900">{data.event.title}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Créneau</p>
            <p className="text-gray-800 font-medium">{data.shift.label}</p>
            <p className="text-gray-500 text-sm">{shiftDate} · {data.shift.startTime} – {data.shift.endTime}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Inscrit(e) en tant que</p>
            <p className="text-gray-800">{data.volunteer.firstName} {data.volunteer.lastName}</p>
            <p className="text-gray-500 text-sm">{data.volunteer.email}</p>
          </div>
        </div>

        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="w-full border border-red-300 text-red-600 rounded-xl py-3 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {cancelling ? "Annulation…" : "Annuler cette inscription"}
        </button>

        <Link href="/" className="block text-center text-sm text-gray-400 hover:text-gray-600">
          Retour à l'accueil
        </Link>
      </div>
    </main>
  )
}
