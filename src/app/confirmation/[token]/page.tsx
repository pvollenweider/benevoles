// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { cache } from "react"
import SignupEmailConfirmation from "@/components/public/SignupEmailConfirmation"
import { signupConfirmationView } from "@/lib/signup-confirmation-server"
import { SIGNUP_CONFIRMATION_PAGE_TITLES } from "@/lib/signup-confirmation"
import TooManyAttemptsNotice from "@/components/public/TooManyAttemptsNotice"
import { guardTokenLookup, pageClient } from "@/lib/token-page-guard"
import { TOO_MANY_ATTEMPTS } from "@/lib/too-many-attempts"

export const dynamic = "force-dynamic"

/**
 * One read per request, shared by generateMetadata and the page. Read-only (#1253). A connection
 * that opened too many unknown links reads nothing; an unknown link counts one miss, once per view
 * (src/lib/token-page-guard.ts). Its confirmation API has no failed-lookup counter of its own: the
 * page counts in the "personal" family, the closest one (a link sent by email to one person).
 */
const loadConfirmation = cache(async (token: string) => {
  const guarded = await guardTokenLookup(await pageClient(), () => signupConfirmationView(token), (view) => !view.linkFound)
  if (guarded.blocked) return { state: TOO_MANY_ATTEMPTS, details: null }
  return guarded.value
})

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const { state } = await loadConfirmation(token)
  return { title: SIGNUP_CONFIRMATION_PAGE_TITLES[state], robots: { index: false, follow: false } }
}

/**
 * Where the confirmation email's link lands (#1253). Opening it changes nothing: mail scanners
 * open links, some run the page's scripts. The « Confirmer mon inscription » button posts
 * (/api/public/confirmations/[token]/confirm).
 */
export default async function SignupEmailConfirmationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { state, details } = await loadConfirmation(token)
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
        {state === TOO_MANY_ATTEMPTS ? <TooManyAttemptsNotice /> : <SignupEmailConfirmation
          token={token}
          state={state}
          details={details ? {
            ...details,
            firstShifts: details.firstShifts.map((s) => ({ ...s, date: s.date.toISOString().slice(0, 10) })),
          } : null}
        />}
      </div>
    </main>
  )
}
