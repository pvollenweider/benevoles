// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { env } from "@/lib/env"
import { apexBaseUrl } from "@/lib/urls"
import type { VideoSeoContext } from "@/lib/video-seo"

/**
 * The base URLs of the video library's SEO (src/lib/video-seo.ts), read per request (server
 * only). `env.NEXT_PUBLIC_APP_URL` is parsed from the running container's environment: unlike a
 * literal `process.env.NEXT_PUBLIC_…` (what `apexBaseUrl()` reads), it is not frozen into the
 * bundle at `next build`, where it is unset, so a canonical URL never says localhost in production.
 */
export function videoSeoContext(): VideoSeoContext {
  return { siteBase: env.NEXT_PUBLIC_APP_URL ?? apexBaseUrl(), mediaBaseUrl: env.VIDEO_MEDIA_BASE_URL }
}
