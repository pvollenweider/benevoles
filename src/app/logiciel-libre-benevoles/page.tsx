// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import EditorialPage, { editorialPageMetadata } from "@/components/public/EditorialPage"

// The free software page (#1326), rendered from LOGICIEL-LIBRE-BENEVOLES.md
// (src/components/public/EditorialPage.tsx): the sections, the facts and the FAQ of the file.
const PATH = "/logiciel-libre-benevoles"

// Rendered per request, like the other editorial pages: its links depend on the running instance.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return editorialPageMetadata(PATH)
}

export default function Page() {
  return <EditorialPage path={PATH} eyebrow="Logiciel libre" />
}
