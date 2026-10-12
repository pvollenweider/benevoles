import type { Metadata } from "next"
import EditorialPage, { editorialPageMetadata } from "@/components/public/EditorialPage"

// The index of the audience pages (#872), rendered from POUR-QUI.md (src/components/public/EditorialPage.tsx).
const PATH = "/pour-qui"

// Rendered per request: its stills and players need VIDEO_MEDIA_BASE_URL, only set in the running container.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return editorialPageMetadata(PATH)
}

export default function Page() {
  return <EditorialPage path={PATH} eyebrow="Pour qui ?" />
}
