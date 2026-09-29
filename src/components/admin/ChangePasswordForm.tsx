"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import PasswordRules from "@/components/PasswordRules"
import { PASSWORD_RULES } from "@/lib/password"

export default function ChangePasswordForm({ email }: { email: string }) {
  const router = useRouter()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  // The mismatch message waits until the confirmation field is left (or the form submitted),
  // instead of flagging an error from the first character typed.
  const [confirmTouched, setConfirmTouched] = useState(false)
  const currentId = useId()
  const nextId = useId()
  const rulesId = useId()
  const confirmId = useId()
  const mismatchId = useId()

  const rulesOk = PASSWORD_RULES.every((r) => r.test(next))
  const match = next === confirm && next.length > 0
  const mismatch = confirmTouched && confirm.length > 0 && !match
  const canSubmit = current.length > 0 && rulesOk && match

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setConfirmTouched(true)
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch("/api/admin/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Une erreur est survenue.")
        return
      }
      // The change signed out every session, this one included (#360): sign it in again with the
      // password just set, so only sessions opened before the change are lost.
      const again = await signIn("credentials", { email, password: next, redirect: false })
      if (!again || again.error) {
        router.push("/admin/login")
        return
      }
      setSuccess(true)
      setCurrent("")
      setNext("")
      setConfirm("")
      setConfirmTouched(false)
    } catch {
      setError("Impossible d'enregistrer. Vérifiez votre connexion et réessayez.")
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div>
        <label htmlFor={currentId} className="block text-xs font-medium text-gray-700 mb-1">Mot de passe actuel</label>
        <input
          id={currentId}
          type="password"
          value={current}
          onChange={(e) => { setCurrent(e.target.value); setSuccess(false) }}
          className={inputClass}
          autoComplete="current-password"
          required
        />
      </div>

      <div>
        <label htmlFor={nextId} className="block text-xs font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
        <input
          id={nextId}
          type="password"
          value={next}
          onChange={(e) => { setNext(e.target.value); setSuccess(false) }}
          className={inputClass}
          autoComplete="new-password"
          aria-describedby={rulesId}
          required
        />
        <PasswordRules id={rulesId} password={next} />
      </div>

      <div>
        <label htmlFor={confirmId} className="block text-xs font-medium text-gray-700 mb-1">Confirmer le nouveau mot de passe</label>
        <input
          id={confirmId}
          type="password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setSuccess(false) }}
          onBlur={() => setConfirmTouched(true)}
          className={inputClass}
          autoComplete="new-password"
          aria-invalid={mismatch || undefined}
          aria-describedby={mismatch ? mismatchId : undefined}
          required
        />
        {mismatch && (
          <p id={mismatchId} className="text-xs text-red-700 mt-1">Les deux mots de passe ne correspondent pas.</p>
        )}
      </div>

      {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit || loading}
        className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
      >
        {loading ? "Enregistrement…" : "Changer le mot de passe"}
      </button>

      <p role="status" className="text-sm font-medium text-green-800 min-h-5">
        {success ? "Mot de passe modifié." : ""}
      </p>
    </form>
  )
}
