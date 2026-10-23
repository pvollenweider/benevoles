// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { LIMIT_HITS_ANCHOR, type LimitHitLine, type OrgLimitHits } from "@/lib/limit-hits-view"

const LINK = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/** The limits one organisation reached (#1100): one line per limit and hour. */
export function LimitHitLines({ hits, indent = false }: { hits: LimitHitLine[]; indent?: boolean }) {
  return (
    <ul role="list" className={`mt-1 space-y-1 ${indent ? "pl-3 border-l-2 border-gray-100" : ""}`}>
      {hits.map((h) => (
        <li key={h.id} className="text-sm text-gray-700">
          {h.label}, <time dateTime={h.firstAt}>{h.when}</time> :{" "}
          {h.held}
          {h.held && h.refused && ", "}
          {h.refused && <span className="font-medium text-red-700">{h.refused}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Every organisation that reached a limit (#1100), each linked to the block of its page. */
export default function LimitHitsList({ groups }: { groups: OrgLimitHits[] }) {
  return (
    <ul role="list" className="divide-y divide-gray-100">
      {groups.map((g) => (
        <li key={g.key} className="py-3 first:pt-0 last:pb-0">
          <p className="text-sm">
            {g.slug ? (
              <Link href={`/super-admin/organizations/${g.slug}#${LIMIT_HITS_ANCHOR}`} className={LINK}>{g.name}<span className="sr-only"> : plafonds d&apos;envoi</span></Link>
            ) : (
              <span className="font-medium text-gray-900">{g.name}</span>
            )}
            {g.queueStatus && (
              <>
                <span className="sr-only">. </span>
                <span className={`ml-2 ${g.stillHeld > 0 ? "text-amber-800" : "text-gray-600"}`}>{g.queueStatus}</span>
              </>
            )}
          </p>
          <LimitHitLines hits={g.hits} indent />
        </li>
      ))}
    </ul>
  )
}
