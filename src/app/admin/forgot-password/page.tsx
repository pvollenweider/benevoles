"use client"

import { useState } from "react"
import Link from "next/link"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await fetch("/api/public/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    setSubmitting(false)
    setDone(true)
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-md w-full">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Mot de passe oublié</h1>
        {done ? (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.
            </p>
            <p className="text-sm text-gray-500 mb-6">Le lien est valable 1 heure.</p>
            <Link href="/admin/login" className="text-sm text-blue-600">← Retour à la connexion</Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-gray-600">
              Entre ton email — on t&apos;envoie un lien pour choisir un nouveau mot de passe.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.dev"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Envoi…" : "Envoyer le lien"}
            </button>
            <Link href="/admin/login" className="block text-sm text-blue-600 text-center">← Retour à la connexion</Link>
          </form>
        )}
      </div>
    </main>
  )
}
