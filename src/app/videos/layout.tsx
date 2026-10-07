// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import SkipLink, { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"

/**
 * The video library (#644): public and indexed since 2026-10-07 (src/lib/video-seo.ts), linked
 * from the site footer and the documentation, listed in its own /video-sitemap.xml rather than in
 * CONTENT_NAV (src/lib/doc-pages.ts). Its own minimal frame instead of ContentShell.
 */
export default function VideosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <SkipLink />
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <Link href="/" className="inline-flex py-3 -my-3 text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            benevol.app
          </Link>
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="max-w-5xl mx-auto px-6 py-10 focus:outline-none">
        {children}
      </main>
    </div>
  )
}
