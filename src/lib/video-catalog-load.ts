// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "fs"
import path from "path"
import { catalogSchema, manifestSchema, parseScript, rendersSchema, type Audience, type ThemeId, type Video } from "@/lib/video-catalog"

/**
 * Video library (#644), server-only: reads `videos/catalog.json`, the per-video manifests and
 * editorial scripts from the repository (never a second list — #645's "one catalogue" principle).
 * `videos/` is excluded from the Docker image (.dockerignore) except these paths, which the
 * Dockerfile copies explicitly, the same way GUIDE_ADMIN.md etc. are (src/lib/public-content.ts).
 *
 * Kept apart from src/lib/video-catalog.ts (the `fs` import breaks the client bundle of
 * VideoGallery.tsx otherwise — see that file's top comment); only server components
 * (src/app/videos/*) and tests import this one.
 */

export const videosRoot = path.join(process.cwd(), "videos")

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

/**
 * Loads and validates the whole catalogue from disk. Throws on the first inconsistency (unknown
 * theme, id mismatch between catalog.json and its manifest, missing script file...): a broken
 * catalogue must fail the build, not render a partial gallery.
 */
export function loadVideoCatalog(): Video[] {
  const catalog = catalogSchema.parse(readJson(path.join(videosRoot, "catalog.json")))
  // Measured renders (videos/tools/posters.ts): optional file, shipped in the image like catalog.json.
  const rendersFile = path.join(videosRoot, "renders.json")
  const renders = fs.existsSync(rendersFile) ? rendersSchema.parse(readJson(rendersFile)) : {}

  const ids = new Set<string>()
  const manifestSlugs = new Set<string>()

  return catalog.videos.map((entry): Video => {
    if (ids.has(entry.id)) throw new Error(`videos/catalog.json: duplicate id "${entry.id}"`)
    ids.add(entry.id)
    if (manifestSlugs.has(entry.manifest)) throw new Error(`videos/catalog.json: duplicate manifest "${entry.manifest}"`)
    manifestSlugs.add(entry.manifest)

    const manifestFile = path.join(videosRoot, "manifests", `${entry.manifest}.json`)
    const manifest = manifestSchema.parse(readJson(manifestFile))
    if (manifest.id !== entry.id) throw new Error(`${manifestFile}: id must be "${entry.id}"`)
    if (manifest.slug !== entry.manifest) throw new Error(`${manifestFile}: slug must be "${entry.manifest}"`)

    const scriptFile = path.join(videosRoot, "scripts", `${entry.manifest}.md`)
    const script = parseScript(fs.readFileSync(scriptFile, "utf8"))
    if (script.stableId && script.stableId !== entry.id) {
      throw new Error(`${scriptFile}: script's stable id "${script.stableId}" differs from catalogue id "${entry.id}"`)
    }

    // The real duration, best source first: the MP4 measured by videos/tools/posters.ts
    // (videos/renders.json, in the image); else the narration's audio metadata
    // (videos/output/<slug>/audio-metadata.json, in a checkout only, never in the image); else the
    // sum of the manifest's fallback durations.
    const render = renders[entry.manifest]
    let durationMs = manifest.segments.reduce((sum, s) => sum + s.fallbackDurationMs, 0)
    const audioMetadataFile = path.join(videosRoot, "output", entry.manifest, "audio-metadata.json")
    if (render) {
      durationMs = render.durationMs
    } else if (fs.existsSync(audioMetadataFile)) {
      try {
        const audio = readJson(audioMetadataFile) as { segments?: Record<string, { durationMs: number }> }
        if (audio.segments) {
          const sum = manifest.segments.reduce((total, s) => total + (audio.segments?.[s.id]?.durationMs ?? s.fallbackDurationMs), 0)
          if (sum > 0) durationMs = sum
        }
      } catch {
        // Keep the manifest-estimated duration if the file exists but isn't the expected shape.
      }
    }

    return {
      id: entry.id,
      slug: entry.manifest,
      title: manifest.title,
      description: manifest.description,
      category: entry.category,
      tags: entry.tags,
      published: entry.published,
      themes: entry.themes as ThemeId[],
      audience: entry.audience as Audience[],
      level: entry.level,
      feature: entry.feature,
      updatedAt: entry.updatedAt,
      revision: entry.revision,
      durationMs,
      manifest,
      script,
      ...(render ? { render } : {}),
    }
  })
}
