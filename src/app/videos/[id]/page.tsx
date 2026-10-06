// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import {
  relatedVideos,
  videoMediaUrls,
  formatDuration,
  themeLabel,
  AUDIENCE_LABELS,
  LEVEL_LABELS,
  type Video,
} from "@/lib/video-catalog"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import { env } from "@/lib/env"
import VideoPlayer from "@/components/videos/VideoPlayer"
import AutoplayLink from "@/components/videos/AutoplayLink"
import VideoFeedback from "@/components/videos/VideoFeedback"
import { feedbackContextFrom, FROM_DOC_PARAM, FROM_DOC_VALUE } from "@/lib/video-feedback"

type Params = { id: string }
type SearchParams = Record<string, string | string[] | undefined>

// The stable id (e.g. EVENT_CREATE_BLANK) is canonical; the manifest slug (event-create-blank)
// also resolves here and redirects to the id (#644 owner decision — one canonical URL per video,
// so links and analytics never split between the two).
function findVideo(catalog: Video[], param: string): { video: Video | null; isSlug: boolean } {
  const byId = catalog.find((v) => v.id === param)
  if (byId) return { video: byId, isSlug: false }
  const bySlug = catalog.find((v) => v.slug === param)
  return { video: bySlug ?? null, isSlug: true }
}

// Rendered per request, not at build time: the media base URL (VIDEO_MEDIA_BASE_URL) is only set in
// the running container's environment, so a page prerendered during `next build` froze « Vidéo
// bientôt disponible » for every video (seen in production). The catalogue itself is read from
// disk and is cheap.
export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params
  const { video } = findVideo(loadVideoCatalog(), id)
  if (!video) return { robots: { index: false, follow: false } }
  return {
    title: `${video.title} — Bibliothèque vidéo — benevol.app`,
    description: video.description,
    robots: { index: false, follow: false },
  }
}

export default async function VideoDetailPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<SearchParams> }) {
  const { id } = await params
  // Reading context of the « utile ? » answer (#646): `?from=doc` when a guide links here (#645),
  // the video library otherwise. Kept across the slug → id redirect.
  const fromDoc = feedbackContextFrom((await searchParams)[FROM_DOC_PARAM]) === "documentation"
  const catalog = loadVideoCatalog()
  const { video, isSlug } = findVideo(catalog, id)
  if (!video) notFound()
  if (isSlug) redirect(`/videos/${video.id}${fromDoc ? `?${FROM_DOC_PARAM}=${FROM_DOC_VALUE}` : ""}`)

  const mediaUrls = videoMediaUrls(video.slug, env.VIDEO_MEDIA_BASE_URL)
  const related = relatedVideos(video, catalog)
  const updatedAtLabel = new Date(`${video.updatedAt}T00:00:00Z`).toLocaleDateString("fr-CH", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

  const viewer = video.manifest.viewer

  return (
    <div className="space-y-10">
      <div>
        <Link href="/videos" className="text-sm text-blue-600 hover:underline">← Bibliothèque vidéo</Link>
      </div>

      <div>
        <h1 className="text-xl font-bold text-gray-900">{video.title}</h1>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">{video.description}</p>
      </div>

      <VideoPlayer title={video.title} mediaUrls={mediaUrls} />

      <VideoFeedback videoId={video.id} revision={video.revision} audience={video.audience} context={fromDoc ? "documentation" : "masterclass"} />

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <dt className="text-xs font-medium text-gray-500">Durée</dt>
          <dd className="text-gray-800">{formatDuration(video.durationMs)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500">Niveau</dt>
          <dd className="text-gray-800">{LEVEL_LABELS[video.level]}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500">Public</dt>
          <dd className="text-gray-800">{video.audience.map((a) => AUDIENCE_LABELS[a]).join(", ")}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500">Fonctionnalité liée</dt>
          <dd className="text-gray-800">{video.feature}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500">Mise à jour</dt>
          <dd className="text-gray-800">{updatedAtLabel}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-1.5">
        {video.themes.map((t) => (
          <span key={t} className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5">{themeLabel(t)}</span>
        ))}
        {video.tags.map((t) => (
          <span key={t} className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5">{t}</span>
        ))}
        {!video.published && (
          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5">À venir</span>
        )}
      </div>

      {/* Viewer-facing content (#644 owner feedback): what the video explains, written from its
          narration — never the internal editorial script (Utilité/Démonstration/Résultat
          visible/Points d'attention), which is production material and isn't shown here. */}
      <section aria-labelledby="video-summary-heading" className="space-y-2">
        <h2 id="video-summary-heading" className="text-sm font-semibold text-gray-900">Dans cette vidéo</h2>
        <p className="text-sm text-gray-600 leading-relaxed">{viewer.summary}</p>
      </section>

      <section aria-labelledby="video-steps-heading" className="space-y-2">
        <h2 id="video-steps-heading" className="text-sm font-semibold text-gray-900">Les étapes</h2>
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-600 leading-relaxed">
          {viewer.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="video-remember-heading" className="space-y-2">
        <h2 id="video-remember-heading" className="text-sm font-semibold text-gray-900">À retenir</h2>
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-600 leading-relaxed">
          {viewer.remember.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {/* No separate « Transcription » heading: the summary below already names it, and two
          near-identical labels in a row were read one after the other. */}
      <section aria-label="Transcription complète">
        {/* Closed by default (#644 accessibility review): still in the DOM, reachable by keyboard
            and screen reader. From the manifest's segments, committed to the repo — never fetched
            at build/ISR. */}
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-semibold text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none mr-1">▸</span>
            Transcription complète
          </summary>
          <div className="mt-3 text-sm text-gray-600 leading-relaxed space-y-3">
            {video.manifest.segments.map((segment) => (
              <p key={segment.id}>{segment.transcript}</p>
            ))}
          </div>
        </details>
      </section>

      {related.length > 0 && (
        <section aria-labelledby="video-related-heading">
          <h2 id="video-related-heading" className="text-sm font-semibold text-gray-900 mb-3">Vidéos liées</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {related.map((r) => (
              <li key={r.id}>
                <AutoplayLink href={`/videos/${r.id}`} className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                  <span className="block text-sm font-medium text-gray-900">{r.title}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{formatDuration(r.durationMs)}</span>
                </AutoplayLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
