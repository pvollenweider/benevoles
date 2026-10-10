"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { useSubmit } from "@/lib/use-submit"
import FormStatus from "@/components/FormStatus"
import InvalidReactivationLink from "@/components/admin/InvalidReactivationLink"

const buttonLink = "inline-block bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * The button of the « Réactiver mon espace » link page (#811): one press reactivates the space.
 * The confirmation replaces the form and takes the focus; so does the expired-link message (a link
 * presented once is spent, so the button could never work again).
 */
export default function ReactivateConfirm({ secret, organizationName }: { secret: string; organizationName: string }) {
  const id = useId()
  const doneRef = useRef<HTMLHeadingElement>(null)
  const [done, setDone] = useState(false)
  const [expired, setExpired] = useState(false)
  const { submit, busy, error, fail } = useSubmit()

  useEffect(() => { if (done) doneRef.current?.focus() }, [done])

  if (done) {
    return (
      <div className="text-center space-y-4">
        <h2 ref={doneRef} tabIndex={-1} className="font-semibold text-gray-900 focus:outline-none">Espace réactivé</h2>
        <p className="text-sm text-gray-600">L&apos;espace de {organizationName} est de nouveau actif. Vous pouvez vous connecter.</p>
        <Link href="/admin/login" className={buttonLink}>Se connecter</Link>
      </div>
    )
  }

  if (expired) return <InvalidReactivationLink focus />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const outcome = await submit(() => fetch("/api/public/org-reactivation/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: secret }),
    }), { silent: true })
    if (outcome.ok) setDone(true)
    else if (outcome.status === 400) setExpired(true)
    // Too many tries or no network: the link is intact, the button can be pressed again.
    else if (outcome.error) fail(outcome.error)
  }

  return (
    // Before hydration, a native submit reloads this same page with its link (the hidden field).
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <input type="hidden" name="token" value={secret} />
      <p className="text-sm text-gray-800">
        L&apos;espace de <strong>{organizationName}</strong> a été désactivé faute d&apos;activité. Ses événements, ses membres et ses réglages sont toujours là. En le réactivant, vous confirmez que vous souhaitez le conserver.
      </p>
      <FormStatus error={error} errorId={`${id}-error`} />
      <button
        type="submit"
        aria-disabled={busy || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-gray-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 ${busy ? "opacity-80 cursor-wait" : ""}`}
      >
        {busy ? "Réactivation…" : "Réactiver l'espace"}
      </button>
    </form>
  )
}
