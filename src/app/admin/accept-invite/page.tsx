"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import PasswordRules from "@/components/PasswordRules"

function AcceptInviteForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const router = useRouter()

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Lien invalide.</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="text-center space-y-4 py-8">
        <p className="text-2xl">✅</p>
        <p className="font-semibold text-gray-900">Mot de passe créé</p>
        <p className="text-sm text-gray-500">Votre compte est actif. Vous pouvez vous connecter.</p>
        <button
          onClick={() => router.push("/admin/login")}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
        >
          Se connecter
        </button>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.")
      return
    }
    setSubmitting(true)
    setError(null)

    const res = await fetch("/api/admin/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    })

    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Une erreur est survenue.")
      return
    }

    setDone(true)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-700 mb-1">Nouveau mot de passe *</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          placeholder="10 caractères minimum"
        />
        <PasswordRules password={password} />
      </div>
      <div>
        <label className="block text-sm text-gray-700 mb-1">Confirmer le mot de passe *</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-blue-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? "Enregistrement…" : "Créer mon mot de passe"}
      </button>
    </form>
  )
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bienvenue</h1>
          <p className="text-sm text-gray-500 mt-1">Créez votre mot de passe pour activer votre compte.</p>
        </div>
        <Suspense fallback={<p className="text-sm text-gray-400">Chargement…</p>}>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </div>
  )
}
