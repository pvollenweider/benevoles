// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { FRESHNESS_LABEL, type Freshness } from "@/lib/freshness"

const STYLE: Record<Freshness, string> = {
  new: "border-blue-700 text-blue-800 dark:border-blue-300 dark:text-blue-200",
  updated: "border-gray-500 text-gray-800 dark:border-gray-400 dark:text-gray-200",
}

/**
 * « Nouveau » / « Mis à jour » (#763): the word itself, in a small bordered pill, never a colour
 * alone. Inline-flex, so a surrounding link's underline doesn't run through it. `separated` adds a
 * visually hidden « , » before it (the visual gap is the caller's margin, so no underlined space), for when it follows other text in the same accessible name (a
 * link reads « Titre, Nouveau », not « Titre Nouveau »).
 */
export default function FreshnessBadge({ kind, separated = false, className = "" }: { kind: Freshness; separated?: boolean; className?: string }) {
  return (
    <>
      {separated && <span className="sr-only">, </span>}
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold leading-4 whitespace-nowrap ${STYLE[kind]} ${className}`}>
        {FRESHNESS_LABEL[kind]}
      </span>
    </>
  )
}
