"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

type Org = {
  id: string
  name: string
  slug: string
  isActive: boolean
  createdAt: string
  counts: { events: number; members: number; admins: number }
}

export default function OrganizationsManager({ orgs }: { orgs: Org[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  async function toggleActive(id: string, isActive: boolean) {
    const verb = isActive ? "Réactiver" : "Désactiver"
    if (!confirm(`${verb} cette organisation ?`)) return
    const res = await fetch(`/api/super-admin/organizations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    })
    if (res.ok) startTransition(() => router.refresh())
  }

  if (orgs.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        Aucune organisation. Crée la première.
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Nom</th>
            <th className="text-left px-4 py-2 font-medium">Slug</th>
            <th className="text-center px-4 py-2 font-medium">Events</th>
            <th className="text-center px-4 py-2 font-medium">Membres</th>
            <th className="text-center px-4 py-2 font-medium">Admins</th>
            <th className="text-left px-4 py-2 font-medium">Statut</th>
            <th className="text-right px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id} className={`border-t border-gray-100 ${!o.isActive ? "opacity-50" : ""}`}>
              <td className="px-4 py-3">
                <Link href={`/super-admin/organizations/${o.id}`} className="font-medium text-gray-900 hover:text-purple-600">
                  {o.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs font-mono">{o.slug}</td>
              <td className="px-4 py-3 text-center">{o.counts.events}</td>
              <td className="px-4 py-3 text-center">{o.counts.members}</td>
              <td className="px-4 py-3 text-center">{o.counts.admins}</td>
              <td className="px-4 py-3">
                {o.isActive ? (
                  <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">actif</span>
                ) : (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">inactif</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => toggleActive(o.id, !o.isActive)}
                  className="text-xs text-gray-400 hover:text-purple-600"
                >
                  {o.isActive ? "Désactiver" : "Réactiver"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
