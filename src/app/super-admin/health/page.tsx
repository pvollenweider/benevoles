// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { loadHealth } from "@/lib/health-data"
import { healthHeadline, LEVEL_LABELS, worstLevel, type HealthItem, type HealthLevel } from "@/lib/health-view"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Santé du service" }

const LEVEL_STYLE: Record<HealthLevel, string> = {
  ok: "bg-green-100 text-green-900",
  warn: "bg-amber-100 text-amber-900",
  error: "bg-red-100 text-red-900",
  unknown: "bg-gray-100 text-gray-800",
}

/** Super-admin health page (#383): database, outbox, scheduled jobs, backups, migrations, configuration. */
export default async function HealthPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const { items, version, gitSha, checkedAt } = await loadHealth()
  const worst = worstLevel(items)
  const groups: { key: string; title: string; ids: (id: string) => boolean }[] = [
    { key: "service", title: "Service", ids: (id) => id === "database" || id === "outbox" || id === "migrations" },
    { key: "jobs", title: "Tâches planifiées et sauvegardes", ids: (id) => id.startsWith("job:") },
    { key: "config", title: "Configuration", ids: (id) => id.startsWith("config:") },
  ]

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Santé du service</h1>
        <p className="text-sm text-gray-700 mt-1">
          <span className="sr-only">État général : </span>
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mr-2 ${LEVEL_STYLE[worst]}`}>{LEVEL_LABELS[worst]}</span>
          {healthHeadline(items)}
        </p>
        <p className="text-sm text-gray-600 mt-1">
          Version {version}{gitSha ? ` (${gitSha.slice(0, 7)})` : ""} · vérifié le <time dateTime={checkedAt.toISOString()}>{checkedAt.toLocaleString("fr-FR", { timeZone: "Europe/Zurich", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>. Recharger la page relance les contrôles.
        </p>
      </div>

      {groups.map((g) => {
        const rows = items.filter((i) => g.ids(i.id))
        return (
          <section key={g.key} aria-labelledby={`health-${g.key}`} className="space-y-2">
            <h2 id={`health-${g.key}`} className="text-base font-semibold text-gray-900">{g.title}</h2>
            <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {rows.map((i) => <Item key={i.id} item={i} />)}
            </ul>
          </section>
        )
      })}

      <p className="text-sm text-gray-600">
        Les sauvegardes et le test de restauration se signalent par <code className="text-[0.9em]">POST /api/cron/heartbeat</code> avec le secret des tâches planifiées ; la procédure est dans <code className="text-[0.9em]">docs/deploiement.md</code>.
      </p>
    </div>
  )
}

function Item({ item }: { item: HealthItem }) {
  return (
    <li className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 items-start">
      <div>
        <p className="text-sm font-medium text-gray-900">{item.label}</p>
        <p className="text-sm text-gray-700">{item.detail}</p>
      </div>
      <span className={`inline-block self-start rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_STYLE[item.level]}`}>{LEVEL_LABELS[item.level]}</span>
    </li>
  )
}
