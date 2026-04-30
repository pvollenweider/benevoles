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
  const [result, setResult] = useState<{ orgName: string; tempPassword: string } | null>(null)

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
    setResult({ orgName: data.org.name, tempPassword: data.tempPassword })
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

        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-yellow-900">
            Mot de passe temporaire — à communiquer maintenant
          </p>
          <p className="text-xs text-yellow-700">
            Ce mot de passe ne sera plus affiché après avoir quitté cette page.
          </p>
          <div className="font-mono text-lg font-bold text-yellow-900 bg-white border border-yellow-200 rounded-lg px-4 py-2 inline-block select-all">
            {result.tempPassword}
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
