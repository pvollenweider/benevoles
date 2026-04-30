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

type Props = {
  org: Org
}

export default function OrgDetail({ org }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [toggling, setToggling] = useState(false)

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function toggleActive() {
    const label = org.active ? "Désactiver" : "Réactiver"
    if (!confirm(`${label} l'organisation « ${org.name} » ?`)) return
    setToggling(true)
    const res = await fetch(`/api/super-admin/organizations/${org.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !org.active }),
    })
    setToggling(false)
    if (res.ok) refresh()
  }

  const createdAt = new Date(org.createdAt).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/super-admin/organizations"
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Organisations
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-600">{org.name}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{org.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-xs text-gray-500">{org.slug}</span>
            {org.active ? (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                Active
              </span>
            ) : (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                Désactivée
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">Créée le {createdAt}</p>
        </div>

        <button
          onClick={toggleActive}
          disabled={toggling}
          className={`text-sm px-4 py-2 rounded-xl font-medium disabled:opacity-50 ${
            org.active
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-green-600 text-white hover:bg-green-700"
          }`}
        >
          {toggling ? "…" : org.active ? "Désactiver" : "Réactiver"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Événements" value={org._count.events} />
        <StatCard label="Administrateurs" value={org._count.admins} />
        <StatCard label="Membres" value={org._count.members} />
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
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          Actif
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          Inactif
                        </span>
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
