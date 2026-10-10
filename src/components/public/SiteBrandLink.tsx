// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { SITE_NAME } from "@/lib/seo-metadata"

/**
 * The site's name at the top left of the public pages (content pages, videos, legal documents),
 * linked to the home page, with the logo in front of it: the same drawing as the favicon
 * (src/app/icon.svg), inline so it costs no request and stays sharp. The logo is decorative: the
 * link's name is the site's name, written beside it.
 */
export default function SiteBrandLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 py-3 -my-3 text-sm font-semibold transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
    >
      <SiteLogo />
      {SITE_NAME}
    </Link>
  )
}

export function SiteLogo() {
  return (
    // In dark mode the navy square would melt into the gray-900 header: a faint light ring keeps its edge.
    <svg aria-hidden="true" focusable="false" viewBox="0 0 64 64" className="size-6 shrink-0 rounded-[5px] dark:ring-1 dark:ring-white/25">
      <rect width="64" height="64" rx="14" fill="#1e3a8a" />
      <rect x="12" y="15" width="26" height="8" rx="4" fill="#ffffff" />
      <rect x="22" y="28" width="30" height="8" rx="4" fill="#93c5fd" />
      <rect x="16" y="41" width="22" height="8" rx="4" fill="#ffffff" />
    </svg>
  )
}
