// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import type { ReviewCheck } from "@/lib/event-wizard"

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * The pre-publication checklist (#401): each point done, to do, to check or optional, with the
 * link to where it is set. On the review page and on the overview of a draft.
 */
export default function ReviewChecklist({ checks }: { checks: ReviewCheck[] }) {
  return (
    // role="list": Safari/VoiceOver drops list semantics once Tailwind removes the bullets.
    <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
      {checks.map((c) => (
        <li key={c.id} className="px-4 py-3 text-sm flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <p className="text-gray-900">
              <span className="sr-only">{c.ok ? "Fait : " : c.required ? "À faire : " : c.warn ? "À vérifier : " : "Facultatif : "}</span>
              <span aria-hidden="true" className={`inline-block w-5 ${c.ok ? "text-green-800" : c.required ? "text-red-700" : c.warn ? "text-amber-800" : "text-gray-500"}`}>{c.ok ? "✓" : c.required ? "!" : c.warn ? "?" : "–"}</span>
              {c.label}
            </p>
            {!c.ok && c.hint && <p id={`${c.id}-hint`} className="text-xs text-gray-600 pl-5">{c.hint}</p>}
          </div>
          {c.href && (
            <Link href={c.href} aria-describedby={!c.ok && c.hint ? `${c.id}-hint` : undefined} className={linkClass}>
              {c.action ?? (c.ok ? "Modifier" : c.required ? "Compléter" : "Ajouter")}
              <span className="sr-only"> : {c.label}</span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}
