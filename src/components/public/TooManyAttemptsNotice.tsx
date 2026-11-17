// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { TOO_MANY_ATTEMPTS_PARAGRAPHS, TOO_MANY_ATTEMPTS_TITLE } from "@/lib/too-many-attempts"

/**
 * « Réessaie dans une heure » on a page a personal link opens (src/lib/token-page-guard.ts): a server
 * component, in the page's HTML from the start. The tab title and the heading carry the message:
 * no live region, no focus move, no timer, nothing to click. Rendered inside the page's own card.
 */
export default function TooManyAttemptsNotice() {
  return (
    <>
      <h1 className="text-xl font-bold text-gray-900 mb-2 break-words">{TOO_MANY_ATTEMPTS_TITLE}</h1>
      {TOO_MANY_ATTEMPTS_PARAGRAPHS.map((text, i) => (
        <p key={i} className={`text-sm text-gray-700 break-words${i > 0 ? " mt-3" : ""}`}>{text}</p>
      ))}
    </>
  )
}
