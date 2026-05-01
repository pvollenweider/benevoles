"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

type Admin = {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
}

type OrgCount = {
  events: number
  admins: number
  members: number
}

type Org = {
  id: string
  name: string
  slug: string
  active: boolean
  createdAt: string
  updatedAt: string
  _count: OrgCount
  admins: Admin[]
}

export default function OrgDetail({ org }: { org: Org }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [toggling, setToggling] = useState(false)
  const [name, setName] = useState(org.name)
  const [slug, setSlug] = useState(org.slug)
  const [savingName, setSavingName] = useState(false)
  const [savingSlug, setSavingSlug] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)
  const [slugSaved, setSlugSaved] = useState(false)

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function patch(data: Record<string, unknown>) {
    return fetch(`/api/super-admin/organizations/${org.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  }

  async function toggleActive() {
    const label = org.active ? "Désactiver" : "Réactiver"
    if (!confirm(`${label} l'organisation « ${org.name} » ?`)) return
    setToggling(true)
    const res = await patch({ active: !org.active })
    setToggling(false)
    if (res.ok) refresh()
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed === org.name) return
    setSavingName(true)
    setNameError(null)
    setNameSaved(false)
    const res = await patch({ name: trimmed })
    setSavingName(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setNameError(typeof d.error === "string" ? d.error : "Erreur.")
      return
    }
    setNameSaved(true)
    refresh()
  }

  async function saveSlug(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = slug.trim().toLowerCase()
    if (trimmed === org.slug) return
    setSavingSlug(true)
    setSlugError(null)
    setSlugSaved(false)
    const res = await patch({ slug: trimmed })
    setSavingSlug(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setSlugError(typeof d.error === "string" ? d.error : "Erreur.")
      return
    }
    const d = await res.json()
    setSlugSaved(true)
    router.push(`/super-admin/organizations/${d.slug}`)
  }

  const createdAt = new Date(org.createdAt).toLocaleDateString("fr-FR", {
    year: "numeric", month: "long", day: "numeric",
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/super-admin/organizations" className="text-sm text-gray-400 hover:text-gray-600">
              Organisations
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-600">{org.name}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{org.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-xs text-gray-500">{org.slug}</span>
            {org.active ? (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
            ) : (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Désactivée</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">Créée le {createdAt}</p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/api/super-admin/use-org/${org.id}`}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-700"
          >
            Gérer →
          </a>
          <button
            onClick={toggleActive}
            disabled={toggling}
            className={`text-sm px-4 py-2 rounded-xl font-medium disabled:opacity-50 ${
              org.active ? "bg-red-600 text-white hover:bg-red-700" : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            {toggling ? "…" : org.active ? "Désactiver" : "Réactiver"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Événements" value={org._count.events} />
        <StatCard label="Administrateurs" value={org._count.admins} />
        <StatCard label="Membres" value={org._count.members} />
      </div>

      {/* Edit name + slug */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <form onSubmit={saveName} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nom</label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setNameSaved(false) }}
              minLength={2}
              maxLength={100}
              required
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={savingName || name.trim() === org.name || name.trim().length < 2}
              className="bg-gray-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40"
            >
              {savingName ? "…" : "OK"}
            </button>
          </div>
          {nameSaved && <p className="text-xs text-green-600">Enregistré.</p>}
          {nameError && <p className="text-xs text-red-600">{nameError}</p>}
        </form>

        <form onSubmit={saveSlug} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Slug</label>
          <div className="flex gap-2">
            <input
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugSaved(false) }}
              minLength={2}
              maxLength={40}
              pattern="^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
              required
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={savingSlug || slug.trim().toLowerCase() === org.slug || slug.trim().length < 2}
              className="bg-gray-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40"
            >
              {savingSlug ? "…" : "OK"}
            </button>
          </div>
          {slugSaved && <p className="text-xs text-green-600">Enregistré. L&apos;ancien slug redirige vers le nouveau.</p>}
          {slugError && <p className="text-xs text-red-600">{slugError}</p>}
        </form>
      </div>

      {/* Admins */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Administrateurs</h2>
        {org.admins.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun administrateur.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Nom</th>
                  <th className="text-left px-4 py-2 font-medium">Email</th>
                  <th className="text-left px-4 py-2 font-medium">Rôle</th>
                  <th className="text-left px-4 py-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {org.admins.map((admin) => (
                  <tr key={admin.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{admin.name}</td>
                    <td className="px-4 py-3 text-gray-600">{admin.email}</td>
                    <td className="px-4 py-3 text-gray-500">{admin.role}</td>
                    <td className="px-4 py-3">
                      {admin.isActive ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Actif</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactif</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}
