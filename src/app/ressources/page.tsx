// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { pageAvailable, publicPage, publicPageMetadata } from "@/lib/doc-pages"
import { RESSOURCES_PATH, loadRessources } from "@/lib/ressources"
import { renderRessourcesIndex } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"
import { publicPageJsonLd } from "@/lib/structured-data"
import JsonLd from "@/components/public/JsonLd"
import { RessourcesIndex } from "@/components/public/Ressources"

export function generateMetadata(): Metadata {
  return publicPageMetadata(RESSOURCES_PATH, apexBaseUrl())
}

// The practical guides (#1258): the introduction and the charter from content/pages/RESSOURCES.md,
// the guides from content/ressources/ (src/lib/ressources.ts), most useful first. Hosted service only.
export default function RessourcesPage() {
  const page = publicPage(RESSOURCES_PATH)
  if (!pageAvailable(page) || !page.source) notFound()
  const { title, introHtml, charterHtml } = renderRessourcesIndex(page.source)
  return (
    <>
      <JsonLd data={publicPageJsonLd(RESSOURCES_PATH, apexBaseUrl())} />
      <RessourcesIndex title={title} introHtml={introHtml} charterHtml={charterHtml} guides={loadRessources()} />
    </>
  )
}
