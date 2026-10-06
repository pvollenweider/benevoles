// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/doc-pages"
import { renderPublicSource } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/legal/sous-traitance", apexBaseUrl())
}

// The data processing agreement (art. 28 GDPR, art. 9 nFADP), rendered from
// ACCORD-SOUS-TRAITANCE.md, its only copy.
export default function ProcessingAgreementPage() {
  const { title, html } = renderPublicSource("ACCORD-SOUS-TRAITANCE.md", "Accord de sous-traitance")
  return (
    <>
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
