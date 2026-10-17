"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import PasswordRules from "@/components/PasswordRules"
import FormStatus from "@/components/FormStatus"
import { useSubmit } from "@/lib/use-submit"

const inputClass = "w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const buttonLink = "inline-block bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

function AcceptInviteForm() {
  const id = useId()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef<HTMLHeadingElement>(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [done, setDone] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [checking, setChecking] = useState(() => !!token)
  const { submit, busy, error, fail, isInvalid } = useSubmit()

  useEffect(() => { if (done) doneRef.current?.focus() }, [done])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetch(`/api/admin/accept-invite?token=${encodeURIComponent(token)}`)
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return
        if (data?.valid !== true) {
          setTokenError(typeof data?.error === "string" ? data.error : "Ce lien n'est plus valide.")
        }
      })
      .catch(() => {
        // Precheck failing (e.g. offline) shouldn't block the form; the POST on submit re-validates.
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (!token) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-700">Lien invalide.</p>
      </div>
    )
  }

  if (checking) {
    return (
      <p className="text-sm text-gray-600 text-center py-12" role="status">
        Vérification du lien…
      </p>
    )
  }

  if (tokenError) {
    return (
      <div className="text-center space-y-4 py-8" role="alert">
        <h2 className="font-semibold text-gray-900">Lien invalide</h2>
        <p className="text-sm text-gray-600">{tokenError}</p>
        <Link href="/admin/login" className={buttonLink}>Se connecter</Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="text-center space-y-4 py-8">
        <h2 ref={doneRef} tabIndex={-1} className="font-semibold text-gray-900 focus:outline-none">Mot de passe créé</h2>
        <p className="text-sm text-gray-600">Votre compte est actif. Vous pouvez vous connecter.</p>
        <Link href="/admin/login" className={buttonLink}>Se connecter</Link>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password) { fail("Choisissez un mot de passe.", "password", passwordRef.current); return }
    if (password !== confirm) { fail("Les mots de passe ne correspondent pas.", "confirm", confirmRef.current); return }
    const outcome = await submit(() => fetch("/api/admin/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    }), { silent: true })
    if (outcome.ok) { setDone(true); return }
    fail(outcome.error, outcome.status === 400 ? "password" : undefined, outcome.status === 400 ? passwordRef.current : null)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor={`${id}-password`} className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
        <input
          id={`${id}-password`}
          ref={passwordRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={`${id}-rules${error ? ` ${id}-error` : ""}`}
          aria-invalid={isInvalid("password")}
          className={inputClass}
          autoComplete="new-password"
        />
        <PasswordRules password={password} id={`${id}-rules`} />
      </div>
      <div>
        <label htmlFor={`${id}-confirm`} className="block text-sm font-medium text-gray-700 mb-1">Confirmer le mot de passe</label>
        <input
          id={`${id}-confirm`}
          ref={confirmRef}
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={isInvalid("confirm")}
          className={inputClass}
          autoComplete="new-password"
        />
      </div>
      <FormStatus error={error} errorId={`${id}-error`} />
      <button
        type="submit"
        aria-disabled={busy || undefined}
        className={`w-full ${buttonLink} text-center ${busy ? "opacity-80 cursor-wait" : ""}`}
      >
        {busy ? "Enregistrement…" : "Créer mon mot de passe"}
      </button>
    </form>
  )
}

export default function AcceptInvitePage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bienvenue</h1>
          <p className="text-sm text-gray-600 mt-1">Créez votre mot de passe pour activer votre compte.</p>
        </div>
        <Suspense fallback={<p className="text-sm text-gray-600">Chargement…</p>}>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </main>
  )
}
