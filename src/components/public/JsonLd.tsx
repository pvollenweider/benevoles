// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { jsonLdScript } from "@/lib/structured-data"

/**
 * A page's structured data (src/lib/structured-data.ts) in a <script type="application/ld+json">.
 * Built by the server from the page's own registry entry or source, never from a visitor's input,
 * and escaped by jsonLdScript so it can never close the element.
 */
export default function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />
}
