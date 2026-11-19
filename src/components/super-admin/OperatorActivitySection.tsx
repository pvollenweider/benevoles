// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import OperatorBubbleChart from "./OperatorBubbleChart"
import { BUBBLE_CATEGORY_LABELS, BUBBLE_CATEGORY_SYMBOLS, eventDatesLabel, type BubbleChartData } from "@/lib/operator-activity"

const SUMMARY_ID = "operator-bubble-summary"
const ENCODING_ID = "operator-bubble-encoding"

/**
 * The accessible pair of the bubble chart (#1415): the Chart.js canvas on one side, the same events
 * as a real table on the other, always shown (never a hidden alternative). The table is the source
 * of truth: a capped axis only moves a bubble, never its values here.
 *
 * The canvas is named by a sentence describing the encoding (aria-labelledby on an aria-hidden
 * paragraph, so it is not read a second time as text); the visible summary follows as ordinary text,
 * read once. When there is no event, no chart is
 * rendered at all: only the summary and the table.
 */
export default function OperatorActivitySection({ data }: { data: BubbleChartData }) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        {!data.empty && <OperatorBubbleChart data={data} labelId={ENCODING_ID} />}
        <p id={SUMMARY_ID} className="mt-3 text-sm text-gray-700">{data.summary}</p>
        {!data.empty && (
          <>
            <p id={ENCODING_ID} aria-hidden="true" className="sr-only">
              Graphique à bulles : créneaux en horizontal, inscriptions en vertical, surface selon le nombre de postes.
            </p>
            <p className="mt-1 text-xs text-gray-600">Une bulle par événement ; sa surface suit le nombre de postes.</p>
          </>
        )}
      </div>

      <div>
        <h3 id="bubble-table-title" className="text-sm font-semibold text-gray-900">Les mêmes événements en tableau</h3>
        <div
          role="region"
          aria-labelledby="bubble-table-title"
          tabIndex={0}
          className="mt-2 bg-white border border-gray-200 rounded-2xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <table className="w-full text-sm">
            <caption className="sr-only">
              Événements en cours ou qui commencent dans les 30 jours, avec leur organisation, leurs dates, leurs créneaux, leurs inscriptions et leurs postes
            </caption>
            <thead className="bg-gray-50 text-left text-gray-700">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Événement</th>
                <th scope="col" className="px-3 py-2 font-medium">Dates</th>
                <th scope="col" className="px-3 py-2 font-medium">Situation</th>
                <th scope="col" className="px-3 py-2 font-medium text-right">Créneaux</th>
                <th scope="col" className="px-3 py-2 font-medium text-right">Inscriptions</th>
                <th scope="col" className="px-3 py-2 font-medium text-right">Postes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.points.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-gray-700">Aucun événement en cours ou dans les 30 jours.</td>
                </tr>
              ) : (
                data.points.map((point) => (
                  <tr key={point.id}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <span className="block font-medium break-words text-gray-900">{point.title}</span>
                      <span className="block text-xs break-words text-gray-600">{point.organizationName}</span>
                    </th>
                    <td className="px-3 py-2 text-gray-700">{eventDatesLabel(point.startDate, point.endDate)}</td>
                    <td className="px-3 py-2 text-gray-700">
                      <span aria-hidden="true" className="mr-1">{BUBBLE_CATEGORY_SYMBOLS[point.category]}</span>
                      {BUBBLE_CATEGORY_LABELS[point.category]}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">{point.shifts}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">{point.registrations}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">{point.roles}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
