"use client"

import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Suspense } from "react"

function SuccessContent() {
  const params = useSearchParams()
  const token = params.get("token")

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Inscription confirmée !</h1>
        <p className="text-gray-500 text-sm mb-6">
          Merci pour votre engagement. Un email de confirmation vous a été envoyé.
        </p>

        {token && (
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-xs text-gray-400 mb-2">Lien pour modifier ou annuler</p>
            <Link
              href={`/my/${token}`}
              className="text-blue-600 text-sm font-medium underline break-all"
            >
              Accéder à mon inscription
            </Link>
          </div>
        )}

        <Link
          href="/"
          className="block w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Retour à l'accueil
        </Link>
      </div>
    </main>
  )
}

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  )
}
