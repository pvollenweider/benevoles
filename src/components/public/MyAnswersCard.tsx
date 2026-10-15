// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { orgContactHref } from "@/lib/mission-brief"
import { MY_ANSWERS_TITLE, NO_ANSWER_TEXT, type MyAnswerRow } from "@/lib/my-answers"
import { ORG_CONTACT_LABEL } from "@/lib/shift-info"

const linkCls = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * « Mes réponses » (#984), under the registrations of the personal page: each question of the
 * sign-up form with the volunteer's answer, read-only. To change one, the organisation's email,
 * when there is one. Nothing when the event asks no question.
 */
export default function MyAnswersCard({ rows, contactEmail, eventTitle }: {
  rows: MyAnswerRow[]
  contactEmail: string | null
  eventTitle: string
}) {
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="my-answers-title" className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h2 id="my-answers-title" className="text-sm font-semibold text-gray-900">{MY_ANSWERS_TITLE}</h2>
        <p className="text-sm text-gray-700 mt-0.5">Ce que tu as répondu aux questions de l&apos;inscription.</p>
      </div>
      <dl className="space-y-2 text-sm text-gray-800">
        {rows.map((row) => (
          <div key={row.id}>
            <dt className="font-medium text-gray-900 break-words">{row.label}</dt>
            <dd className="break-words">{row.answer ?? <span className="italic text-gray-600">{NO_ANSWER_TEXT}</span>}</dd>
          </div>
        ))}
      </dl>
      {contactEmail && (
        <p className="text-sm text-gray-700">
          Pour changer une réponse, écris à l&apos;organisation :{" "}
          <a href={orgContactHref(contactEmail, eventTitle)} className={linkCls}>{ORG_CONTACT_LABEL}</a>.
        </p>
      )}
    </section>
  )
}
