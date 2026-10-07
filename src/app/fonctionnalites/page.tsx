import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/doc-pages"
import { publicPageJsonLd } from "@/lib/structured-data"
import JsonLd from "@/components/public/JsonLd"
import FeaturesPage from "@/components/public/FeaturesPage"
import { renderFeaturesPage } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"
import { env } from "@/lib/env"

// Rendered per request (#645): its stills and video players depend on VIDEO_MEDIA_BASE_URL, only
// set in the running container, so a page prerendered by `next build` would never show them.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/fonctionnalites", apexBaseUrl())
}

// Rendered from the repo's FEATURES.md, the only copy of this content (AGENTS.md), laid out by
// src/lib/features-page.ts: editing that file changes this page, nothing here duplicates it.
export default function Page() {
  return (
    <>
      {/* The page, its breadcrumb and the application it presents (src/lib/structured-data.ts). */}
      <JsonLd data={publicPageJsonLd("/fonctionnalites", apexBaseUrl())} />
      <FeaturesPage page={renderFeaturesPage(env.VIDEO_MEDIA_BASE_URL)} />
    </>
  )
}
