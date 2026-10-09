// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { RETENTION_DAYS } from "@/lib/retention"
import { operatorActionLabel } from "@/lib/operator-log"
import { APP_TIME_ZONE } from "@/lib/time-zone"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Journal de l'opérateur" }

/** How many decisions the page shows, most recent first. */
const SHOWN = 200

/**
 * The operator's decisions (#810): spaces validated, refused, suspended, deactivated or deleted,
 * and the sign-up block list. Read only; an entry outlives its space (src/lib/operator-log.ts).
 */
export default async function OperatorJournalPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const entries = await prisma.operatorLog.findMany({ orderBy: { createdAt: "desc" }, take: SHOWN })

  return (
    <div className="space-y-6">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Journal de l&apos;opérateur</h1>
        <p className="text-sm text-gray-700 mt-1">
          Les décisions prises dans l&apos;espace super admin : espaces validés, refusés, suspendus, désactivés ou supprimés, et la liste de blocage. Une décision reste ici même quand l&apos;espace a été supprimé depuis. Les {SHOWN} plus récentes, gardées {RETENTION_DAYS.operatorLog} jours.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-700">Aucune décision pour l&apos;instant.</p>
      ) : (
      // Focusable region so a keyboard user can scroll the table sideways on a narrow screen.
      <div tabIndex={0} role="region" aria-label="Décisions de l'opérateur" className="bg-white border border-gray-200 rounded-2xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <table className="w-full text-sm">
          <caption className="sr-only">Décisions de l&apos;opérateur, de la plus récente à la plus ancienne</caption>
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Date</th>
              <th scope="col" className="px-4 py-2 font-medium">Décision</th>
              <th scope="col" className="px-4 py-2 font-medium">Concerne</th>
              <th scope="col" className="px-4 py-2 font-medium">Raison</th>
              <th scope="col" className="px-4 py-2 font-medium">Par</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 text-gray-800 whitespace-nowrap tabular-nums">
                  <time dateTime={e.createdAt.toISOString()}>{e.createdAt.toLocaleString("fr-FR", { timeZone: APP_TIME_ZONE, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                </td>
                <th scope="row" className="px-4 py-2 text-left font-medium text-gray-900">{operatorActionLabel(e.action)}</th>
                <td className="px-4 py-2 text-gray-800 break-words">{e.target}</td>
                <td className="px-4 py-2 text-gray-800 break-words">{e.detail ?? <span className="text-gray-600">Aucune</span>}</td>
                <td className="px-4 py-2 text-gray-800">{e.actorLabel ?? <span className="text-gray-600">Inconnu</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
