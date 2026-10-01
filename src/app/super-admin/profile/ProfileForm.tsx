"use client"

import { useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import PasswordRules from "@/components/PasswordRules"

type ErrorField = "current" | "confirm" | "email" | null

export default function ProfileForm({ currentEmail }: { currentEmail: string }) {
  const router = useRouter()
  const [email, setEmail] = useState(currentEmail)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<{ message: string; field: ErrorField } | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const emailId = useId()
  const newId = useId()
  const rulesId = useId()
  const confirmId = useId()
  const currentId = useId()
  const errorId = useId()
  const emailRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const currentRef = useRef<HTMLInputElement>(null)

  // Cleared first, then set on the next frame: the alert region is always mounted, and the same
  // message twice in a row would otherwise not be announced again.
  function fail(message: string, field: ErrorField) {
    setError(null)
    requestAnimationFrame(() => {
      setError({ message, field })
      const target = field === "email" ? emailRef : field === "confirm" ? confirmRef : field === "current" ? currentRef : null
      target?.current?.focus()
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setSuccess(false)

    if (!currentPassword) return fail("Le mot de passe actuel est obligatoire.", "current")
    if (newPassword && newPassword !== confirm) return fail("Les mots de passe ne correspondent pas.", "confirm")

    const payload: Record<string, string> = { currentPassword }
    if (email !== currentEmail) payload.email = email
    if (newPassword) payload.newPassword = newPassword
    if (!payload.email && !payload.newPassword) return fail("Aucune modification détectée.", "email")

    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/super-admin/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const message = typeof data?.error === "string" ? data.error : "Une erreur est survenue."
        return fail(message, /mot de passe actuel|tentatives/i.test(message) ? "current" : null)
      }
      // A new password signed out every session, this one included (#360): sign in again with it.
      if (payload.newPassword) {
        const again = await signIn("credentials", { email: payload.email ?? currentEmail, password: payload.newPassword, redirect: false })
        if (!again || again.error) {
          router.push("/admin/login")
          return
        }
      }
      setSuccess(true)
      setCurrentPassword("")
      setNewPassword("")
      setConfirm("")
      // The session now carries the new email (refreshAdminToken reloads it): re-render the page
      // so `currentEmail` follows.
      if (payload.email) router.refresh()
    } catch {
      fail("Impossible d'enregistrer. Vérifiez votre connexion et réessayez.", null)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full border border-gray-500 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
  const errorProps = (field: ErrorField) =>
    error?.field === field ? { "aria-invalid": true as const, "aria-describedby": errorId } : {}

  return (
    <form onSubmit={handleSubmit} noValidate className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
      <p className="text-xs text-gray-600">* Champ obligatoire</p>

      <div>
        <label htmlFor={emailId} className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          ref={emailRef}
          id={emailId}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className={inputClass}
          {...errorProps("email")}
        />
      </div>

      <hr className="border-gray-100" />

      <div>
        <label htmlFor={newId} className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
        <input
          id={newId}
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Laisser vide pour ne pas changer"
          autoComplete="new-password"
          aria-describedby={rulesId}
          className={inputClass}
        />
        <PasswordRules id={rulesId} password={newPassword} />
      </div>

      {newPassword && (
        <div>
          <label htmlFor={confirmId} className="block text-sm font-medium text-gray-700 mb-1">
            Confirmer le nouveau mot de passe <span aria-hidden="true" className="text-red-700">*</span>
          </label>
          <input
            ref={confirmRef}
            id={confirmId}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            className={inputClass}
            {...errorProps("confirm")}
          />
        </div>
      )}

      <hr className="border-gray-100" />

      <div>
        <label htmlFor={currentId} className="block text-sm font-medium text-gray-700 mb-1">
          Mot de passe actuel <span aria-hidden="true" className="text-red-700">*</span>
        </label>
        <input
          ref={currentRef}
          id={currentId}
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
          className={inputClass}
          {...errorProps("current")}
        />
      </div>

      <p id={errorId} role="alert" className="text-sm font-medium text-red-700 empty:hidden">{error?.message ?? ""}</p>
      <p role="status" className="text-sm font-medium text-green-800 min-h-5">
        {success ? "Profil mis à jour avec succès." : ""}
      </p>

      {/* Not `disabled`: a disabled button leaves the tab order without saying why. While saving,
          aria-disabled and the handler's guard prevent a double submit. */}
      <button
        type="submit"
        aria-disabled={loading || undefined}
        className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 aria-disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
      >
        {loading ? "Enregistrement…" : "Enregistrer les modifications"}
      </button>
    </form>
  )
}
