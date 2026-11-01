"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import FormStatus from "@/components/FormStatus"
import RecoveryCodesPanel, { secondaryButtonClass } from "@/components/second-factor/RecoveryCodesPanel"
import { useSubmit, NETWORK_ERROR } from "@/lib/use-submit"
import { useHydrated } from "@/lib/use-hydrated"
import { codeDigits, RECOVERY_CODE_COUNT_SHOWN } from "@/lib/second-factor-display"
import { SECOND_FACTOR_MESSAGES } from "@/lib/second-factor-copy"

const inputClass = "w-full border border-gray-500 rounded-xl px-3 py-2 text-sm font-mono tracking-wider focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

type Props = { enabledLabel: string | null; recoveryCodesLeft: number; email: string }

/**
 * The super admin's second factor on the profile page (pentest F6): when it was turned on, how many
 * recovery codes are left, and new codes (with a current code of the app). Turning it off is not
 * offered: it is mandatory; the server operator resets it (docs/double-authentification.md).
 */
export default function SecondFactorCard({ enabledLabel, recoveryCodesLeft, email }: Props) {
  const id = useId()
  const hydrated = useHydrated()
  const { error, fail, reset, isInvalid } = useSubmit()
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [left, setLeft] = useState(recoveryCodesLeft)
  const [outcome, setOutcome] = useState("")
  const codeRef = useRef<HTMLInputElement>(null)
  const panelHeadingRef = useRef<HTMLHeadingElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const pendingFocus = useRef<"panel" | "title" | null>(null)

  useLayoutEffect(() => {
    const target = pendingFocus.current
    pendingFocus.current = null
    if (target === "panel") panelHeadingRef.current?.focus()
    else if (target === "title") titleRef.current?.focus()
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busyRef.current) return
    const digits = codeDigits(codeRef.current?.value ?? "")
    if (!digits) return fail("Saisissez le code à 6 chiffres.", "code", codeRef.current)
    if (!/^\d{6}$/.test(digits)) return fail("Le code compte 6 chiffres.", "code", codeRef.current)
    busyRef.current = true
    setBusy(true)
    reset()
    try {
      const res = await fetch("/api/super-admin/two-factor/recovery-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: digits }) })
      const data = await res.json().catch(() => ({})) as { error?: string; recoveryCodes?: string[] }
      if (!res.ok || !data.recoveryCodes) {
        fail(data.error ?? SECOND_FACTOR_MESSAGES.invalidCode, "code", codeRef.current)
        codeRef.current?.select()
        return
      }
      pendingFocus.current = "panel"
      flushSync(() => {
        setCodes(data.recoveryCodes!)
        setLeft(data.recoveryCodes!.length)
        setOutcome("Nouveaux codes de secours créés. Les anciens ne fonctionnent plus.")
      })
    } catch {
      fail(NETWORK_ERROR.replace("d'enregistrer", "de vérifier le code"), "code", codeRef.current)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function done() {
    pendingFocus.current = "title"
    setCodes(null)
    setOutcome("")
  }

  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <section aria-labelledby={`${id}-title`} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 mt-6">
      <h2 id={`${id}-title`} ref={titleRef} tabIndex={-1} className="text-base font-semibold text-gray-900 outline-none">Double authentification</h2>
      <p role="status" className={outcome ? "text-sm font-medium text-green-800" : "sr-only"}>{outcome}</p>
      {codes ? (
        <RecoveryCodesPanel ref={panelHeadingRef} codes={codes} email={email} headingLevel={3}>
          <button type="button" onClick={done} className={secondaryButtonClass}>Terminé</button>
        </RecoveryCodesPanel>
      ) : (
        <>
          <p className="text-sm text-gray-700">
            {enabledLabel ? `Activée le ${enabledLabel}.` : "Activée."} Codes de secours restants : {left} sur {RECOVERY_CODE_COUNT_SHOWN}.
          </p>
          {left <= 2 && (
            <p className="text-sm text-gray-900 font-medium">
              {left === 0 ? "Il ne vous reste aucun code de secours" : left === 1 ? "Il ne vous reste qu'un code de secours" : `Il ne vous reste que ${left} codes de secours`} : créez-en de nouveaux.
            </p>
          )}
          <form onSubmit={handleSubmit} noValidate className="space-y-3">
            <p className="text-sm text-gray-700">De nouveaux codes remplacent les anciens, qui ne fonctionneront plus.</p>
            <div>
              <label htmlFor={`${id}-code`} className="block text-sm font-medium text-gray-700 mb-1">Code à 6 chiffres affiché par l&apos;application</label>
              <input
                id={`${id}-code`}
                ref={codeRef}
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={isInvalid("code")}
                aria-describedby={error ? `${errorId} ${hintId}` : hintId}
                className={inputClass}
              />
              <p id={hintId} className="text-xs text-gray-600 mt-1">Le code change toutes les 30 secondes.</p>
            </div>
            <FormStatus error={error} errorId={errorId} />
            <button
              type="submit"
              disabled={!hydrated}
              aria-disabled={busy || undefined}
              className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-xl hover:bg-blue-700 aria-disabled:opacity-50 disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
            >
              {busy ? "Création…" : "Créer de nouveaux codes de secours"}
            </button>
          </form>
          <p className="text-sm text-gray-700">Téléphone perdu et plus aucun code de secours : l&apos;exploitant du serveur peut réinitialiser la double authentification.</p>
        </>
      )}
    </section>
  )
}
