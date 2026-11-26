// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { formatCount } from "@/lib/usage-counters"
import { ADMIN_EMAILS_ANCHOR, ADMIN_EMAILS_TRUNCATED_SENTENCE } from "@/lib/admin-emails-view"

/** One row of the section, its date already formatted on the server. */
export type AdminEmailDisplayRow = {
  /** "YYYY-MM-DD", the civil day in APP_TIME_ZONE set on the `<time>`. */
  dateTime: string
  /** « 26 novembre 2026 », formatted on the server. */
  dateLabel: string
  kindLabel: string
  accepted: number
  failed: number
}

/**
 * « Emails envoyés aux administrateurs » on an organisation's page: read-only, no content, no
 * address. Counts come from DeliveryOutcome (accepted by the relay or refused/failed), grouped
 * by day and by kind. Zero stays the digit « 0 »; only a refused count above zero is emphasised.
 */
export default function AdminEmailsTable({ rows, days, zone, truncated }: { rows: AdminEmailDisplayRow[]; days: number; zone: string; truncated: boolean }) {
  return (
    <section aria-labelledby={ADMIN_EMAILS_ANCHOR} className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 id={ADMIN_EMAILS_ANCHOR} className="text-sm font-semibold text-gray-900">Emails envoyés aux administrateurs</h2>
      <p className="text-xs text-gray-600 mt-0.5">
        Les {days} derniers jours, les plus récents d&apos;abord. Les nombres comptent les emails acceptés par le relais d&apos;envoi, pas une preuve de remise. {zone}{truncated && ` ${ADMIN_EMAILS_TRUNCATED_SENTENCE}`}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-700 mt-2">Aucun email envoyé aux administrateurs sur cette période.</p>
      ) : (
        // Focusable region so a keyboard user can scroll the table sideways on a narrow screen.
        <div tabIndex={0} role="region" aria-labelledby={ADMIN_EMAILS_ANCHOR} className="mt-2 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <table aria-labelledby={ADMIN_EMAILS_ANCHOR} className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-700">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Date</th>
                <th scope="col" className="px-4 py-2 font-medium">Type d&apos;email</th>
                <th scope="col" className="px-4 py-2 font-medium text-right">Acceptés par le relais</th>
                <th scope="col" className="px-4 py-2 font-medium text-right">Refusés ou en échec</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={`${r.dateTime}-${r.kindLabel}`}>
                  <th scope="row" className="px-4 py-2 text-left font-normal whitespace-nowrap text-gray-900">
                    <time dateTime={r.dateTime}>{r.dateLabel}</time>
                  </th>
                  <td className="px-4 py-2 text-gray-700 break-words">{r.kindLabel}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{formatCount(r.accepted)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${r.failed > 0 ? "font-medium text-red-700" : "text-gray-900"}`}>{formatCount(r.failed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
