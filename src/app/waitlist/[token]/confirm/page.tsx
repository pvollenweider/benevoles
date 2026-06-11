"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"

export default function WaitlistConfirmPage() {
  const { token } = useParams() as { token: string }
  const [state, setState] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("")
  const [editToken, setEditToken] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/public/waitlist/${token}/confirm`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setEditToken(d.editToken)
          setState("success")
        } else {
          setMessage(d.error ?? "Une erreur est survenue.")
          setState("error")
        }
      })
      .catch(() => {
        setMessage("Impossible de confirmer. Réessayez.")
        setState("error")
      })
  }, [token])

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div
        role={state === "error" ? "alert" : "status"}
        aria-live={state === "error" ? "assertive" : "polite"}
        className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center"
      >
        {state === "loading" && (
          <p className="text-gray-500 text-sm">Confirmation en cours…</p>
        )}
        {state === "success" && (
          <>
            <span aria-hidden="true" className="text-5xl block mb-4">🎉</span>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Place confirmée !</h1>
            <p className="text-sm text-gray-500 mb-6">Ton inscription est maintenant active. À très vite !</p>
            {editToken && (
              <Link
                href={`/my/${editToken}`}
                className="block w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
              >
                Accéder à mon inscription
              </Link>
            )}
          </>
        )}
        {state === "error" && (
          <>
            <span aria-hidden="true" className="text-5xl block mb-4">⏱</span>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Lien expiré ou invalide</h1>
            <p className="text-sm text-gray-500 mb-6">{message}</p>
            <Link href="/" className="text-blue-600 text-sm">Retour à l&apos;accueil</Link>
          </>
        )}
      </div>
    </main>
  )
}
