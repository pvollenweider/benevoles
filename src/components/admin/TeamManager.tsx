"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

type Admin = {
  id: string
  email: string
  name: string
  role: string
  isActive: boolean
}

type Invitation = {
  id: string
  email: string
  daysLeft: number
  inviterName: string
}

type Props = {
  currentUserId: string
  admins: Admin[]
  invitations: Invitation[]
}

export default function TeamManager({ currentUserId, admins, invitations }: Props) {
  const router = useRouter()
  const [showInvite, setShowInvite] = useState(false)
  const [, startTransition] = useTransition()

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function deactivate(id: string) {
    if (!confirm("Désactiver cet administrateur ?")) return
    const res = await fetch(`/api/admin/team/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data?.error ?? "Erreur")
      return
    }
    refresh()
  }

  async function revokeInvite(id: string) {
    if (!confirm("Révoquer cette invitation ?")) return
    const res = await fetch(`/api/admin/invitations/${id}`, { method: "DELETE" })
    if (res.ok) refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Équipe administrateurs</h1>
          <p className="text-sm text-gray-500">{admins.filter((a) => a.isActive).length} actif{admins.filter((a) => a.isActive).length > 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
        >
          + Inviter un admin
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2 text-xs uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-100">
          Membres actifs
        </div>
        <table className="w-full text-sm">
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className={`border-t border-gray-100 ${!a.isActive ? "opacity-50" : ""}`}>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{a.name}</div>
                  <div className="text-xs text-gray-500">{a.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                    {a.role}
                  </span>
                  {a.id === currentUserId && (
                    <span className="text-xs text-blue-600 ml-2">(toi)</span>
                  )}
                  {!a.isActive && (
                    <span className="text-xs text-gray-400 ml-2">inactif</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {a.isActive && a.id !== currentUserId && (
                    <button
                      onClick={() => deactivate(a.id)}
                      className="text-xs text-gray-400 hover:text-red-600"
                    >
                      Désactiver
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invitations.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-xs uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-100">
            Invitations en attente
          </div>
          <table className="w-full text-sm">
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900">{i.email}</div>
                    <div className="text-xs text-gray-500">invité par {i.inviterName}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    Expire dans {i.daysLeft} jour{i.daysLeft > 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => revokeInvite(i.id)}
                      className="text-xs text-gray-400 hover:text-red-600"
                    >
                      Révoquer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onDone={() => {
            setShowInvite(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Erreur")
      return
    }
    setResult(`Invitation envoyée à ${email}`)
    setTimeout(onDone, 1200)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Inviter un administrateur</h2>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@asso.dev"
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-sm text-red-700">{error}</div>}
          {result && <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-sm text-green-700">{result}</div>}
          <p className="text-xs text-gray-500">
            Un email avec un lien d&apos;activation sera envoyé. Le destinataire choisit son nom et son mot de passe.
            Lien valable 7 jours.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || !!result}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Envoi…" : "Envoyer l'invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
