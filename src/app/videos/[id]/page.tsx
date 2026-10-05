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

type Params = { id: string }

// The stable id (e.g. EVENT_CREATE_BLANK) is canonical; the manifest slug (event-create-blank)
// also resolves here and redirects to the id (#644 owner decision — one canonical URL per video,
// so links and analytics never split between the two).
function findVideo(catalog: Video[], param: string): { video: Video | null; isSlug: boolean } {
  const byId = catalog.find((v) => v.id === param)
  if (byId) return { video: byId, isSlug: false }
  const bySlug = catalog.find((v) => v.slug === param)
  return { video: bySlug ?? null, isSlug: true }
}

export function generateStaticParams(): Params[] {
  return loadVideoCatalog().map((v) => ({ id: v.id }))
}

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

export default async function VideoDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params
  const catalog = loadVideoCatalog()
  const { video, isSlug } = findVideo(catalog, id)
  if (!video) notFound()
  if (isSlug) redirect(`/videos/${video.id}`)

  const mediaUrls = videoMediaUrls(video.slug, env.VIDEO_MEDIA_BASE_URL)
  const related = relatedVideos(video, catalog)
  const updatedAtLabel = new Date(`${video.updatedAt}T00:00:00Z`).toLocaleDateString("fr-CH", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

  const canonicalSections = [
    { heading: "Utilité", body: video.script.utilite },
    { heading: "Démonstration", body: video.script.demonstration },
    { heading: "Résultat visible", body: video.script.resultatVisible },
    { heading: "Points d'attention", body: video.script.pointsAttention },
  ].filter((s): s is { heading: string; body: string } => Boolean(s.body))
  // Five scripts predate the four-part recipe (src/lib/video-catalog.ts parseScript): fall back to
  // whatever sections the script actually has, rather than showing nothing.
  const sections = canonicalSections.length > 0 ? canonicalSections : video.script.sections

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

      <section aria-labelledby="video-script-heading" className="space-y-6">
        <h2 id="video-script-heading" className="text-sm font-semibold text-gray-800">Script</h2>
        {sections.map((s) => (
          <div key={s.heading}>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">{s.heading}</h3>
            <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{s.body}</div>
          </div>
        ))}
      </section>

      <section aria-labelledby="video-transcript-heading" className="space-y-2">
        <h2 id="video-transcript-heading" className="text-sm font-semibold text-gray-800">Transcript</h2>
        {/* From the manifest's segments, committed to the repo — never fetched at build/ISR. */}
        <div className="text-sm text-gray-600 leading-relaxed space-y-3">
          {video.manifest.segments.map((segment) => (
            <p key={segment.id}>{segment.transcript}</p>
          ))}
        </div>
      </section>

      {related.length > 0 && (
        <section aria-labelledby="video-related-heading">
          <h2 id="video-related-heading" className="text-sm font-semibold text-gray-800 mb-3">Vidéos liées</h2>
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
