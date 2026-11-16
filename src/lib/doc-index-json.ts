// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import MiniSearch from "minisearch"
import { DOC_INDEX_OPTIONS, docSearchDocuments } from "@/lib/doc-search-index"
import { loadDocUnits } from "@/lib/doc-units"

/**
 * Build the documentation's search index (#1319) from the documentation units, serialised as JSON
 * with the options the browser loads it with. Server only: it reads the units from disk.
 *
 * Kept out of `src/app/api/public/doc-index/route.ts` because a route file may export only its
 * handlers and route settings; the type check of `next build` refuses any other export.
 */
export function buildDocIndexJson(): string {
  const index = new MiniSearch(DOC_INDEX_OPTIONS)
  index.addAll(docSearchDocuments(loadDocUnits()))
  return JSON.stringify(index)
}
