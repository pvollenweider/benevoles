// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { pageAvailable, publicPage, publicPageMetadata } from "@/lib/doc-pages"
import { renderPublicSource } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"
import { publicPageJsonLd } from "@/lib/structured-data"
import JsonLd from "@/components/public/JsonLd"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/accessibilite", apexBaseUrl())
}

// The accessibility statement (#487), rendered from ACCESSIBILITE.md, its only copy.
export default function AccessibilityPage() {
  // The hosted service's own page (#760): absent on another instance, which has /legal/exploitant.
  if (!pageAvailable(publicPage("/accessibilite"))) notFound()
  const { title, html } = renderPublicSource("ACCESSIBILITE.md", "Accessibilité")
  return (
    <>
      <JsonLd data={publicPageJsonLd("/accessibilite", apexBaseUrl())} />
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
