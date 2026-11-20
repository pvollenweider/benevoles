// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import OperatorBubbleChart from "./OperatorBubbleChart"
import { BUBBLE_CATEGORY_LABELS, BUBBLE_CATEGORY_SYMBOLS, bubbleCategoryTotals, type BubbleChartData } from "@/lib/operator-activity"

const ENCODING_ID = "operator-bubble-encoding"

/**
 * The bubble chart (#1415), full width of the content column, and its accessible alternative: the
 * visible summary (which already carries the capped-axis sentence) plus a small « Par situation »
 * table (events, créneaux, inscriptions per category). There is no per-event table here: the
 * 10-next-events list below the chart holds the event-level detail.
 *
 * The canvas is named by a sentence describing the encoding (aria-labelledby on an aria-hidden
 * paragraph, so it is not read a second time as text); the visible summary follows as ordinary
 * text, read once. When there is no event, no chart is rendered at all: only the summary and the
 * totals table.
 */
export default function OperatorActivitySection({ data }: { data: BubbleChartData }) {
  const totals = bubbleCategoryTotals(data.points)
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        {!data.empty && <OperatorBubbleChart data={data} labelId={ENCODING_ID} />}
        <p className="mt-3 text-sm text-gray-700">{data.summary}</p>
        {!data.empty && (
          <>
            <p id={ENCODING_ID} aria-hidden="true" className="sr-only">
              Graphique à bulles : date de début en horizontal, inscriptions en vertical, surface selon le nombre de créneaux.
            </p>
            <p className="mt-1 text-xs text-gray-600">Une bulle par événement ; sa surface suit le nombre de créneaux.</p>
          </>
        )}
      </div>

      <div>
        <h4 id="bubble-totals-title" className="text-sm font-semibold text-gray-900">Par situation</h4>
        <div
          role="region"
          aria-labelledby="bubble-totals-title"
          tabIndex={0}
          className="mt-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <table className="w-full text-sm">
            <caption className="sr-only">Nombre d&apos;événements, de créneaux et d&apos;inscriptions par situation</caption>
            <thead className="bg-gray-50 text-left text-gray-700">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Situation</th>
                <th scope="col" className="px-4 py-2 font-medium text-right">Événements</th>
                <th scope="col" className="px-4 py-2 font-medium text-right">Créneaux</th>
                <th scope="col" className="px-4 py-2 font-medium text-right">Inscriptions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {totals.map((total) => (
                <tr key={total.category}>
                  <th scope="row" className="px-4 py-2 text-left font-normal text-gray-900">
                    <span aria-hidden="true" className="mr-1">{BUBBLE_CATEGORY_SYMBOLS[total.category]}</span>
                    {BUBBLE_CATEGORY_LABELS[total.category]}
                  </th>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{total.events}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{total.shifts}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{total.registrations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
