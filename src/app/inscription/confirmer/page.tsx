// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import ContentShell from "@/components/public/ContentShell"
import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import { SITE_CONTAINER_CLASS, SITE_READING_COLUMN_CLASS } from "@/components/public/site-container"
import ConfirmSignup from "@/components/public/signup/ConfirmSignup"
import { signupRequestState } from "@/lib/signup-server"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Confirmer votre adresse", robots: { index: false, follow: false } }

/**
 * Where the confirmation email's link lands (#810, part 4b). Reading the page changes nothing: mail
 * scanners open links. The « Confirmer » button does it (POST /api/public/signup/confirm).
 */
export default async function ConfirmSignupPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const link = typeof t === "string" ? t : ""
  const { state, organizationName } = await signupRequestState(link)
  return (
    <ContentShell layout="doc">
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className={`${SITE_CONTAINER_CLASS} py-12 focus:outline-none`}>
        <div className={`${SITE_READING_COLUMN_CLASS} max-w-[65ch] space-y-6`}>
          <ConfirmSignup link={link} state={state} organizationName={organizationName} />
        </div>
      </main>
    </ContentShell>
  )
}
