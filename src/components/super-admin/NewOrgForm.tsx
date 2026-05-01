"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function NewOrgForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [adminName, setAdminName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ orgName: string; inviteUrl: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch("/api/super-admin/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, adminEmail, adminName }),
    })

    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      if (typeof data?.error === "string") {
        setError(data.error)
      } else {
        setError("Erreur lors de la création de l'organisation")
      }
      return
    }

    const data = await res.json()
    setResult({ orgName: data.org.name, inviteUrl: data.inviteUrl })
  }

  if (result) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Organisation créée</h1>
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
              value={result.inviteUrl}
              className="flex-1 font-mono text-xs bg-white border border-blue-200 rounded-lg px-3 py-2 text-blue-900 select-all"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(result.inviteUrl)}
              className="text-xs bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 shrink-0"
            >
              Copier
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => router.push("/super-admin/organizations")}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            Retour à la liste
          </button>
          <button
            onClick={() => {
              setResult(null)
              setName("")
              setAdminEmail("")
              setAdminName("")
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

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 max-w-lg">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Organisation</p>
          <Field
            label="Nom de l'organisation"
            required
            value={name}
            onChange={setName}
            placeholder="Association des Bénévoles de Lyon"
          />
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Premier administrateur</p>
          <div className="space-y-3">
            <Field
              label="Nom complet"
              required
              value={adminName}
              onChange={setAdminName}
              placeholder="Marie Dupont"
            />
            <Field
              label="Adresse email"
              type="email"
              required
              value={adminEmail}
              onChange={setAdminEmail}
              placeholder="marie@asso.org"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

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
            disabled={submitting}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Création…" : "Créer l'organisation"}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">
        {label}
        {required && " *"}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
      />
    </div>
  )
}
