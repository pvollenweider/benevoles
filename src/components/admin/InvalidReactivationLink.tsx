"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef } from "react"
import Link from "next/link"
import { INVALID_REACTIVATION_LINK } from "@/lib/org-reactivation"

/**
 * A « Réactiver mon espace » link that can't be used (#811), with the way to get a new one. On
 * the link page as it loads, and in place of the button when it turns out spent (`focus`: the
 * heading takes the focus, since it replaces the control the person was on).
 */
export default function InvalidReactivationLink({ focus = false }: { focus?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (focus) ref.current?.focus() }, [focus])
  return (
    <div className="text-center space-y-3">
      <h2 ref={ref} tabIndex={-1} className="font-semibold text-gray-900 focus:outline-none">Lien expiré ou déjà utilisé</h2>
      <p className="text-sm text-gray-700">{INVALID_REACTIVATION_LINK}</p>
      <Link href="/admin/reactivate" className="text-sm text-blue-700 underline underline-offset-2">
        Demander un nouveau lien
      </Link>
    </div>
  )
}
