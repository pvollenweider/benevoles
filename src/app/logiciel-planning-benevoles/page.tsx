import type { Metadata } from "next"
import EditorialPage, { editorialPageMetadata } from "@/components/public/EditorialPage"

// An editorial page (#767) rendered from LOGICIEL-PLANNING-BENEVOLES.md (src/components/public/EditorialPage.tsx).
const PATH = "/logiciel-planning-benevoles"

// Rendered per request: its stills and players need VIDEO_MEDIA_BASE_URL, only set in the running container.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return editorialPageMetadata(PATH)
}

export default function Page() {
  return <EditorialPage path={PATH} eyebrow="Pour les associations" />
}
