// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import ContentShell from "@/components/public/ContentShell"
import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import { SITE_CONTAINER_CLASS } from "@/components/public/site-container"
import { CONTENT_VIEWPORT } from "@/lib/seo-metadata"

export const viewport = CONTENT_VIEWPORT

/**
 * The video library (#644): public and indexed since 2026-10-07 (src/lib/video-seo.ts), linked
 * from the site footer and the documentation, listed in its own /video-sitemap.xml rather than in
 * CONTENT_NAV (src/lib/doc-pages.ts). In the frame of every public content page (#1116): the same
 * header (navigation, « Pour qui ? », theme toggle), the same footer and the dark theme;
 * `layout="doc"` because the library draws its own, wider <main> (no prose column).
 */
export default function VideosLayout({ children }: { children: React.ReactNode }) {
  return (
    <ContentShell layout="doc">
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className={`${SITE_CONTAINER_CLASS} py-10 focus:outline-none`}>
        {children}
      </main>
    </ContentShell>
  )
}
