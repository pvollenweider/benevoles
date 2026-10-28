"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { WORKLOAD_BENCHMARKS, type WorkloadBenchmark } from "@/lib/workload-policy"

/**
 * « Repères du droit du travail salarié » (#1171, lot 2), under the existing suggestion button of
 * the workload protection: closed by default (the card is long), each benchmark with its source and
 * a button, named by what it fills, that fills only its own fields. Never presented as an obligation for volunteers.
 */
export default function WorkloadBenchmarks({ onUse }: { onUse: (b: WorkloadBenchmark) => void }) {
  return (
    <details className="group rounded-xl border border-gray-200 px-3 py-2" data-workload-benchmarks="1">
      <summary className="cursor-pointer list-none min-h-11 sm:min-h-6 flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" fill="currentColor"><path d="M7 4l6 6-6 6z" /></svg>
        Repères du droit du travail salarié
      </summary>
      <p className="mt-2 text-xs text-gray-600">
        Ces repères viennent du droit du travail des salariés : ils ne s&apos;imposent pas aux bénévoles. Chaque bouton remplit seulement les champs indiqués, que vous pouvez modifier.
      </p>
      <ul role="list" className="mt-2 space-y-3">
        {WORKLOAD_BENCHMARKS.map((b) => (
          <li key={b.id} className="text-sm text-gray-800">
            <p>{b.text}</p>
            <p className="text-xs text-gray-600">Source : {b.source}</p>
            <button
              type="button"
              onClick={() => onUse(b)}
              className="mt-1 min-h-11 sm:min-h-6 rounded-xl border border-blue-600 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              {b.action}
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
