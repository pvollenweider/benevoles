// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { filterPublishedVideos, VIDEO_LIBRARY_PUBLIC_ONLY } from "@/lib/video-catalog"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import VideoGallery from "@/components/videos/VideoGallery"

// Unlisted (#644): no navigation link, not in the sitemap (src/lib/doc-pages.ts), and explicitly
// not indexed — robots.ts also disallows the whole /videos path as a second line of defence.
export const metadata: Metadata = {
  title: "Bibliothèque vidéo — benevol.app",
  description: "Vidéos de la masterclass benevol.app, par thème et par public.",
  robots: { index: false, follow: false },
}

export default function VideosPage() {
  const videos = filterPublishedVideos(loadVideoCatalog(), VIDEO_LIBRARY_PUBLIC_ONLY)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Bibliothèque vidéo</h1>
        <p className="mt-1 text-sm text-gray-600">
          {videos.length} vidéo{videos.length > 1 ? "s" : ""} de la masterclass benevol.app. Page interne, non référencée.
        </p>
      </div>
      <VideoGallery videos={videos} />
    </div>
  )
}
