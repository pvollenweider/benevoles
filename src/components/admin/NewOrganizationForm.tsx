"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

export default function NewOrganizationForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugManual, setSlugManual] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleNameChange(value: string) {
    setName(value)
    if (!slugManual) setSlug(slugify(value))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch("/api/super-admin/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        slug,
        inviteEmail: inviteEmail || undefined,
      }),
    })
    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Erreur lors de la création")
      return
    }

    router.push("/super-admin/organizations")
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="ex: École de Cirque de Lutry"
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Slug * <span className="text-gray-400 font-normal">(URL, généré automatiquement)</span>
        </label>
        <input
          type="text"
          required
          value={slug}
          onChange={(e) => { setSlug(e.target.value); setSlugManual(true) }}
          pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
          minLength={2}
          maxLength={60}
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email du premier admin <span className="text-gray-400 font-normal">(optionnel)</span>
        </label>
        <input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="président@asso.dev"
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <p className="text-xs text-gray-500 mt-1">Si renseigné, une invitation est envoyée pour qu'il crée son compte.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
        >
          {submitting ? "Création…" : "Créer l'organisation"}
        </button>
      </div>
    </form>
  )
}
