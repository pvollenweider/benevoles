"use client"

import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Suspense, useEffect, useState } from "react"
import PublicFooter from "@/components/PublicFooter"
import { renderMarkdown, interpolate } from "@/lib/markdown"
import PushSubscribeButton from "@/components/PushSubscribeButton"

type RegistrationData = {
  volunteer: { firstName: string; email: string }
  registrations: { shift: { label: string } }[]
  confirmationMessage: string | null
}

function SuccessContent() {
  const params = useSearchParams()
  const token = params.get("token")
  const isWaitlist = params.get("waitlist") === "1"

  const [regData, setRegData] = useState<RegistrationData | null>(null)
  const [fetching, setFetching] = useState(!!token)

  useEffect(() => {
    if (!token) return
    fetch(`/api/public/registrations/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.error) setRegData(d)
      })
      .catch(() => {})
      .finally(() => setFetching(false))
  }, [token])

  const confirmationHtml: string | null = (() => {
    if (!regData?.confirmationMessage) return null
    const vars: Record<string, string> = {
      prenom: regData.volunteer.firstName,
      "créneau": regData.registrations[0]?.shift.label ?? "",
      date: "",
      heure: "",
    }
    return renderMarkdown(interpolate(regData.confirmationMessage, vars))
  })()

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col px-4">
      <div className="flex-1 flex items-center justify-center py-12">
        <div
          role="status"
          aria-live="polite"
          className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center"
        >
          <span aria-hidden="true" className="text-5xl block mb-4">{isWaitlist ? "🕐" : "🎉"}</span>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {isWaitlist ? "Tu es sur la liste d'attente !" : "Inscription confirmée !"}
          </h1>

          {isWaitlist ? (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-900 text-left mb-6">
              <p className="font-medium mb-1"><span aria-hidden="true">🕐 </span>Tu es sur la liste d&apos;attente !</p>
              <p>On t&apos;enverra un email dès qu&apos;une place se libère. Tu auras 24h pour confirmer.</p>
            </div>
          ) : fetching ? (
            <div role="status" aria-label="Chargement des détails" className="flex justify-center py-4">
              <svg
                aria-hidden="true"
                className="h-5 w-5 text-blue-400 motion-safe:animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          ) : confirmationHtml ? (
            <div
              className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900 text-left mb-6"
              dangerouslySetInnerHTML={{ __html: confirmationHtml }}
            />
          ) : (
            <p className="text-gray-500 text-sm mb-6">
              Merci pour ton engagement. Un email de confirmation a été envoyé.
            </p>
          )}

          {token && (
            <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-2">Lien pour modifier ou annuler</p>
                <Link
                  href={`/my/${token}`}
                  className="text-blue-600 text-sm font-medium underline break-all"
                >
                  Accéder à mon inscription
                </Link>
              </div>
              {regData?.volunteer.email && !isWaitlist && (
                <PushSubscribeButton email={regData.volunteer.email} />
              )}
            </div>
          )}

          <Link
            href="/"
            className="block w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
      <PublicFooter />
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
