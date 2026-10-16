// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import type { MergedSentence } from "@/lib/member-record-state"

/**
 * An absorbed record's explanation (#1014), on its row in the members list and on its own page:
 * the kept record's name links to it, the deletion day is a <time>, a leading « · » separator is
 * decorative (read inconsistently by screen readers, the clauses stand on their own).
 */
export default function MergedSentenceView({ sentence, keptId, deletionDay }: { sentence: MergedSentence; keptId: string | null; deletionDay: string }) {
  const dot = sentence.beforeDate.startsWith(" · ")
  return (
    <>
      {sentence.lead}
      {sentence.keptName && (keptId ? (
        <Link href={`/admin/members/${keptId}`} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          {sentence.keptName}
        </Link>
      ) : sentence.keptName)}
      {dot && <span aria-hidden="true"> · </span>}
      {dot ? sentence.beforeDate.slice(3) : sentence.beforeDate}
      <time dateTime={deletionDay}>{sentence.date}</time>
      {sentence.end}
    </>
  )
}
