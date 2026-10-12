import type { Metadata } from "next"
import EditorialPage, { editorialPageMetadata } from "@/components/public/EditorialPage"

// An audience page (#872), rendered from BENEVOLES-MANIFESTATION-SPORTIVE.md (src/components/public/EditorialPage.tsx).
const PATH = "/benevoles-manifestation-sportive"

// Rendered per request: its stills and players need VIDEO_MEDIA_BASE_URL, only set in the running container.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return editorialPageMetadata(PATH)
}

export default function Page() {
  return <EditorialPage path={PATH} eyebrow="Pour qui ?" />
}
