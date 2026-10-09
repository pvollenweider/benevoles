// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import ContentShell from "@/components/public/ContentShell"
import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import { SITE_CONTAINER_CLASS, SITE_READING_COLUMN_CLASS } from "@/components/public/site-container"
import SignupForm from "@/components/public/signup/SignupForm"
import { signupOpen } from "@/lib/signup"

export const dynamic = "force-dynamic"

// Not indexed yet (#810, part 4b): the page is opened and linked from « Demander un espace » once
// the operator side (validation page, part 4c) is in place.
export const metadata: Metadata = {
  title: "Demander un espace",
  description: "Créez l'espace de votre association sur benevol.app : préparez votre événement tout de suite, la publication suit une courte vérification.",
  robots: { index: false, follow: false },
}

export default function SignupPage() {
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
          <SignupForm open={signupOpen()} />
        </div>
      </main>
    </ContentShell>
  )
}
