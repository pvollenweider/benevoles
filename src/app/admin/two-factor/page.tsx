// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { secondFactorPage } from "@/lib/second-factor-server"
import { afterSecondFactor } from "@/lib/second-factor-session"
import { formatTotpSecret } from "@/lib/totp"
import TwoFactorStep from "@/components/second-factor/TwoFactorStep"

/**
 * The second step of a super admin's sign-in (pentest F6): enrol an authenticator app, or give its
 * code (or a recovery code). The proxy sends every admin page here while the session is pending;
 * a completed session is sent on to where it was going.
 */

type Props = { searchParams: Promise<{ callbackUrl?: string | string[] }> }

// A fixed title (no async metadata): it is in the document from the first byte, whatever the step.
export const metadata: Metadata = { title: "Double authentification" }

export default async function TwoFactorPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user?.id) redirect("/admin/login")
  const raw = (await searchParams).callbackUrl
  const destination = afterSecondFactor(typeof raw === "string" ? raw : null)
  if (!session.secondFactor?.pending) redirect(destination)

  const state = await secondFactorPage(session)
  // Not an account that gives a second factor (or gone): nothing to do here.
  if (!state) redirect("/admin/login")
  if (state.mode === "enrol") return <TwoFactorStep {...state} secretFormatted={formatTotpSecret(state.secret)} destination={destination} />
  return <TwoFactorStep mode={state.mode} email={state.email} destination={destination} />
}
