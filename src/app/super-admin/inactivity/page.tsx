// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { loadInactivityReport, SOON_DAYS } from "@/lib/org-inactivity-data"
import { inactivityMode, INACTIVITY_MONTHS } from "@/lib/org-inactivity"
import { APP_TIME_ZONE } from "@/lib/time-zone"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Organisations bientôt inactives" }

const day = (d: Date | null) => (d ? d.toLocaleDateString("fr-FR", { timeZone: APP_TIME_ZONE, day: "numeric", month: "short", year: "numeric" }) : "Jamais")

/**
 * The periodic check of #811 in report mode: the organisations it would write to soon, and why.
 * Nothing is sent, deactivated or deleted (`ORG_INACTIVITY=report`).
 */
export default async function InactivityPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const mode = inactivityMode()
  const rows = mode === "off" ? [] : await loadInactivityReport()

  return (
    <div className="space-y-6">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Organisations bientôt inactives</h1>
        <p className="text-sm text-gray-700 mt-1">
          Après {INACTIVITY_MONTHS} mois sans activité et sans événement à venir, une organisation recevrait « Souhaitez-vous conserver votre espace ? », puis deux rappels, avant toute désactivation.
          {" "}
          {mode === "off"
            ? "La vérification est désactivée (ORG_INACTIVITY=off)."
            : `Mode observation : rien n'est envoyé, désactivé ni supprimé. La liste montre les organisations concernées dans les ${SOON_DAYS} prochains jours ou déjà concernées.`}
        </p>
      </div>

      {mode !== "off" && (rows.length === 0 ? (
        <p className="text-sm text-gray-700">Aucune organisation concernée.</p>
      ) : (
        <div tabIndex={0} role="region" aria-label="Organisations concernées" className="bg-white border border-gray-200 rounded-2xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <table className="w-full text-sm">
            <caption className="sr-only">Organisations concernées, la plus proche de la première étape en premier</caption>
            <thead className="bg-gray-50 text-left text-gray-700">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Organisation</th>
                <th scope="col" className="px-4 py-2 font-medium">Dernière activité</th>
                <th scope="col" className="px-4 py-2 font-medium">Dernier événement</th>
                <th scope="col" className="px-4 py-2 font-medium">Utilisée</th>
                <th scope="col" className="px-4 py-2 font-medium text-right">Administrateurs actifs</th>
                <th scope="col" className="px-4 py-2 font-medium">Où elle en serait</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <Link href={`/super-admin/organizations/${r.slug}`} className="text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{r.name}</Link>
                  </th>
                  <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{day(r.lastActivityAt)}</td>
                  <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{day(r.lastEventEnd)}</td>
                  <td className="px-4 py-2 text-gray-800">{r.everUsed ? "Oui" : "Jamais utilisée"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{r.activeAdmins}</td>
                  <td className="px-4 py-2 text-gray-800">
                    {r.assessment.state === "active"
                      ? `1er email le ${day(r.assessment.firstEmailAt)}`
                      : `${r.assessment.stepLabel} (depuis le ${day(r.assessment.firstEmailAt)})${r.assessment.nextStep ? ` ; ensuite : ${r.assessment.nextStep.label.toLowerCase()} le ${day(r.assessment.nextStep.at)}` : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
