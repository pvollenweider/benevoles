// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/doc-pages"
import { renderPublicSource } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"
import { publicPageJsonLd } from "@/lib/structured-data"
import JsonLd from "@/components/public/JsonLd"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/accessibilite", apexBaseUrl())
}

// The accessibility statement (#487), rendered from ACCESSIBILITE.md, its only copy.
export default function AccessibilityPage() {
  const { title, html } = renderPublicSource("ACCESSIBILITE.md", "Accessibilité")
  return (
    <>
      <JsonLd data={publicPageJsonLd("/accessibilite", apexBaseUrl())} />
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
