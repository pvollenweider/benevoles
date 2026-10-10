// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import PublicFooter from "@/components/PublicFooter"
import ContentNav from "@/components/public/ContentNav"
import SiteBrandLink from "@/components/public/SiteBrandLink"
import SkipLink, { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import { SITE_CONTAINER_CLASS } from "@/components/public/site-container"

/**
 * The video library (#644): public and indexed since 2026-10-07 (src/lib/video-seo.ts), linked
 * from the site footer and the documentation, listed in its own /video-sitemap.xml rather than in
 * CONTENT_NAV (src/lib/doc-pages.ts). Its own frame instead of ContentShell (no dark theme, a gray
 * page under the cards), with the same header navigation (features, guides) and the same site
 * footer, all in the site container (SITE_CONTAINER_CLASS) as on the other public pages.
 */
export default function VideosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <SkipLink />
      <header className="border-b border-gray-200 bg-white">
        <div className={`${SITE_CONTAINER_CLASS} py-4 flex items-center justify-between flex-wrap gap-x-2 gap-y-4`}>
          <SiteBrandLink className="text-gray-900 hover:text-gray-600 focus-visible:outline-blue-600" />
          <ContentNav />
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className={`${SITE_CONTAINER_CLASS} py-10 focus:outline-none`}>
        {children}
      </main>
      {/* After </main>: a footer inside main loses its contentinfo role. */}
      <div className={SITE_CONTAINER_CLASS}>
        <PublicFooter variant="site" />
      </div>
    </div>
  )
}
