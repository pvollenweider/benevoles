"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef } from "react"
import Link from "next/link"
import { INVALID_KEEP_LINK } from "@/lib/org-keep"

/**
 * A « Conserver mon organisation » link that can't be used (#811), with the two ways left: sign in
 * (any change to the space is an answer too), or reactivate a space already deactivated. `focus`:
 * shown in place of the button, its heading takes the focus.
 */
export default function InvalidKeepLink({ focus = false }: { focus?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (focus) ref.current?.focus() }, [focus])
  return (
    <div className="space-y-3">
      <h2 ref={ref} tabIndex={-1} className="font-semibold text-gray-900 focus:outline-none">Lien expiré ou déjà utilisé</h2>
      <p className="text-sm text-gray-700">
        {INVALID_KEEP_LINK} Si vous avez déjà appuyé sur « Conserver mon organisation », votre réponse est bien enregistrée : il n&apos;y a rien d&apos;autre à faire. Sinon, si l&apos;espace est encore actif, connectez-vous et créez ou modifiez un événement : cela compte aussi comme une réponse. S&apos;il a été désactivé, vous pouvez le réactiver.
      </p>
      <ul className="text-sm space-y-1">
        <li><Link href="/admin/login" className="text-blue-700 underline underline-offset-2">Se connecter</Link></li>
        <li><Link href="/admin/reactivate" className="text-blue-700 underline underline-offset-2">Réactiver un espace désactivé</Link></li>
      </ul>
    </div>
  )
}
