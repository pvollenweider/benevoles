"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

type Preview = {
  email: string
  organizationName: string
}

export default function AcceptInvitationPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetch(`/api/public/invitations/${token}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (r.ok) setPreview(data as Preview)
        else setLoadError(data.error ?? "Lien invalide")
      })
      .finally(() => setLoading(false))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas")
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await fetch(`/api/public/invitations/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Erreur lors de la création du compte")
      return
    }
    setSuccess(true)
    setTimeout(() => router.push("/admin/login"), 1500)
  }

  if (loading) {
    return <Center>Chargement…</Center>
  }

  if (loadError) {
    return (
      <Center>
        <h1 className="text-lg font-semibold text-gray-700 mb-2">Invitation invalide</h1>
        <p className="text-sm text-gray-500 mb-6">{loadError}</p>
        <Link href="/" className="text-blue-600 text-sm">Retour à l&apos;accueil</Link>
      </Center>
    )
  }

  if (success) {
    return (
      <Center>
        <h1 className="text-lg font-semibold text-green-700 mb-2">Compte créé !</h1>
        <p className="text-sm text-gray-500">Redirection vers la connexion…</p>
      </Center>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-md w-full">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Bienvenue !</h1>
        <p className="text-sm text-gray-600 mb-6">
          Tu rejoins <strong>{preview?.organizationName}</strong> en tant qu&apos;administrateur.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={preview?.email ?? ""}
              disabled
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ton nom *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom Nom"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe *</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">8 caractères minimum.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer *</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Création…" : "Créer mon compte"}
          </button>
        </form>
      </div>
    </main>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-md w-full">
        {children}
      </div>
    </main>
  )
}
