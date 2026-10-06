// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile } from "node:fs/promises"
import path from "node:path"
import type { ProductBuild } from "./product-build"

export type VideoSegment = {
  id: string
  transcript: string
  style?: string
  fallbackDurationMs: number
}

/** Viewer-facing content for the video library's detail page (#644): what the video explains to
 * the viewer, never the internal editorial script. Optional here so existing generation tooling
 * (which never reads or writes it) keeps working untouched; src/lib/video-catalog.ts validates it
 * more strictly for the app. */
export type ManifestViewerContent = {
  summary: string
  steps: string[]
  remember: string[]
}

export type VideoManifest = {
  id: string
  slug: string
  title: string
  description: string
  language: string
  voice: string
  voiceStyle: string
  continuousNarration?: boolean
  /** Legacy marker: new narration never uses inline pause tags; true is rejected. */
  continuousPauseTags?: boolean
  chapterTitles?: Record<string, string>
  viewport: { width: number; height: number; deviceScaleFactor: number }
  segments: VideoSegment[]
  viewer?: ManifestViewerContent
}

export type VideoCatalogEntry = {
  id: string
  manifest: string
  category: string
  tags: string[]
  published: boolean
  /** False while a video's real UI recorder and fixture are still being prepared. */
  captureReady?: boolean
  seedScenario?: string
}

type VideoCatalog = {
  defaultLanguage: string
  videos: VideoCatalogEntry[]
}

export type AudioMetadata = {
  model: string
  voice: string
  generatedAt: string
  segments: Record<string, { file: string; durationMs: number; generationSha256: string }>
}

export type Timeline = {
  slug: string
  capturePurpose?: "rehearsal" | "narration-timed"
  recordedAt: string
  video: string
  product?: ProductBuild
  captureEnvironment?: { locale: string; timeZone: string; organization: string; scenario: string; viewport: { width: number; height: number }; mobile: boolean }
  inputAudioVersion?: 1
  inputEvents?: { kind: "click" | "key"; atMs: number }[]
  cues: { id: string; startMs: number; endMs: number }[]
  portraitFrames?: { startMs: number; endMs: number; width: number; height: number }[]
  detailFrames?: { startMs: number; endMs: number; x: number; y: number; width: number; height: number }[]
}

export const videosRoot = path.resolve(process.cwd(), "videos")
export const outputRoot = path.join(videosRoot, "output")

export async function loadCatalog(): Promise<VideoCatalog> {
  const file = path.join(videosRoot, "catalog.json")
  const catalog = JSON.parse(await readFile(file, "utf8")) as VideoCatalog
  const ids = new Set<string>()
  const manifests = new Set<string>()
  for (const entry of catalog.videos) {
    if (!/^[A-Z][A-Z0-9_]+$/.test(entry.id)) throw new Error(`${file}: invalid semantic id "${entry.id}"`)
    if (!/^[a-z0-9-]+$/.test(entry.manifest)) throw new Error(`${file}: invalid manifest slug "${entry.manifest}"`)
    if (ids.has(entry.id)) throw new Error(`${file}: duplicate id "${entry.id}"`)
    if (manifests.has(entry.manifest)) throw new Error(`${file}: duplicate manifest "${entry.manifest}"`)
    ids.add(entry.id)
    manifests.add(entry.manifest)
  }
  return catalog
}

export async function catalogEntry(reference: string): Promise<VideoCatalogEntry> {
  const catalog = await loadCatalog()
  const entry = catalog.videos.find((video) => video.id === reference || video.manifest === reference)
  if (!entry) throw new Error(`Unknown video id or manifest: ${reference}`)
  return entry
}

export async function loadManifest(reference: string): Promise<VideoManifest> {
  const entry = await catalogEntry(reference)
  const file = path.join(videosRoot, "manifests", `${entry.manifest}.json`)
  const manifest = JSON.parse(await readFile(file, "utf8")) as VideoManifest
  if (manifest.id !== entry.id) throw new Error(`${file}: id must be "${entry.id}"`)
  if (manifest.slug !== entry.manifest) throw new Error(`${file}: slug must be "${entry.manifest}"`)
  if (!manifest.segments.length) throw new Error(`${file}: at least one segment is required`)
  const ids = new Set<string>()
  for (const segment of manifest.segments) {
    if (!segment.id || ids.has(segment.id)) throw new Error(`${file}: segment ids must be non-empty and unique`)
    if (!segment.transcript.trim()) throw new Error(`${file}: ${segment.id} has no transcript`)
    if (segment.fallbackDurationMs < 1_000) throw new Error(`${file}: ${segment.id} fallbackDurationMs is too short`)
    ids.add(segment.id)
  }
  for (const [id, title] of Object.entries(manifest.chapterTitles ?? {})) {
    if (!ids.has(id) || !title.trim()) throw new Error(`${file}: invalid chapter title for ${id}`)
  }
  return manifest
}

export const videoDir = (slug: string) => path.join(outputRoot, slug)
export const audioDir = (slug: string) => path.join(videoDir(slug), "audio")
