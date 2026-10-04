"use client"

import { useSearchParams } from "next/navigation"
import { WAITLIST_STEPS } from "@/lib/waitlist-copy"
import { outcomeHeading, readOutcome, requestNotice } from "@/lib/signup-outcome"
import Link from "next/link"
import { Suspense, useEffect, useState } from "react"
import PublicFooter from "@/components/PublicFooter"
import { renderMarkdown, interpolate } from "@/lib/markdown"
import { confirmationVariables } from "@/lib/message-variables"
import { dayLabel } from "@/lib/spoken-time"
import PushSubscribeButton from "@/components/PushSubscribeButton"

type RegistrationData = {
  volunteer: { firstName: string; email: string }
  registrations: { shift: { label: string; date?: string; startTime?: string } }[]
  confirmationMessage: string | null
}

function SuccessContent() {
  const params = useSearchParams()
  const token = params.get("token")
  const outcome = readOutcome(params)
  const isWaitlist = outcome.waitlist
  // Only requests, no place yet (#484): no celebration, no confirmation message.
  const onlyRequests = outcome.requested > 0 && outcome.active === 0
  const notice = requestNotice(outcome)

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
    const first = regData.registrations[0]?.shift
    const vars = confirmationVariables(regData.volunteer.firstName, first && {
      label: first.label,
      day: first.date ? dayLabel(first.date.slice(0, 10)).toLocaleLowerCase("fr") : undefined,
      startTime: first.startTime,
    })
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
          <span aria-hidden="true" className="text-5xl block mb-4">{isWaitlist || onlyRequests ? "🕐" : "🎉"}</span>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{outcomeHeading(outcome)}</h1>
          {notice && (
            <p className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 text-left mb-4">{notice}</p>
          )}

          {isWaitlist ? (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-900 text-left mb-6">
              <h2 className="font-medium mb-2">Comment ça marche</h2>
              <ol className="list-decimal pl-5 space-y-1">
                {WAITLIST_STEPS.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </div>
          ) : fetching ? (
            <div className="flex justify-center py-4">
              <span className="sr-only">Chargement des détails</span>
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
          ) : onlyRequests ? null : confirmationHtml ? (
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
              {regData && !isWaitlist && !onlyRequests && (
                <PushSubscribeButton editToken={token} />
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
