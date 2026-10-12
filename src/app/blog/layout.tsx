// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import ContentShell from "@/components/public/ContentShell"
import { CONTENT_VIEWPORT } from "@/lib/seo-metadata"

export const viewport = CONTENT_VIEWPORT

// The blog (#944) in the frame of /nouveautes: the site header and footer, the prose recipe.
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <ContentShell>{children}</ContentShell>
}
