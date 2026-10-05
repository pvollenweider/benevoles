// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import type { RemindersSummary } from "@/lib/automatic-reminders"

/** What automatic reminders go out for this event (#705), with links to where they are set. */
export default function AutomaticRemindersBox({ summary }: { summary: RemindersSummary }) {
  return (
    <section aria-labelledby="automatic-reminders-heading" className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1">
      <h3 id="automatic-reminders-heading" className="text-xs font-semibold text-gray-800">{summary.title}</h3>
      {summary.sent.length > 0 && (
        <ul className="text-xs text-gray-700 space-y-0.5 list-disc pl-4">
          {summary.sent.map((s) => (
            <li key={s.key}><strong>{s.label}</strong> : {s.timing}</li>
          ))}
        </ul>
      )}
      {summary.notes.map((n) => (
        <p key={n} className="text-xs text-gray-700 leading-relaxed">{n}</p>
      ))}
      {summary.links.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {summary.links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
