// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { headers } from "next/headers"
import NotFoundPage from "@/components/public/NotFoundPage"
import { NOT_FOUND_TITLE, notFoundLinks, type NotFoundOrg } from "@/lib/not-found-links"
import { ORG_HEADER } from "@/lib/org-subdomain"
import { resolveOrgSlug } from "@/lib/resolve-org"

// Absolute: a title template added to the root layout must not double the site name.
export const metadata: Metadata = {
  title: { absolute: NOT_FOUND_TITLE },
  robots: { index: false, follow: true },
}

/** The organization of the host (or `?org=`), or null: the 404 page must render even if it can't be read. */
async function currentOrg(): Promise<NotFoundOrg | null> {
  const rawOrgSlug = (await headers()).get(ORG_HEADER)
  if (!rawOrgSlug) return null
  try {
    const resolved = await resolveOrgSlug(rawOrgSlug)
    return resolved ? { slug: resolved.org.slug } : null
  } catch {
    return null
  }
}

/**
 * Every unmatched URL and every `notFound()` of the app (an unknown event, documentation unit or
 * video, an admin page of another organization): rendered inside the root layout only, so it looks
 * the same under /doc, /videos or /admin. On an organization's host, its primary link leads back to
 * that organization's events (src/lib/not-found-links.ts).
 */
export default async function NotFound() {
  const host = (await headers()).get("host") ?? ""
  return <NotFoundPage links={notFoundLinks(await currentOrg(), host)} />
}
