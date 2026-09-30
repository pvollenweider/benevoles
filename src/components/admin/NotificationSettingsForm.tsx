"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import { REMINDER_LABELS, type NotificationSettings, type ReminderKey } from "@/lib/notification-settings"

type Props = { initialSettings: NotificationSettings; initialReplyTo: string | null; adminEmail: string | null }
type Message = { kind: "ok" | "error"; text: string } | null

/**
 * Notification settings of the organization (#381): the three reminders, the sign-up email to
 * admins, the reply-to address, and a test email to the admin's own address. One message at a
 * time: successes through the status region, failures through the alert; a field error only
 * when the address itself is wrong.
 */
export default function NotificationSettingsForm({ initialSettings, initialReplyTo, adminEmail }: Props) {
  const id = useId()
  const [settings, setSettings] = useState(initialSettings)
  const [replyTo, setReplyTo] = useState(initialReplyTo ?? "")
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<Message>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const replyToRef = useRef<HTMLInputElement>(null)

  const replyToValid = replyTo.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo.trim())

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!replyToValid) {
      setFieldError("Indiquez une adresse email complète, ou laissez le champ vide.")
      replyToRef.current?.focus()
      return
    }
    setSaving(true)
    setMessage(null)
    setFieldError(null)
    try {
      const res = await fetch("/api/admin/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyToEmail: replyTo.trim(), settings }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const text = typeof data?.error === "string" ? data.error : "Une erreur est survenue."
        // A 400 is about the address (the only free field); anything else is the request itself.
        if (res.status === 400) { setFieldError(text); replyToRef.current?.focus() } else setMessage({ kind: "error", text })
        return
      }
      setSettings(data.settings)
      setReplyTo(data.replyToEmail ?? "")
      setMessage({ kind: "ok", text: "Réglages enregistrés." })
    } catch {
      setMessage({ kind: "error", text: "Impossible d'enregistrer. Vérifiez votre connexion et réessayez." })
    } finally {
      setSaving(false)
    }
  }

  async function sendTest() {
    if (testing || !adminEmail) return
    setTesting(true)
    setMessage(null)
    try {
      const res = await fetch("/api/admin/settings/notifications/test", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setMessage({ kind: "error", text: typeof data?.error === "string" ? data.error : "L'email de test n'a pas pu être envoyé." })
      else setMessage({ kind: "ok", text: `Email de test envoyé à ${data.to}. Il part dans la minute.` })
    } catch {
      setMessage({ kind: "error", text: "Connexion impossible. Réessayez." })
    } finally {
      setTesting(false)
    }
  }

  const toggle = (key: ReminderKey) => setSettings((s) => ({ ...s, reminders: { ...s.reminders, [key]: !s.reminders[key] } }))
  const checkboxClass = "mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
  const testDisabled = testing || !adminEmail

  return (
    <form onSubmit={save} noValidate aria-labelledby={`${id}-title`} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
      <h2 id={`${id}-title`} className="text-base font-semibold text-gray-900">Réglages des emails</h2>

      <fieldset className="space-y-2">
        <legend className="text-sm text-gray-800 mb-1">Rappels automatiques aux bénévoles inscrits</legend>
        <p id={`${id}-reminders-note`} className="text-xs text-gray-600 pb-1">Pour toute l&apos;organisation ; un événement peut en plus couper tous ses rappels dans ses propres réglages.</p>
        {(Object.keys(REMINDER_LABELS) as ReminderKey[]).map((k) => (
          <div key={k} className="flex items-start gap-3">
            <input id={`${id}-${k}`} type="checkbox" checked={settings.reminders[k]} onChange={() => toggle(k)} aria-describedby={`${id}-${k}-help ${id}-reminders-note`} className={checkboxClass} />
            <div>
              <label htmlFor={`${id}-${k}`} className="text-sm font-medium text-gray-800">{REMINDER_LABELS[k].label}</label>
              <p id={`${id}-${k}-help`} className="text-xs text-gray-600">{REMINDER_LABELS[k].help}</p>
            </div>
          </div>
        ))}
      </fieldset>

      <div className="flex items-start gap-3">
        <input id={`${id}-signup`} type="checkbox" checked={settings.signupAdminEmail} onChange={(e) => setSettings((s) => ({ ...s, signupAdminEmail: e.target.checked }))} aria-describedby={`${id}-signup-help`} className={checkboxClass} />
        <div>
          <label htmlFor={`${id}-signup`} className="text-sm font-medium text-gray-800">Prévenir les administrateurs à chaque inscription</label>
          <p id={`${id}-signup-help`} className="text-xs text-gray-600">Un email à chaque administrateur actif quand un bénévole s&apos;inscrit depuis la page publique.</p>
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-replyto`} className="block text-sm text-gray-800 mb-1">Adresse de réponse</label>
        <input
          id={`${id}-replyto`}
          ref={replyToRef}
          type="email"
          autoComplete="off"
          value={replyTo}
          onChange={(e) => { setReplyTo(e.target.value); setFieldError(null) }}
          aria-describedby={fieldError ? `${id}-replyto-help ${id}-replyto-error` : `${id}-replyto-help`}
          aria-invalid={fieldError ? true : undefined}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        />
        <p id={`${id}-replyto-help`} className="mt-1 text-xs text-gray-600">
          Quand un bénévole répond à un email de l&apos;application, sa réponse arrive ici, par exemple contact@votre-association.ch. Laissez vide pour utiliser l&apos;adresse par défaut de la plateforme. Cette adresse figure aussi sur la page personnelle des bénévoles.
        </p>
        {fieldError && <p id={`${id}-replyto-error`} className="mt-1 text-sm font-medium text-red-700">{fieldError}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          aria-disabled={saving || undefined}
          className={`bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={sendTest}
          aria-disabled={testDisabled || undefined}
          aria-describedby={`${id}-test-help`}
          className={`text-sm font-medium text-blue-700 border border-blue-600 rounded-xl px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${testDisabled ? "opacity-60 cursor-not-allowed" : "hover:bg-blue-50"}`}
        >
          {testing ? "Envoi…" : "M'envoyer un email de test"}
        </button>
        <span id={`${id}-test-help`} className="text-xs text-gray-600">{adminEmail ? `À ${adminEmail}, avec les réglages enregistrés.` : "Votre compte n'a pas d'adresse email (Paramètres → Administrateurs)."}</span>
      </div>
      {/* Both regions always mounted: an announcement never relies on the element being inserted. */}
      <p role="status" className="text-sm font-medium text-green-800 min-h-5">{message?.kind === "ok" ? message.text : ""}</p>
      <p role="alert" className="text-sm font-medium text-red-700 min-h-5">{message?.kind === "error" ? message.text : ""}</p>
    </form>
  )
}
