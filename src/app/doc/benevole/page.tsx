import type { Metadata } from "next"
import { publicPage, publicPageMetadata } from "@/lib/doc-pages"
import { loadDocUnits } from "@/lib/doc-units"
import { apexBaseUrl } from "@/lib/urls"
import RoleGuide from "../RoleGuide"

// Rendered per request, like the units it lists (src/app/doc/[slug]/page.tsx).
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/doc/benevole", apexBaseUrl())
}

// The volunteer guide is entirely split into units (#649): the page is their index, by group
// (src/app/doc/RoleGuide.tsx), and follows the old /doc/benevole#<anchor> links to their unit.
// GUIDE_BENEVOLE.md stays at the repo root only to point readers on GitHub to guide/.
export default function DocBenevolePage() {
  const { title } = publicPage("/doc/benevole")
  return <RoleGuide role="benevole" units={loadDocUnits()} title={title} html={null} />
}
