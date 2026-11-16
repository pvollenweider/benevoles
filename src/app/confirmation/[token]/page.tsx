// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { cache } from "react"
import SignupEmailConfirmation from "@/components/public/SignupEmailConfirmation"
import { signupConfirmationView } from "@/lib/signup-confirmation-server"
import { SIGNUP_CONFIRMATION_PAGE_TITLES } from "@/lib/signup-confirmation"

export const dynamic = "force-dynamic"

/** One read per request, shared by generateMetadata and the page. Read-only (#1253). */
const loadConfirmation = cache((token: string) => signupConfirmationView(token))

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
        <SignupEmailConfirmation
          token={token}
          state={state}
          details={details ? {
            ...details,
            firstShifts: details.firstShifts.map((s) => ({ ...s, date: s.date.toISOString().slice(0, 10) })),
          } : null}
        />
      </div>
    </main>
  )
}
