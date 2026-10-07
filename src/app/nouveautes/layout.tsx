// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import ContentShell from "@/components/public/ContentShell"
import { CONTENT_VIEWPORT } from "@/lib/seo-metadata"

export const viewport = CONTENT_VIEWPORT

export default function ReleaseNotesLayout({ children }: { children: React.ReactNode }) {
  return <ContentShell>{children}</ContentShell>
}
