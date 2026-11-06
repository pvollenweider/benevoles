import type { Metadata } from "next"
import EditorialPage, { editorialPageMetadata } from "@/components/public/EditorialPage"

// The manifesto (#1259), rendered from MANIFESTE.md (src/components/public/EditorialPage.tsx) as an
// essay: one reading column, quotes as a plain rule on the left.
const PATH = "/manifeste"

// Rendered per request, like the other editorial pages: its links depend on the running instance.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return editorialPageMetadata(PATH)
}

export default function Page() {
  return <EditorialPage path={PATH} eyebrow="Manifeste" variant="essay" />
}
