"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import { announce } from "@/lib/announce"
import FormStatus from "@/components/FormStatus"
import { requestJson, useSubmit } from "@/lib/use-submit"
import { useRouter } from "next/navigation"

export default function NewOrgForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [adminName, setAdminName] = useState("")
  const { submit: run, busy: submitting, error, fail, isInvalid, reset } = useSubmit()
  const id = useId()
  const [result, setResult] = useState<{ orgId: string; orgName: string; inviteUrl: string } | null>(null)
  const [inviteSent, setInviteSent] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copied, setCopied] = useState("")
  // The form disappears with the success: the focus lands on the result's heading.
  const doneHeadingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (result) doneHeadingRef.current?.focus() }, [result])

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      announce(setCopied, "Lien copié.")
    } catch {
      announce(setCopied, "Copie impossible : sélectionnez le lien et copiez-le.")
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2) { fail("Indiquez le nom de l'organisation (2 caractères au moins).", "name", document.getElementById(`${id}-name`)); return }
    if (!adminName.trim()) { fail("Indiquez le nom de l'administrateur.", "adminName", document.getElementById(`${id}-adminName`)); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) { fail("Indiquez une adresse email complète.", "adminEmail", document.getElementById(`${id}-adminEmail`)); return }
    const outcome = await run<{ org: { id: string; name: string }; inviteUrl: string }>(() => fetch("/api/super-admin/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), adminEmail: adminEmail.trim(), adminName: adminName.trim() }),
    }), { silent: true, fallback: "Erreur lors de la création de l'organisation." })
    if (!outcome.ok) {
      const onEmail = outcome.status === 409
      fail(outcome.error, onEmail ? "adminEmail" : undefined, onEmail ? document.getElementById(`${id}-adminEmail`) : null)
      return
    }
    setResult({ orgId: outcome.data.org.id, orgName: outcome.data.org.name, inviteUrl: outcome.data.inviteUrl })
  }

  async function sendInvite(orgId: string) {
    if (inviteSent === "sending" || inviteSent === "sent") return
    setInviteSent("sending")
    setInviteError(null)
    const outcome = await requestJson(() => fetch(`/api/super-admin/organizations/${orgId}/send-invite`, { method: "POST" }), "L'invitation n'a pas pu être envoyée.")
    if (!outcome.ok) setInviteError(outcome.error)
    setInviteSent(outcome.ok ? "sent" : "error")
  }

  if (result) {
    return (
      <div className="space-y-5">
        <div>
          <h1 ref={doneHeadingRef} tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Organisation créée</h1>
          <p className="text-sm text-gray-500 mt-1">
            L'organisation <strong>{result.orgName}</strong> et son premier administrateur ont été créés.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-900">
            Lien d'invitation — à envoyer à l'administrateur
          </p>
          <p className="text-xs text-blue-700">
            Ce lien est valable 7 jours. Il sera révoqué dès que le mot de passe sera créé.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label="Lien d'invitation (lecture seule)"
              value={result.inviteUrl}
              className="flex-1 font-mono text-xs bg-white border border-blue-200 rounded-lg px-3 py-2 text-blue-900 select-all"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={() => void copyLink(result.inviteUrl)}
              className="text-xs bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 shrink-0"
            >
              Copier
            </button>
          </div>
          <p role="status" className={copied ? "text-xs text-blue-900" : "sr-only"}>{copied}</p>
          <div className="pt-1 space-y-2">
            <p role="status" className={inviteSent === "sent" ? "text-sm text-green-800 font-medium" : "sr-only"}>{inviteSent === "sent" ? "Invitation envoyée par email." : ""}</p>
            <p role="alert" className={inviteSent === "error" ? "text-sm text-red-800" : "sr-only"}>{inviteSent === "error" ? `${inviteError ?? "Échec de l'envoi."} Vous pouvez réessayer ou copier le lien.` : ""}</p>
            {/* Stays mounted once sent so the focus does not fall off the page. */}
            <button
              type="button"
              aria-disabled={inviteSent === "sending" || inviteSent === "sent" || undefined}
              onClick={() => void sendInvite(result.orgId)}
              className={`text-sm ${inviteSent === "sent" ? "text-gray-600" : "text-blue-700 underline hover:text-blue-900"} aria-disabled:cursor-default`}
            >
              {inviteSent === "sending" ? "Envoi en cours…" : inviteSent === "sent" ? "Invitation envoyée" : inviteSent === "error" ? "Réessayer l'envoi" : "Envoyer l'invitation par email"}
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/super-admin/organizations")}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            Retour à la liste
          </button>
          <button
            type="button"
            onClick={() => {
              setResult(null)
              setName("")
              setAdminEmail("")
              setAdminName("")
              setInviteSent("idle")
              setInviteError(null)
              reset()
            }}
            className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl"
          >
            Créer une autre organisation
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Nouvelle organisation</h1>
        <p className="text-sm text-gray-500 mt-1">
          Créez une organisation et son premier administrateur. Le mot de passe temporaire sera affiché une seule fois.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 max-w-lg">
        <p className="text-xs text-gray-600">* champ obligatoire</p>
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-3">Organisation</p>
          <Field
            id={`${id}-name`}
            label="Nom de l'organisation"
            required
            value={name}
            onChange={setName}
            placeholder="Association des Bénévoles de Lyon"
            invalid={isInvalid("name")}
            errorId={`${id}-error`}
          />
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-600 mb-3">Premier administrateur</p>
          <div className="space-y-3">
            <Field
              id={`${id}-adminName`}
              label="Nom complet"
              required
              value={adminName}
              onChange={setAdminName}
              placeholder="Marie Dupont"
              invalid={isInvalid("adminName")}
              errorId={`${id}-error`}
            />
            <Field
              id={`${id}-adminEmail`}
              label="Adresse email"
              type="email"
              required
              value={adminEmail}
              onChange={setAdminEmail}
              placeholder="marie@asso.org"
              invalid={isInvalid("adminEmail")}
              errorId={`${id}-error`}
            />
          </div>
        </div>

        <FormStatus error={error} errorId={`${id}-error`} />

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={() => router.push("/super-admin/organizations")}
            className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            Annuler
          </button>
          <button
            type="submit"
            aria-disabled={submitting || undefined}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 aria-disabled:cursor-wait"
          >
            {submitting ? "Création…" : "Créer l'organisation"}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  invalid,
  errorId,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
  invalid?: true
  errorId?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-gray-700 mb-1">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        aria-required={required || undefined}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm placeholder:text-gray-500"
      />
    </div>
  )
}
