// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import type { AttentionItem } from "@/lib/attention"

const SEVERITY = {
  high: { label: "Urgent", badge: "bg-red-100 text-red-800" },
  medium: { label: "À surveiller", badge: "bg-amber-100 text-amber-900" },
  low: { label: "Info", badge: "bg-gray-100 text-gray-700" },
} as const

/** « Ce qui demande votre attention » on the dashboard (#372), most urgent first. */
export default function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="attention-heading" className="space-y-3">
      <h2 id="attention-heading" className="text-base font-semibold text-gray-900">
        Ce qui demande votre attention
      </h2>
      {items.length === 0 ? (
        <p className="bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
          Rien ne demande votre attention pour l&apos;instant.
        </p>
      ) : (
        // role="list": Safari/VoiceOver drops list semantics once Tailwind removes the bullets.
        <ul role="list" className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs text-gray-600">
                  <span className={`inline-block rounded-full px-2 py-0.5 font-semibold mr-2 ${SEVERITY[item.severity].badge}`}>
                    {item.severity === "high" && <span aria-hidden="true">⚠ </span>}
                    {SEVERITY[item.severity].label}
                  </span>
                  <span className="sr-only"> : </span>
                  {item.eventTitle}
                </p>
                <p className="text-sm text-gray-900 mt-1">{item.message}</p>
              </div>
              <Link
                href={item.href}
                className="inline-block py-1 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 flex-shrink-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {item.action}
                <span className="sr-only"> : {item.eventTitle}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
