// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { formatCount } from "@/lib/usage-counters"
import { pastEventSummary, pastEventTotals, PAST_EVENT_RETENTION_YEARS, type PastEventObservation } from "@/lib/past-event-retention"

const COLUMNS: { key: keyof Omit<PastEventObservation, "organizationId" | "organizationName">; label: string }[] = [
  { key: "events", label: "Événements" },
  { key: "registrations", label: "Inscriptions" },
  { key: "members", label: "Membres" },
  { key: "membersOnlyOld", label: "dont sans événement récent" },
  { key: "answers", label: "Réponses aux questions" },
  { key: "invites", label: "Invitations" },
  { key: "sectorLeaders", label: "Responsables de secteur" },
]

/**
 * #813 in observation mode: per organisation, what the rule « anonymiser les inscriptions
 * 3 ans après la fin d'un événement » would touch today. Nothing is changed: the operator reads
 * this before the rule is switched on.
 */
export default function PastEventRetentionTable({ rows }: { rows: PastEventObservation[] }) {
  const totals = pastEventTotals(rows)
  return (
    <section className="space-y-2">
      <h2 id="stats-past-events" className="text-lg font-semibold text-gray-900">Événements terminés depuis plus de {PAST_EVENT_RETENTION_YEARS} ans</h2>
      <p id="stats-past-events-intro" className="text-sm text-gray-700">
        Observation, rien n&apos;est modifié : ce que la règle de conservation anonymiserait aujourd&apos;hui, par organisation. {pastEventSummary(totals)}
      </p>
      {rows.length > 0 && (
        <div tabIndex={0} role="region" aria-label="Événements terminés depuis plus de 3 ans, par organisation" className="bg-white border border-gray-200 rounded-2xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <table className="w-full text-sm" aria-describedby="stats-past-events-intro">
            <caption className="sr-only">Ce que la règle anonymiserait, par organisation</caption>
            <thead className="bg-gray-50 text-left text-gray-700">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Organisation</th>
                {COLUMNS.map((c) => <th key={c.key} scope="col" className="px-4 py-2 font-medium text-right">{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.organizationId}>
                  <th scope="row" className="px-4 py-2 text-left font-normal text-gray-900 break-words">{r.organizationName}</th>
                  {COLUMNS.map((c) => <td key={c.key} className="px-4 py-2 text-right tabular-nums text-gray-900">{formatCount(r[c.key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
