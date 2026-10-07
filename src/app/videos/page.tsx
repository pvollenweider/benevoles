// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { filterPublishedVideos, VIDEO_LIBRARY_PUBLIC_ONLY } from "@/lib/video-catalog"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import { serializeJsonLd, videoLibraryJsonLd, videoLibraryMetadata } from "@/lib/video-seo"
import { videoSeoContext } from "@/lib/video-seo-context"
import VideoGallery from "@/components/videos/VideoGallery"

// Rendered per request: whether the videos can be played (and so indexed) depends on
// VIDEO_MEDIA_BASE_URL, and the canonical URL on NEXT_PUBLIC_APP_URL, both only set in the running
// container (same reason as /videos/[id]).
export const dynamic = "force-dynamic"

// Public and indexed (owner decision, 2026-10-07): linked from the site footer, the documentation
// index and /fonctionnalites, listed in /video-sitemap.xml (src/lib/video-seo.ts).
export function generateMetadata(): Metadata {
  return videoLibraryMetadata(loadVideoCatalog(), videoSeoContext())
}

export default function VideosPage() {
  const videos = filterPublishedVideos(loadVideoCatalog(), VIDEO_LIBRARY_PUBLIC_ONLY)
  const jsonLd = videoLibraryJsonLd(videos, videoSeoContext())

  return (
    <div className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div>
        <h1 className="text-xl font-bold text-gray-900">Bibliothèque vidéo</h1>
        <p className="mt-1 text-sm text-gray-600">
          {videos.length} tutoriel{videos.length > 1 ? "s" : ""} vidéo pour prendre en main benevol.app, par thème et par public.
        </p>
      </div>
      <VideoGallery videos={videos} />
    </div>
  )
}
