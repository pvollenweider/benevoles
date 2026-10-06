import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/doc-pages"
import { loadDocUnits } from "@/lib/doc-units"
import { renderPublicSource } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"
import { env } from "@/lib/env"
import RoleGuide from "../RoleGuide"

// Rendered per request, like the units it lists (src/app/doc/[slug]/page.tsx).
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/doc/benevole", apexBaseUrl())
}

// The volunteers' guide (#649, src/app/doc/RoleGuide.tsx): the welcome from the repo's own
// GUIDE_BENEVOLE.md (source of truth, also readable on GitHub), then the frequent questions and the
// index of its units; old /doc/benevole#<anchor> links are followed to their unit.
export default function DocBenevolePage() {
  const { title, html } = renderPublicSource("GUIDE_BENEVOLE.md", "Guide bénévole", env.VIDEO_MEDIA_BASE_URL)
  return <RoleGuide role="benevole" units={loadDocUnits()} title={title} html={html} />
}
