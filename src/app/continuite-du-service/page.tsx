// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import EditorialPage, { editorialPageMetadata } from "@/components/public/EditorialPage"

// The service continuity page (#1357), rendered from CONTINUITE-DU-SERVICE.md
// (src/components/public/EditorialPage.tsx): backups, the paper fallback, the way out and the
// limits of the hosted service, then the FAQ of the file.
const PATH = "/continuite-du-service"

// Rendered per request, like the other editorial pages: its links depend on the running instance.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return editorialPageMetadata(PATH)
}

export default function Page() {
  return <EditorialPage path={PATH} eyebrow="Continuité du service" />
}
