// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/doc-pages"
import { renderPublicSource } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/legal/sous-traitants", apexBaseUrl())
}

// The public list of sub-processors (annex III of the processing agreement), rendered from
// SOUS-TRAITANTS.md, its only copy.
export default function SubProcessorsPage() {
  const { title, html } = renderPublicSource("SOUS-TRAITANTS.md", "Liste des sous-traitants")
  return (
    <>
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
