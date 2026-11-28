// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import EditorialPage, { editorialPageMetadata } from "@/components/public/EditorialPage"

// The training path, rendered from SE-FORMER.md (src/components/public/EditorialPage.tsx):
// thirteen published videos in the order of a first activity, under an hour.
const PATH = "/se-former"

// Rendered per request, like the other editorial pages: its links depend on the running instance.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return editorialPageMetadata(PATH)
}

export default function Page() {
  return <EditorialPage path={PATH} eyebrow="Formation" />
}
