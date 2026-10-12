// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import ContentShell from "@/components/public/ContentShell"
import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import { SITE_CONTAINER_CLASS, SITE_READING_COLUMN_CLASS } from "@/components/public/site-container"
import SignupForm from "@/components/public/signup/SignupForm"
import { isSignupOpen } from "@/lib/signup-switch"
import { signupClosedMessage } from "@/lib/signup"
import { contactEmail, privacyHref } from "@/lib/site"
import { publicPageMetadata } from "@/lib/doc-pages"
import { apexBaseUrl } from "@/lib/urls"

export const dynamic = "force-dynamic"

// The target of every « Demander un espace » (#810, part 4d). Its title, description, canonical
// on the apex host and link preview come from its entry in src/lib/doc-pages.ts (#934).
export function generateMetadata(): Metadata {
  return publicPageMetadata("/inscription", apexBaseUrl())
}

export default async function SignupPage() {
  return (
    <ContentShell layout="doc">
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className={`${SITE_CONTAINER_CLASS} py-12 focus:outline-none`}>
        <div className={`${SITE_READING_COLUMN_CLASS} max-w-[65ch] space-y-6`}>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Demander un espace</h1>
            <p className="text-base text-gray-700 dark:text-gray-300 leading-[1.75]">
              Votre espace est prêt dès que vous avez confirmé votre adresse : vous pouvez préparer votre événement tout de suite. Sa publication et l&apos;envoi d&apos;invitations seront possibles après une courte vérification de votre inscription ; vous recevrez un email dès que votre espace sera activé.
            </p>
          </div>
          <SignupForm open={await isSignupOpen()} closedMessage={signupClosedMessage(contactEmail())} privacyHref={privacyHref()} />
        </div>
      </main>
    </ContentShell>
  )
}
