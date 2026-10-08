// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { formatCount, type UsageRow } from "@/lib/usage-counters"
import { loadPlatformUsage } from "@/lib/usage-stats"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Statistiques" }

/**
 * Platform usage for the super admin (#805): « Depuis le début », counters that a deletion never
 * lowers (a deleted organisation's counts included), beside « En ce moment », what the database
 * holds now. Counts only, no personal data. Each table is named by its caption only (the section
 * carries no aria-labelledby: the name would be announced twice).
 */
export default async function StatsPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const { cumulative, current } = await loadPlatformUsage()

  return (
    <div className="space-y-8">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Statistiques</h1>
        <p className="text-sm text-gray-700 mt-1">
          L&apos;utilisation de la plateforme, toutes organisations confondues. Les chiffres « depuis le début » ne baissent jamais : une suppression, même d&apos;une organisation entière, ne les diminue pas. Ils ont été initialisés le jour de leur mise en place à partir de ce que contenait la base ; ce qui avait été supprimé avant n&apos;y figure pas.
        </p>
      </div>
      <UsageTable id="stats-cumulative" title="Depuis le début" rows={cumulative} />
      <UsageTable id="stats-current" title="En ce moment" rows={current} />
    </div>
  )
}

function UsageTable({ id, title, rows }: { id: string; title: string; rows: UsageRow[] }) {
  return (
    <section className="space-y-2">
      <h2 id={id} className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Indicateur</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Nombre</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="px-4 py-2 text-left font-normal text-gray-900">{r.label}</th>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{formatCount(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
