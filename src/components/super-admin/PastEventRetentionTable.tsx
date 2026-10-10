// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { formatCount } from "@/lib/usage-counters"
import { pastEventSummary, pastEventTotals, PAST_EVENT_RETENTION_YEARS, type PastEventObservation, type PastEventRetentionMode } from "@/lib/past-event-retention"

const COLUMNS: { key: keyof Omit<PastEventObservation, "organizationId" | "organizationName">; label: string }[] = [
  { key: "events", label: "Événements" },
  { key: "registrations", label: "Inscriptions" },
  { key: "members", label: "Membres" },
  { key: "membersOnlyOld", label: `Membres sans événement depuis ${PAST_EVENT_RETENTION_YEARS} ans` },
  { key: "answers", label: "Réponses aux questions" },
  { key: "invites", label: "Invitations" },
  { key: "sectorLeaders", label: "Responsables de secteur" },
]

/**
 * #813: per organisation, what the rule « anonymiser les inscriptions 3 ans après la fin d'un
 * événement » would touch today (observation: nothing is changed, the operator reads this before
 * switching the rule on), or still has to anonymise (`PAST_EVENT_RETENTION=enforce`).
 */
export default function PastEventRetentionTable({ rows, mode = "observe" }: { rows: PastEventObservation[]; mode?: PastEventRetentionMode }) {
  const totals = pastEventTotals(rows)
  return (
    <section className="space-y-2">
      <h2 id="stats-past-events" className="text-lg font-semibold text-gray-900">Événements terminés depuis plus de {PAST_EVENT_RETENTION_YEARS} ans</h2>
      <p id="stats-past-events-intro" className="text-sm text-gray-700">
        {/* The summary says the schedule (or that nothing is changed): not repeated here. */}
        {mode === "enforce"
          ? "La règle de conservation est active : ce qui reste à anonymiser, par organisation."
          : "Observation : ce que la règle de conservation anonymiserait aujourd'hui, par organisation."}
        {" "}
        {pastEventSummary(totals, mode)}
      </p>
      {rows.length > 0 && (
        <div tabIndex={0} role="region" aria-labelledby="stats-past-events" className="bg-white border border-gray-200 rounded-2xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <table className="w-full text-sm" aria-describedby="stats-past-events-intro">
            <caption className="sr-only">{mode === "enforce" ? "Ce qui reste à anonymiser, par organisation" : "Ce que la règle anonymiserait aujourd'hui, par organisation"}</caption>
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
