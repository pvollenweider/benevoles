import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/doc-pages"
import { renderPublicSource } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"
import { env } from "@/lib/env"

// Rendered per request (#645): its video links depend on VIDEO_MEDIA_BASE_URL, only set in the
// running container, so a page prerendered by `next build` would never show them.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/doc/benevole", apexBaseUrl())
}

// Rendered from the repo's own GUIDE_BENEVOLE.md (source of truth, also readable on GitHub).
export default function DocBenevolePage() {
  const { title, html } = renderPublicSource("GUIDE_BENEVOLE.md", "Guide bénévole", env.VIDEO_MEDIA_BASE_URL)
  return (
    <>
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
