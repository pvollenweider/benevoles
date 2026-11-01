"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import FormStatus from "@/components/FormStatus"
import { useSubmit, NETWORK_ERROR } from "@/lib/use-submit"
import { useHydrated } from "@/lib/use-hydrated"
import { codeDigits } from "@/lib/second-factor-display"
import { SECOND_FACTOR_MESSAGES } from "@/lib/second-factor-copy"
import RecoveryCodesPanel, { copyText, secondaryButtonClass, textButtonClass, useAnnouncement } from "./RecoveryCodesPanel"

const inputClass = "w-full border border-gray-500 rounded-xl px-3 py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const primaryButtonClass = "w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-gray-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:opacity-80 disabled:cursor-wait aria-disabled:opacity-80 aria-disabled:cursor-wait"

type Props =
  | { mode: "signin" | "unavailable" | "verify"; email: string; destination: string; secret?: undefined; secretFormatted?: undefined; uri?: undefined; qrSvg?: undefined }
  | { mode: "enrol"; email: string; destination: string; secret: string; secretFormatted: string; uri: string; qrSvg: string }

const SIGN_IN_AGAIN_TEXT = "Pour des raisons de sécurité, reconnectez-vous avec votre mot de passe avant de continuer."

/**
 * The second step of a super admin's sign-in (pentest F6), interactive part: the enrolment
 * (app, QR code or key, first code, then the recovery codes shown once) or the code check (code of
 * the app, or a recovery code). Accessibility review of 2026-11-01: paste and autofill allowed
 * (one-time-code), no auto-submit, the hint stays described next to an error, outcomes announced
 * from regions that stay mounted, focus moved to what replaces a form.
 */
export default function TwoFactorStep(props: Props) {
  const id = useId()
  const router = useRouter()
  const hydrated = useHydrated()
  const { error, fail, reset, isInvalid } = useSubmit()
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [phase, setPhase] = useState<"form" | "codes" | "signin">(props.mode === "signin" ? "signin" : "form")
  const [recovery, setRecovery] = useState(false)
  const [codes, setCodes] = useState<string[]>([])
  const [outcome, setOutcome] = useState("")
  const [signInAlert, setSignInAlert] = useState("")
  const codeRef = useRef<HTMLInputElement>(null)
  const recoveryRef = useRef<HTMLInputElement>(null)
  const codesHeadingRef = useRef<HTMLHeadingElement>(null)
  const signInRef = useRef<HTMLButtonElement>(null)
  const pendingFocus = useRef<"codes" | "signin" | "field" | null>(null)
  const copyKey = useAnnouncement()

  useLayoutEffect(() => {
    const target = pendingFocus.current
    pendingFocus.current = null
    if (target === "codes") codesHeadingRef.current?.focus()
    else if (target === "signin") signInRef.current?.focus()
    else if (target === "field") (recovery ? recoveryRef : codeRef).current?.focus()
  })

  const loginAgainUrl = `/admin/login?callbackUrl=${encodeURIComponent(props.destination)}`
  const signOutAndLogin = () => signOut({ callbackUrl: loginAgainUrl })

  function swapMode() {
    reset()
    pendingFocus.current = "field"
    setRecovery((r) => !r)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busyRef.current) return
    let body: { code: string } | { recoveryCode: string }
    if (recovery) {
      const value = recoveryRef.current?.value.trim() ?? ""
      if (!value) { fail("Saisissez un de vos codes de secours.", "recovery", recoveryRef.current); return }
      body = { recoveryCode: value }
    } else {
      const digits = codeDigits(codeRef.current?.value ?? "")
      if (!digits) { fail("Saisissez le code à 6 chiffres.", "code", codeRef.current); return }
      if (!/^\d{6}$/.test(digits)) { fail("Le code compte 6 chiffres.", "code", codeRef.current); return }
      body = { code: digits }
    }
    const field = recovery ? "recovery" : "code"
    const input = recovery ? recoveryRef.current : codeRef.current
    busyRef.current = true
    setBusy(true)
    reset()
    try {
      const res = await fetch("/api/admin/two-factor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({})) as { error?: string; code?: string; recoveryCodes?: string[] | null }
      if (!res.ok) {
        if (data.code === "SIGN_IN_AGAIN") {
          pendingFocus.current = "signin"
          flushSync(() => { setPhase("signin"); setSignInAlert(data.error ?? SIGN_IN_AGAIN_TEXT) })
          return
        }
        fail(data.error ?? SECOND_FACTOR_MESSAGES.invalidCode, field, input)
        input?.select()
        return
      }
      if (data.recoveryCodes && data.recoveryCodes.length > 0) {
        pendingFocus.current = "codes"
        flushSync(() => { setCodes(data.recoveryCodes!); setPhase("codes"); setOutcome("Double authentification activée.") })
        return
      }
      router.replace(props.destination)
      router.refresh()
    } catch {
      fail(NETWORK_ERROR.replace("d'enregistrer", "de vérifier le code"), field, input)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const errorId = `${id}-error`
  const codeHintId = `${id}-code-hint`
  const recoveryHintId = `${id}-recovery-hint`
  const describedBy = (hint: string) => (error ? `${errorId} ${hint}` : hint)

  const title = props.mode === "enrol" && phase !== "signin" ? "Activez la double authentification" : "Double authentification"

  const codeForm = (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {recovery ? (
        <div key="recovery">
          <label htmlFor={`${id}-recovery`} className="block text-sm font-medium text-gray-700 mb-1">Code de secours</label>
          <input
            id={`${id}-recovery`}
            ref={recoveryRef}
            name="recovery-code"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={isInvalid("recovery")}
            aria-describedby={describedBy(recoveryHintId)}
            className={`${inputClass} font-mono`}
          />
          <p id={recoveryHintId} className="text-xs text-gray-600 mt-1">16 caractères, avec ou sans tirets.</p>
        </div>
      ) : (
        <div key="code">
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
            aria-describedby={describedBy(codeHintId)}
            className={`${inputClass} font-mono tracking-wider`}
          />
          <p id={codeHintId} className="text-xs text-gray-600 mt-1">Le code change toutes les 30 secondes.</p>
        </div>
      )}
      <FormStatus error={error} errorId={errorId} />
      <button type="submit" disabled={!hydrated} aria-disabled={busy || undefined} className={primaryButtonClass}>
        {busy ? "Vérification…" : props.mode === "enrol" ? "Activer" : "Valider"}
      </button>
      <noscript>
        <p className="text-sm text-gray-700">JavaScript est nécessaire pour continuer.</p>
      </noscript>
    </form>
  )

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          {/* Always mounted: the outcome of the form that the recovery codes replace. */}
          <p role="status" className={outcome ? "text-sm font-medium text-green-800" : "sr-only"}>{outcome}</p>
          <p id={`${id}-signin-alert`} role="alert" className={signInAlert ? "text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2" : "sr-only"}>{signInAlert}</p>

          {phase === "signin" && (
            <>
              {!signInAlert && <p id={`${id}-signin-text`} className="text-sm text-gray-700">{SIGN_IN_AGAIN_TEXT}</p>}
              <button ref={signInRef} type="button" aria-describedby={signInAlert ? `${id}-signin-alert` : `${id}-signin-text`} onClick={signOutAndLogin} disabled={!hydrated} className={primaryButtonClass}>Se reconnecter</button>
            </>
          )}

          {phase !== "signin" && props.mode === "unavailable" && (
            <p className="text-sm text-gray-700">{SECOND_FACTOR_MESSAGES.unavailable}</p>
          )}

          {phase === "form" && props.mode === "verify" && (
            <>
              <p className="text-sm text-gray-700">
                {recovery ? "Saisissez l'un de vos codes de secours. Chaque code ne sert qu'une fois." : "Saisissez le code à 6 chiffres affiché par votre application d'authentification."}
              </p>
              {codeForm}
              <div className="text-center">
                <button type="button" onClick={swapMode} disabled={!hydrated} className={textButtonClass}>
                  {recovery ? "Utiliser plutôt le code de l'application" : "Utiliser un code de secours"}
                </button>
              </div>
            </>
          )}

          {phase === "form" && props.mode === "enrol" && (
            <>
              <p className="text-sm text-gray-700">
                Votre compte super admin donne accès à toutes les organisations. En plus du mot de passe, un code à 6 chiffres de votre téléphone sera demandé à chaque connexion.
              </p>
              <ol className="list-decimal pl-5 space-y-6 text-sm text-gray-700 marker:font-semibold marker:text-gray-900">
                <li>
                  Installez une application d&apos;authentification sur votre téléphone, par exemple Aegis, Google Authenticator ou Microsoft Authenticator. Un gestionnaire de mots de passe qui produit ces codes convient aussi.
                </li>
                <li className="space-y-3">
                  <p>Scannez ce code QR avec l&apos;application.</p>
                  {/* SVG made on the server by the qrcode library from the otpauth address: no user input in it. */}
                  <div
                    role="img"
                    aria-label="Code QR à scanner avec votre application d'authentification"
                    className="w-48 max-w-full bg-white forced-color-adjust-none [&>svg]:block [&>svg]:w-full [&>svg]:h-auto"
                    dangerouslySetInnerHTML={{ __html: props.qrSvg }}
                  />
                  <p>Pas de caméra, ou vous êtes sur ce téléphone ? Saisissez cette clé dans l&apos;application :</p>
                  <p><code className="font-mono slashed-zero text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 leading-8 [box-decoration-break:clone]">{props.secretFormatted}</code></p>
                  <p className="text-xs text-gray-600">Lettres A à Z et chiffres 2 à 7. Les espaces ne comptent pas.</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={!hydrated}
                      onClick={async () => copyKey.announce((await copyText(props.secret)) ? "Clé copiée." : "Copie impossible. Sélectionnez la clé et copiez-la.")}
                      className={secondaryButtonClass}
                    >
                      Copier la clé
                    </button>
                    <a href={props.uri} className={textButtonClass}>Ouvrir dans l&apos;application de cet appareil</a>
                  </div>
                  <p role="status" className={copyKey.message ? "text-sm font-medium text-gray-800" : "sr-only"}>{copyKey.message}</p>
                </li>
                <li className="space-y-3">
                  <p>Saisissez le code que l&apos;application affiche pour ce compte.</p>
                  {codeForm}
                </li>
              </ol>
            </>
          )}

          {phase === "codes" && (
            <RecoveryCodesPanel ref={codesHeadingRef} codes={codes} email={props.email} headingLevel={2}>
              <button
                type="button"
                onClick={() => { router.replace(props.destination); router.refresh() }}
                className={primaryButtonClass}
              >
                J&apos;ai noté mes codes, continuer
              </button>
            </RecoveryCodesPanel>
          )}

          {(phase === "form" || props.mode === "unavailable") && phase !== "codes" && (
            <div className="text-center border-t border-gray-100 pt-4">
              <button type="button" onClick={() => signOut({ callbackUrl: "/admin/login" })} disabled={!hydrated} className={textButtonClass}>Se déconnecter</button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
