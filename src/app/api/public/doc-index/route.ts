// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import MiniSearch from "minisearch"
import { DOC_INDEX_OPTIONS, docSearchDocuments } from "@/lib/doc-search-index"
import { loadDocUnits } from "@/lib/doc-units"

/**
 * The documentation's search index (#1319): the MiniSearch instance serialised as JSON, fetched by
 * the filter only when a reader first interacts with it (focus or keystroke). A visitor who never
 * filters doesn't download it, and the page itself stays as small as before.
 *
 * The units ship in the image and only change with a deploy, so the index is built once and the
 * answer is cached for an hour (a day more while it revalidates).
 */
export const dynamic = "force-static"

const CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400"

/** Build the JSON index from the documentation units, with the options the browser loads it with. */
export function buildDocIndexJson(): string {
  const index = new MiniSearch(DOC_INDEX_OPTIONS)
  index.addAll(docSearchDocuments(loadDocUnits()))
  return JSON.stringify(index)
}

export function GET() {
  return new Response(buildDocIndexJson(), {
    headers: { "Content-Type": "application/json", "Cache-Control": CACHE_CONTROL },
  })
}
