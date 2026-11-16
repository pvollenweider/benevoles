// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import EditorialPage, { editorialPageMetadata } from "@/components/public/EditorialPage"

// An audience page (#872, #1325), rendered from BENEVOLES-MAIRIE-COMMUNE.md (src/components/public/EditorialPage.tsx).
const PATH = "/benevoles-mairie-commune"

// Rendered per request: its stills and players need VIDEO_MEDIA_BASE_URL, only set in the running container.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return editorialPageMetadata(PATH)
}

export default function Page() {
  return <EditorialPage path={PATH} eyebrow="Pour qui ?" />
}
