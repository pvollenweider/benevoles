"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

type OrgCount = {
  events: number
  admins: number
  volunteers: number
}

type Org = {
  id: string
  name: string
  slug: string
  active: boolean
  createdAt: string
  _count: OrgCount
}

type Props = {
  initialOrgs: Org[]
}

export default function OrgsManager({ initialOrgs }: Props) {
  const router = useRouter()
  const orgs = initialOrgs
  const [, startTransition] = useTransition()

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function toggleActive(org: Org) {
    const label = org.active ? "Désactiver" : "Réactiver"
    if (!confirm(`${label} l'organisation « ${org.name} » ?`)) return
    const res = await fetch(`/api/super-admin/organizations/${org.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !org.active }),
    })
    if (res.ok) refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Organisations</h1>
          <p className="text-sm text-gray-500">
            {orgs.length} organisation{orgs.length > 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/super-admin/organizations/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
        >
          + Nouvelle organisation
        </Link>
      </div>

      {orgs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          Aucune organisation. Créez-en une pour commencer.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Nom</th>
                <th className="text-left px-4 py-2 font-medium">Slug</th>
                <th className="text-right px-4 py-2 font-medium">Événements</th>
                <th className="text-right px-4 py-2 font-medium">Admins</th>
                <th className="text-right px-4 py-2 font-medium">Membres</th>
                <th className="text-right px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className={`border-t border-gray-100 ${!org.active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/super-admin/organizations/${org.slug}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {org.name}
                    </Link>
                    {!org.active && (
                      <span className="ml-2 text-xs text-red-500 font-normal">désactivée</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{org.slug}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{org._count.events}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{org._count.admins}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{org._count.volunteers}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/super-admin/organizations/${org.slug}`}
                        className="text-xs text-gray-400 hover:text-blue-600"
                      >
                        Détail
                      </Link>
                      <button
                        onClick={() => toggleActive(org)}
                        className={`text-xs ${org.active ? "text-gray-400 hover:text-red-600" : "text-gray-400 hover:text-green-600"}`}
                      >
                        {org.active ? "Désactiver" : "Réactiver"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
