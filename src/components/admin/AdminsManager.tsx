"use client"

import { useState } from "react"

type Admin = {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  pending: boolean
}

export default function AdminsManager({
  initialAdmins,
  currentEmail,
}: {
  initialAdmins: Admin[]
  currentEmail: string
}) {
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", email: "" })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch("/api/admin/settings/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) {
      setError(data.error ?? "Une erreur est survenue.")
      return
    }
    setAdmins((prev) => [...prev, data])
    setInviteUrl(data.inviteUrl)
    setForm({ name: "", email: "" })
    setShowForm(false)
  }

  async function handleRemove(id: string) {
    setRemoving(id)
    const res = await fetch(`/api/admin/settings/admins/${id}`, { method: "DELETE" })
    const data = await res.json()
    setRemoving(null)
    if (!res.ok) {
      setError(data.error ?? "Une erreur est survenue.")
      return
    }
    setAdmins((prev) => prev.filter((a) => a.id !== id))
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-red-500">✕</button>
        </div>
      )}

      {inviteUrl && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-blue-900">Lien d'invitation créé</p>
          <p className="text-xs text-blue-700 break-all font-mono">{inviteUrl}</p>
          <button
            onClick={() => copyUrl(inviteUrl)}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {copied ? "Copié !" : "Copier le lien"}
          </button>
          <p className="text-xs text-blue-500">Un email a été envoyé. Ce lien expire dans 7 jours.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Administrateurs ({admins.length})
          </h2>
          <button
            onClick={() => { setShowForm(true); setInviteUrl(null); setError(null) }}
            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            + Inviter
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleInvite} className="px-4 py-4 border-b border-gray-100 bg-gray-50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Alice Martin"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="alice@example.com"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {submitting ? "Envoi…" : "Envoyer l'invitation"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-gray-100">
          {admins.map((admin) => {
            const isSelf = admin.email === currentEmail
            return (
              <div key={admin.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800 truncate">{admin.name}</p>
                    {admin.pending && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                        En attente
                      </span>
                    )}
                    {isSelf && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        Vous
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{admin.email}</p>
                </div>
                {!isSelf && (
                  <button
                    onClick={() => handleRemove(admin.id)}
                    disabled={removing === admin.id}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 flex-shrink-0"
                  >
                    {removing === admin.id ? "…" : "Retirer"}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
