"use client"

import { useState } from "react"
import Link from "next/link"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch("/api/public/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    setLoading(false)
    setSubmitted(true)
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Mot de passe oublié</h1>
          <p className="text-gray-500 text-sm mt-1">
            Entrez votre email pour recevoir un lien de réinitialisation.
          </p>
        </div>

        {submitted ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center space-y-3">
            <p className="text-2xl">📬</p>
            <p className="font-semibold text-gray-900">Email envoyé</p>
            <p className="text-sm text-gray-500">
              Si cette adresse est associée à un compte, vous recevrez un lien valable 1 heure.
            </p>
            <Link href="/admin/login" className="block text-sm text-blue-600 hover:underline mt-2">
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="email"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {loading ? "Envoi…" : "Envoyer le lien"}
            </button>
            <div className="text-center">
              <Link href="/admin/login" className="text-sm text-gray-500 hover:text-gray-700">
                Retour à la connexion
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
