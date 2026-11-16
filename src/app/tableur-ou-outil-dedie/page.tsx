import type { Metadata } from "next"
import EditorialPage, { editorialPageMetadata } from "@/components/public/EditorialPage"

// Spreadsheet and chat group, or a dedicated tool? (#871), rendered from TABLEUR-OU-OUTIL-DEDIE.md (src/components/public/EditorialPage.tsx).
const PATH = "/tableur-ou-outil-dedie"

// Rendered per request: its stills and players need VIDEO_MEDIA_BASE_URL, only set in the running container.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return editorialPageMetadata(PATH)
}

export default function Page() {
  return <EditorialPage path={PATH} eyebrow="Pour bien choisir" />
}
