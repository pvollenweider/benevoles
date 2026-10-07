// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/doc-pages"
import { renderChangelog } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"
import { publicPageJsonLd, REPOSITORY_URL } from "@/lib/structured-data"
import JsonLd from "@/components/public/JsonLd"
import ReleaseNotes from "@/components/public/ReleaseNotes"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/nouveautes", apexBaseUrl())
}

// What changed, version by version (#757), rendered from CHANGELOG.md, its only copy: released
// versions only, public sections only (src/lib/changelog.ts). Nothing here duplicates it.
export default function ReleaseNotesPage() {
  return (
    <>
      <JsonLd data={publicPageJsonLd("/nouveautes", apexBaseUrl())} />
      <ReleaseNotes releases={renderChangelog()} fullChangelogUrl={`${REPOSITORY_URL}/blob/main/CHANGELOG.md`} />
    </>
  )
}
