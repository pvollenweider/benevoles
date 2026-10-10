// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { AUDIENCES, LEVELS, THEMES, type ThemeId } from "@/lib/video-catalog"
import { parseCalendarDate } from "@/lib/freshness"

const THEME_IDS = THEMES.map((t) => t.id) as [ThemeId, ...ThemeId[]]

/**
 * Zod schemas of the video library's files (#644), read only by the server-side loader
 * (`src/lib/video-catalog-load.ts`). Kept apart from `src/lib/video-catalog.ts`, which the
 * browser bundles for the gallery filters, so zod stays out of the public pages' JavaScript (#773).
 */

// --- videos/catalog.json ------------------------------------------------------------------

export const catalogEntrySchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]+$/, "identifiant stable invalide"),
  manifest: z.string().regex(/^[a-z0-9-]+$/, "slug de manifeste invalide"),
  category: z.string().min(1),
  tags: z.array(z.string().min(1)),
  published: z.boolean(),
  seedScenario: z.string().optional(),
  // Added for the video library (#644): a video may belong to several themes without being
  // duplicated in the catalogue (#645 principle — one entry, several classifications).
  themes: z.array(z.enum(THEME_IDS)).min(1, "au moins un thème est requis"),
  audience: z.array(z.enum(AUDIENCES)).min(1, "au moins un public est requis"),
  level: z.enum(LEVELS),
  feature: z.string().min(1),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date ISO attendue (AAAA-MM-JJ)"),
  // Prepared for #646 (feedback tied to a precise revision): bumped when a video is fully
  // regenerated, so older feedback never applies to the new render. Not used by any UI yet.
  revision: z.number().int().min(1),
  // « Nouveau » / « Mis à jour » on the video (#763, src/lib/freshness.ts). Explicit, never
  // `updatedAt`, which moves with every render: set when the change is worth pointing out.
  added: z.string().refine((v) => parseCalendarDate(v) !== null, "added : date réelle attendue (AAAA-MM-JJ)").optional(),
  updated: z.string().refine((v) => parseCalendarDate(v) !== null, "updated : date réelle attendue (AAAA-MM-JJ)").optional(),
  new: z.literal(false).optional(),
})
export type VideoCatalogEntry = z.infer<typeof catalogEntrySchema>

export const catalogSchema = z.object({
  defaultLanguage: z.string().min(1),
  videos: z.array(catalogEntrySchema),
})

// --- videos/renders.json --------------------------------------------------------------------

/**
 * What the app knows of a video's render without the render itself (the MP4 never ships with the
 * app): its real duration and frame size, and whether its posters exist. Written by
 * videos/tools/posters.ts from each published render, keyed by manifest slug; a video missing
 * from it simply has no poster and keeps the manifest's estimated duration.
 */
export const renderInfoSchema = z.object({
  durationMs: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** `<slug>.jpg` (the video's own ratio) and `<slug>-og.jpg` (1200 x 630) are published next to the MP4. */
  poster: z.boolean(),
})
export type VideoRender = z.infer<typeof renderInfoSchema>

export const rendersSchema = z.record(z.string(), renderInfoSchema)

// --- videos/manifests/*.json ---------------------------------------------------------------

const segmentSchema = z.object({
  id: z.string().min(1),
  transcript: z.string().min(1),
  style: z.string().optional(),
  fallbackDurationMs: z.number().int().min(1000),
})

/**
 * Viewer-facing content for the detail page (#644 owner feedback): what the video explains to the
 * viewer, written from the narration segments above — never the internal editorial script (the
 * four-part Utilité/Démonstration/Résultat visible/Points d'attention recipe is production
 * material, not shown to viewers any more). `videos/lib/manifest.ts` keeps this field optional at
 * the type level (the generation tools never read or write it); here it's required, every one of
 * the 29 manifests has one.
 */
export const viewerContentSchema = z.object({
  /** 1–2 sentences, "Dans cette vidéo, vous …". */
  summary: z.string().min(1),
  /** 3–7 short imperative steps, in the order shown in the video. */
  steps: z.array(z.string().min(1)).min(3).max(7),
  /** 1–4 key points: limits, what happens next, good practice. */
  remember: z.array(z.string().min(1)).min(1).max(4),
})
export type ViewerContent = z.infer<typeof viewerContentSchema>

export const manifestSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  language: z.string().min(1),
  voice: z.string().min(1),
  voiceStyle: z.string().min(1),
  continuousNarration: z.boolean().optional(),
  viewport: z.object({ width: z.number(), height: z.number(), deviceScaleFactor: z.number() }),
  segments: z.array(segmentSchema).min(1),
  viewer: viewerContentSchema,
})
export type VideoManifest = z.infer<typeof manifestSchema>
