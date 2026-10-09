// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { formatCount, type UsageRow } from "@/lib/usage-counters"
import { loadPlatformUsage, loadSignupFacts } from "@/lib/usage-stats"
import { signupIndicatorRows } from "@/lib/signup-indicators"

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

  const [{ cumulative, current }, signupFacts] = await Promise.all([loadPlatformUsage(), loadSignupFacts()])
  const signup = signupIndicatorRows(signupFacts)

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
      <UsageTable
        id="stats-signup"
        title="Inscription en libre-service"
        intro="Ce qui dit si la validation à la main reste nécessaire. Les décisions comptent sur 12 mois (le journal de l'opérateur les garde un an) ; un envoi reporté plusieurs fois compte à chaque fois."
        rows={signup}
      />
    </div>
  )
}

function UsageTable({ id, title, intro, rows }: { id: string; title: string; intro?: string; rows: (UsageRow | { key: string; label: string; value: string })[] }) {
  return (
    <section className="space-y-2">
      <h2 id={id} className="text-lg font-semibold text-gray-900">{title}</h2>
      {intro && <p id={`${id}-intro`} className="text-sm text-gray-700">{intro}</p>}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm" aria-describedby={intro ? `${id}-intro` : undefined}>
          <caption className="sr-only">{title}</caption>
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Indicateur</th>
              <th scope="col" className="px-4 py-2 font-medium text-right">Valeur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="px-4 py-2 text-left font-normal text-gray-900 break-words">{r.label}</th>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900 break-words">{typeof r.value === "number" ? formatCount(r.value) : r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
