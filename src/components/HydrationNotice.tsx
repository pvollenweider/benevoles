"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useHydrated } from "@/lib/use-hydrated"
import { HYDRATION_NOTICE_LEAD, hydrationNoticeText, type HydrationNoticeKind } from "@/lib/hydration-notice"

/**
 * « This page did not start » (#1343). On a browser too old for the site's scripts, nothing
 * attaches to the page: a form reloads without a word, a shift cannot be chosen. This notice is in
 * the server HTML and goes away once the page has started. Until then it stays hidden for a few
 * seconds (.hydration-notice in globals.css, a CSS delay since scripts are what failed), so a
 * healthy browser never shows it; with scripts turned off, the <noscript> rule shows it at once.
 *
 * role="status", never "alert": it is in the first HTML, not an outcome. A reveal by CSS is not
 * reliably announced, so the control it explains points to it with aria-describedby while the page
 * has not started (see hydrationNoticeId).
 */
export default function HydrationNotice({ kind, id, className = "" }: { kind: HydrationNoticeKind; id: string; className?: string }) {
  const hydrated = useHydrated()
  if (hydrated) return null
  return (
    <>
      <noscript><style>{".hydration-notice{animation:none;visibility:visible;max-height:none}"}</style></noscript>
      <div id={id} role="status" className={`hydration-notice ${className}`}>
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <strong className="font-semibold">{HYDRATION_NOTICE_LEAD}</strong> {hydrationNoticeText(kind)}
        </p>
      </div>
    </>
  )
}
