"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import FormStatus from "@/components/FormStatus"
import { useSubmit } from "@/lib/use-submit"

const inputClass = "w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

export default function LoginPage() {
  const id = useId()
  const router = useRouter()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  // signIn isn't a fetch: only the error handling of the shared hook is used here.
  const { error, fail, isInvalid, reset } = useSubmit()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busyRef.current) return
    if (!email.trim()) { fail("Indiquez votre email.", "email", emailRef.current); return }
    if (!password) { fail("Indiquez votre mot de passe.", "password", passwordRef.current); return }
    busyRef.current = true
    setLoading(true)
    reset()
    try {
      const result = await signIn("credentials", { email: email.trim(), password, redirect: false })
      if (result?.error) {
        fail("Email ou mot de passe incorrect.", "password", passwordRef.current)
        return
      }
      router.push("/admin/events")
      router.refresh()
    } catch {
      fail("Connexion impossible. Vérifiez votre réseau et réessayez.")
    } finally {
      busyRef.current = false
      setLoading(false)
    }
  }

  const wrongCredentials = error === "Email ou mot de passe incorrect."
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Administration</h1>
          <p className="text-gray-600 text-sm mt-1">Espace réservé aux organisateurs</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div>
            <label htmlFor={`${id}-email`} className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              id={`${id}-email`}
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={isInvalid("email") || (wrongCredentials ? true : undefined)}
              aria-describedby={error ? `${id}-error` : undefined}
              className={inputClass}
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor={`${id}-password`} className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              id={`${id}-password`}
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={isInvalid("password")}
              aria-describedby={error ? `${id}-error` : undefined}
              className={inputClass}
              autoComplete="current-password"
            />
          </div>

          <FormStatus error={error} errorId={`${id}-error`} />

          <button
            type="submit"
            aria-disabled={loading || undefined}
            className={`w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-gray-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 ${loading ? "opacity-80 cursor-wait" : ""}`}
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
          <div className="text-center">
            <Link href="/admin/forgot-password" className="text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900">
              Mot de passe oublié ?
            </Link>
          </div>
        </form>
      </div>
    </main>
  )
}
