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
  return publicPageMetadata("/legal/sous-traitance", apexBaseUrl())
}

// The data processing agreement (art. 28 GDPR, art. 9 nFADP), rendered from
// ACCORD-SOUS-TRAITANCE.md, its only copy.
export default function ProcessingAgreementPage() {
  // The hosted service's own page (#760): absent on another instance, which has /legal/exploitant.
  if (!pageAvailable(publicPage("/legal/sous-traitance"))) notFound()
  const { title, html } = renderPublicSource("ACCORD-SOUS-TRAITANCE.md", "Accord de sous-traitance")
  return (
    <>
      <JsonLd data={publicPageJsonLd("/legal/sous-traitance", apexBaseUrl())} />
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
