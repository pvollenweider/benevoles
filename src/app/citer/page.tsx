// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import EditorialPage, { editorialPageMetadata } from "@/components/public/EditorialPage"

// The citation page (#1323), rendered from CITER.md (src/components/public/EditorialPage.tsx)
// as an essay like the manifesto: one reading column, the descriptions to quote as they are.
const PATH = "/citer"

// Rendered per request, like the other editorial pages: its links depend on the running instance.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return editorialPageMetadata(PATH)
}

export default function Page() {
  return <EditorialPage path={PATH} eyebrow="Citer" variant="essay" />
}
