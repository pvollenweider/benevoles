// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { confirmedLine, MULTIPLE_NOTE, rowLabel, waitingLine, type AnswerSummary as Summary } from "@/lib/question-answer-summary"

const linkClass =
  "text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * « Synthèse des réponses » of the Questions page (#686): one table per question, counts only, no
 * chart. Server-rendered: the « État au » line says when it was computed.
 */
export default function AnswerSummary({ eventId, summary, stamp }: { eventId: string; summary: Summary; stamp: string }) {
  const base = `/api/admin/events/${eventId}/export`
  const waiting = summary.waitingCount > 0
  const empty = summary.questions.length === 0
    ? "Aucune question pour l'instant : la synthèse apparaîtra ici avec la première question."
    : summary.confirmedCount === 0
      ? `Aucun bénévole confirmé pour l'instant : la synthèse compte les réponses des bénévoles qui ont au moins un créneau confirmé.${waiting ? ` ${waitingLine(summary.waitingCount)}.` : ""}`
      : null

  return (
    <section aria-labelledby="answers-summary" className="space-y-3">
      <div>
        <h2 id="answers-summary" className="text-sm font-semibold text-gray-900">Synthèse des réponses</h2>
        <p className="text-xs text-gray-600 mt-0.5">{stamp}</p>
      </div>
      {empty ? (
        <p className="text-sm text-gray-700">{empty}</p>
      ) : (
        <>
          <p className="text-sm text-gray-700">
            Chaque bénévole compte une fois, quel que soit son nombre de créneaux : <strong>{confirmedLine(summary.confirmedCount)}</strong>
            {waiting ? `, et ${waitingLine(summary.waitingCount)}` : ""}. Les inscriptions annulées ne comptent pas, ni les questions retirées.
          </p>
          <ul role="list" className="flex flex-wrap gap-x-6 gap-y-1">
            <li>
              <a href={`${base}/answers`} download className={linkClass}>
                Télécharger la synthèse (CSV)
                <span className="sr-only"> (télécharge un fichier)</span>
              </a>
            </li>
            <li>
              <a href={`${base}/sheets/answers`} target="_blank" rel="noopener" className={linkClass}>
                Imprimer la synthèse
                <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
                <span aria-hidden="true" className="ml-1 font-normal text-gray-500">↗</span>
              </a>
            </li>
          </ul>
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
            {summary.questions.map((q) => (
              <div key={q.id} className="px-4 py-3">
                <table className="w-full text-sm border-collapse">
                  <caption className="text-left text-sm font-semibold text-gray-900 mb-1">
                    {q.label}
                    {q.type === "multiple" && <span className="block text-xs font-normal text-gray-600">{MULTIPLE_NOTE}</span>}
                  </caption>
                  <thead>
                    <tr className="border-b-2 border-gray-400">
                      <th scope="col" className="text-left text-xs font-medium text-gray-700 py-1 pr-2">Réponse</th>
                      <th scope="col" className="text-right text-xs font-medium text-gray-700 py-1 pl-2 w-24">Confirmés</th>
                      {waiting && <th scope="col" className="text-right text-xs font-medium text-gray-700 py-1 pl-2 w-24">En attente</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {q.rows.map((r) => (
                      <tr key={`${r.kind}:${r.answer}`} className="border-b border-gray-200 last:border-b-0">
                        <th scope="row" className={`text-left font-normal py-1 pr-2 break-words ${r.kind === "none" || r.kind === "removed" ? "text-gray-700 italic" : "text-gray-900"}`}>{rowLabel(r)}</th>
                        <td className="text-right tabular-nums py-1 pl-2">{r.confirmed}</td>
                        {waiting && <td className="text-right tabular-nums py-1 pl-2">{r.waiting}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
