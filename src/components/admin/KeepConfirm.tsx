"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import { useSubmit } from "@/lib/use-submit"
import { INACTIVITY_MONTHS } from "@/lib/org-inactivity"
import FormStatus from "@/components/FormStatus"
import InvalidKeepLink from "@/components/admin/InvalidKeepLink"

/**
 * The button of the « Conserver mon organisation » link page (#811): one press records that the
 * space is wanted. The confirmation replaces the form and takes the focus; so does the
 * expired-link message.
 */
export default function KeepConfirm({ secret, organizationName }: { secret: string; organizationName: string }) {
  const id = useId()
  const doneRef = useRef<HTMLHeadingElement>(null)
  const [done, setDone] = useState(false)
  const [expired, setExpired] = useState(false)
  const { submit, busy, error, fail } = useSubmit()

  useEffect(() => { if (done) doneRef.current?.focus() }, [done])

  if (done) {
    return (
      <div className="space-y-3">
        <h2 ref={doneRef} tabIndex={-1} className="font-semibold text-gray-900 focus:outline-none">C&apos;est noté, merci</h2>
        <p className="text-sm text-gray-700">
          L&apos;espace de {organizationName} est conservé. Nous vous reposerons la question seulement si l&apos;espace reste {INACTIVITY_MONTHS} mois sans activité et sans événement prévu.
        </p>
      </div>
    )
  }

  if (expired) return <InvalidKeepLink focus />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const outcome = await submit(() => fetch("/api/public/org-keep", {
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
        Vous souhaitez conserver l&apos;espace de <strong>{organizationName}</strong> ? Il suffit d&apos;appuyer sur le bouton : il restera actif, avec ses événements, ses membres et ses réglages.
      </p>
      <FormStatus error={error} errorId={`${id}-error`} />
      <button
        type="submit"
        aria-disabled={busy || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-gray-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 ${busy ? "opacity-80 cursor-wait" : ""}`}
      >
        {busy ? "Enregistrement…" : "Conserver mon organisation"}
      </button>
    </form>
  )
}
