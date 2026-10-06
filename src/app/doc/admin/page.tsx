import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/doc-pages"
import { loadDocUnits, roleHasDocUnits } from "@/lib/doc-units"
import { renderPublicSource } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"
import { env } from "@/lib/env"
import RoleGuide from "../RoleGuide"

// Rendered per request (#645): its video links depend on VIDEO_MEDIA_BASE_URL, only set in the
// running container, so a page prerendered by `next build` would never show them.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/doc/admin", apexBaseUrl())
}

// Rendered from the repo's own GUIDE_ADMIN.md (source of truth, also readable on GitHub), with the
// index of its units above it while the guide is split (#649, src/app/doc/RoleGuide.tsx); the guide
// then sits under « Le guide complet », its headings one level down (same ids).
export default function DocAdminPage() {
  const units = loadDocUnits()
  const shiftHeadings = roleHasDocUnits(units, "admin")
  const { title, html } = renderPublicSource("GUIDE_ADMIN.md", "Guide administrateur", env.VIDEO_MEDIA_BASE_URL, { shiftHeadings })
  return <RoleGuide role="admin" units={units} title={title} html={html} />
}
