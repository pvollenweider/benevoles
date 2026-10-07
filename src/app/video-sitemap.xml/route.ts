// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { headers } from "next/headers"
import { isKnownHost } from "@/lib/urls"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import { videoSitemapXml } from "@/lib/video-seo"
import { videoSeoContext } from "@/lib/video-seo-context"

// The video sitemap (Google's video extension, src/lib/video-seo.ts): the library and every
// indexed video page. Its own URL so the apex sitemap index can list it, and robots.ts names it.
// Per request: which videos can be played depends on VIDEO_MEDIA_BASE_URL (runtime only). Only the
// apex host lists them; an organization's host, staging or an unknown host get an empty list
// (the pages' canonical is the apex one anyway).
export const dynamic = "force-dynamic"

export async function GET() {
  const h = await headers()
  const hostname = (h.get("host") ?? "").split(":")[0]
  const apex = !h.get("x-org-slug") && isKnownHost(hostname) && !hostname.startsWith("staging.")
  const body = videoSitemapXml(apex ? loadVideoCatalog() : [], videoSeoContext())
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } })
}
