import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/doc-pages"
import { loadDocUnits } from "@/lib/doc-units"
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

// The organisers' guide (#649, src/app/doc/RoleGuide.tsx): the introduction from the repo's own
// GUIDE_ADMIN.md (source of truth, also readable on GitHub), then the frequent questions and the
// index of its units.
export default function DocAdminPage() {
  const { title, html } = renderPublicSource("GUIDE_ADMIN.md", "Guide administrateur", env.VIDEO_MEDIA_BASE_URL)
  return <RoleGuide role="admin" units={loadDocUnits()} title={title} html={html} />
}
