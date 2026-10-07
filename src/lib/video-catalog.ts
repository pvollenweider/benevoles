// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"

/**
 * Video library (#644): types, Zod schemas and pure helpers (filtering, search, formatting). No
 * `fs`/`path` import on purpose — this module is bundled for the client too (VideoGallery.tsx's
 * filters run in the browser), and a `node:fs` import breaks that build (same reason there's no
 * Prisma import in a shared `src/lib` module, see CLAUDE.md). The fs-reading loader lives in
 * `src/lib/video-catalog-load.ts` (server-only), which imports the schemas from here.
 */

// The nine themes of the masterclass carousel (videos/MASTERCLASS_PLAN.md, "Organisation du
// carrousel"). Only the themes that already have a video are reachable from the gallery filters
// (computed from the loaded catalogue), but the full registry keeps every video's theme label
// stable as new themes are recorded.
export const THEMES = [
  { id: "decouvrir-administration", order: 1, label: "Découvrir et prendre en main l'administration" },
  { id: "organisation-equipe", order: 2, label: "Configurer l'organisation et son équipe" },
  { id: "evenement-cycle-de-vie", order: 3, label: "Créer et faire vivre un événement" },
  { id: "planning-creneaux", order: 4, label: "Construire un planning précis" },
  { id: "parcours-benevole", order: 5, label: "Le parcours complet du bénévole" },
  { id: "membres-invitations", order: 6, label: "Membres, invitations et responsabilités" },
  { id: "inscriptions-communication", order: 7, label: "Suivre les inscriptions et communiquer" },
  { id: "jour-j", order: 8, label: "Préparer et vivre le jour J" },
  { id: "tracabilite-donnees", order: 9, label: "Traçabilité, données et administration avancée" },
] as const

export type ThemeId = (typeof THEMES)[number]["id"]
const THEME_IDS = THEMES.map((t) => t.id) as [ThemeId, ...ThemeId[]]

export function themeLabel(id: ThemeId): string {
  return THEMES.find((t) => t.id === id)?.label ?? id
}

export const AUDIENCES = ["organisateur", "benevole", "super-admin"] as const
export type Audience = (typeof AUDIENCES)[number]

export const AUDIENCE_LABELS: Record<Audience, string> = {
  organisateur: "Organisateur",
  benevole: "Bénévole",
  "super-admin": "Super admin",
}

export const LEVELS = ["decouverte", "essentiel", "avance"] as const
export type Level = (typeof LEVELS)[number]

export const LEVEL_LABELS: Record<Level, string> = {
  decouverte: "Découverte",
  essentiel: "Essentiel",
  avance: "Avancé",
}

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

// --- videos/scripts/*.md -------------------------------------------------------------------

export type VideoScriptSection = { heading: string; body: string }

export type VideoScript = {
  title: string
  /** `**Identifiant stable :** \`ID\`` line, when the script carries one. */
  stableId: string | null
  /** Every `## ` section, in file order, so a script that doesn't follow the four-part recipe still parses. */
  sections: VideoScriptSection[]
  utilite: string | null
  demonstration: string | null
  resultatVisible: string | null
  pointsAttention: string | null
}

function normalizeHeading(heading: string): string {
  return heading
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "'")
    .trim()
    .toLowerCase()
}

/**
 * Parses an editorial script (videos/scripts/<slug>.md). Most scripts follow the masterclass's
 * four-part recipe (Utilité / Démonstration / Résultat visible / Points d'attention,
 * videos/MASTERCLASS_PLAN.md "Contrat de couverture"); five earlier scripts predate that recipe
 * and use their own headings (Objectif, Ton, Découpage...). Both parse: `sections` always holds
 * every `## ` block, and the four canonical fields are `null` when the script doesn't have them —
 * the detail page falls back to rendering `sections` generically in that case.
 */
export function parseScript(raw: string): VideoScript {
  const titleMatch = raw.match(/^# (.+)$/m)
  const title = titleMatch ? titleMatch[1].trim() : "Sans titre"
  const stableIdMatch = raw.match(/Identifiant stable\s*:\*\*\s*`([A-Z0-9_]+)`/)

  const headingRe = /^## (.+)$/gm
  const matches = [...raw.matchAll(headingRe)]
  const sections: VideoScriptSection[] = matches.map((match, index) => {
    const start = match.index! + match[0].length
    const end = index + 1 < matches.length ? matches[index + 1].index! : raw.length
    return { heading: match[1].trim(), body: raw.slice(start, end).trim() }
  })

  const find = (...names: string[]): string | null => {
    const wanted = names.map(normalizeHeading)
    return sections.find((s) => wanted.includes(normalizeHeading(s.heading)))?.body ?? null
  }

  return {
    title,
    stableId: stableIdMatch ? stableIdMatch[1] : null,
    sections,
    utilite: find("Utilité"),
    demonstration: find("Démonstration"),
    resultatVisible: find("Résultat visible"),
    pointsAttention: find("Points d'attention"),
  }
}

// --- the assembled catalogue -----------------------------------------------------------------

export type Video = {
  id: string
  slug: string
  title: string
  description: string
  category: string
  tags: string[]
  published: boolean
  themes: ThemeId[]
  audience: Audience[]
  level: Level
  feature: string
  updatedAt: string
  revision: number
  /** Sum of the manifest segments' `fallbackDurationMs` — no render exists yet to measure the real audio (videos/lib/manifest.ts `AudioMetadata`, read instead when present, see `loadVideoCatalog`). */
  durationMs: number
  manifest: VideoManifest
  script: VideoScript
  /** From videos/renders.json, when the render was measured there (see `renderInfoSchema`). */
  render?: VideoRender
}

// --- pure helpers (testable without fs) -------------------------------------------------------

/**
 * What the gallery (/videos, a client component) needs of a video: its card and the fields the
 * filters and the search read (#644). Everything else of the catalogue entry, the manifest's
 * narration segments and the editorial script, stays on the server: sent whole, it was most of a
 * 820 KB page (#759).
 */
export type GalleryVideo = Pick<Video, "id" | "title" | "description" | "feature" | "tags" | "themes" | "audience" | "level" | "published" | "durationMs"> & {
  manifest: { viewer: Pick<ViewerContent, "summary" | "steps"> }
}

export function toGalleryVideo(video: Video): GalleryVideo {
  const { id, title, description, feature, tags, themes, audience, level, published, durationMs } = video
  const { summary, steps } = video.manifest.viewer
  return { id, title, description, feature, tags, themes, audience, level, published, durationMs, manifest: { viewer: { summary, steps } } }
}

/**
 * Whether the gallery shows every catalogued video or only the published ones. Videos with a render
 * online are `published: true` (owner decision, 2026-10-06); the others show « À venir ». The
 * gallery still lists all of them, with their state, and stays unlinked (#644). Flipping this one constant is the whole migration to the public
 * version — `filterPublishedVideos` itself never changes.
 */
export const VIDEO_LIBRARY_PUBLIC_ONLY = false

export function filterPublishedVideos<T extends { published: boolean }>(videos: T[], publicOnly: boolean = VIDEO_LIBRARY_PUBLIC_ONLY): T[] {
  return publicOnly ? videos.filter((v) => v.published) : videos
}

function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

/**
 * Free-text search over title, description, tags, and the viewer-facing summary and steps (#644).
 * Dropped the internal editorial script from the index when it stopped being shown on the detail
 * page: it was never meant for viewers, so it shouldn't surface them into search results either.
 */
export function searchVideos<T extends GalleryVideo>(videos: T[], query: string): T[] {
  const q = normalizeSearch(query.trim())
  if (!q) return videos
  return videos.filter((v) => {
    const viewerText = [v.manifest.viewer.summary, ...v.manifest.viewer.steps].join(" ")
    const haystack = normalizeSearch([v.title, v.description, v.feature, ...v.tags, viewerText].join(" "))
    return haystack.includes(q)
  })
}

export type VideoFilters = {
  theme?: ThemeId | null
  audience?: Audience | null
  level?: Level | null
  tag?: string | null
  query?: string
}

/** Applies the gallery's theme, audience, level, tag and free-text filters together (AND, each optional). */
export function applyVideoFilters<T extends GalleryVideo>(videos: T[], filters: VideoFilters): T[] {
  let result = videos
  if (filters.theme) result = result.filter((v) => v.themes.includes(filters.theme!))
  if (filters.audience) result = result.filter((v) => v.audience.includes(filters.audience!))
  if (filters.level) result = result.filter((v) => v.level === filters.level)
  if (filters.tag) result = result.filter((v) => v.tags.includes(filters.tag!))
  if (filters.query) result = searchVideos(result, filters.query)
  return result
}

/** The themes actually used by at least one video, in carousel order — what the filter form offers. */
export function themesInUse(videos: GalleryVideo[]): { id: ThemeId; label: string }[] {
  const used = new Set(videos.flatMap((v) => v.themes))
  return THEMES.filter((t) => used.has(t.id)).map((t) => ({ id: t.id, label: t.label }))
}

/** The levels actually used by at least one video, in the fixed `LEVELS` order (progression). */
export function levelsInUse(videos: GalleryVideo[]): Level[] {
  const used = new Set(videos.map((v) => v.level))
  return LEVELS.filter((l) => used.has(l))
}

/** The tags actually used by at least one video, alphabetically. */
export function tagsInUse(videos: GalleryVideo[]): string[] {
  return [...new Set(videos.flatMap((v) => v.tags))].sort((a, b) => a.localeCompare(b, "fr"))
}

/** The audiences actually used by at least one video, in the fixed `AUDIENCES` order. */
export function audiencesInUse(videos: GalleryVideo[]): Audience[] {
  const used = new Set(videos.flatMap((v) => v.audience))
  return AUDIENCES.filter((a) => used.has(a))
}

/** "6 min", "1 h 20" — the gallery card and detail page duration. */
export function formatDuration(durationMs: number): string {
  const totalMinutes = Math.max(1, Math.round(durationMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} h`
  return `${hours} h ${String(minutes).padStart(2, "0")}`
}

export type VideoMediaUrls = {
  video: string
  captions: string
  transcript: string
  /** Only when the render's posters were generated (`render.poster`): never a broken image. */
  poster?: string
  /** The 1200 x 630 link preview, same condition. */
  ogImage?: string
}

/**
 * Builds the media URLs for a video from `VIDEO_MEDIA_BASE_URL` (#644 owner decision): without
 * the env var, `null` — the detail page then shows "Vidéo bientôt disponible" without any network
 * probe. With it set, URLs are always built (no per-video `rendered` flag — see videos/README.md
 * for why); if a specific render is actually missing, the player's own `onError` falls back to the
 * same message client-side, which still never probes the network at request/render time.
 */
export function videoMediaUrls(slug: string, baseUrl: string | undefined | null, render?: Pick<VideoRender, "poster"> | null): VideoMediaUrls | null {
  if (!baseUrl || !baseUrl.trim()) return null
  const base = baseUrl.trim().replace(/\/+$/, "")
  return {
    video: `${base}/${slug}/${slug}.mp4`,
    captions: `${base}/${slug}/${slug}.vtt`,
    transcript: `${base}/${slug}/${slug}.txt`,
    ...(render?.poster ? { poster: `${base}/${slug}/${slug}.jpg`, ogImage: `${base}/${slug}/${slug}-og.jpg` } : {}),
  }
}

/** Related videos: other published-or-not videos sharing at least one theme, closest first. */
export function relatedVideos(video: Video, catalog: Video[], limit = 4): Video[] {
  return catalog
    .filter((v) => v.id !== video.id)
    .map((v) => ({ v, shared: v.themes.filter((t) => video.themes.includes(t)).length }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.v.title.localeCompare(b.v.title, "fr"))
    .slice(0, limit)
    .map((x) => x.v)
}

// --- #645: reference a video from the documentation by its stable id ---------------------------

const DOC_VIDEO_REFERENCE_RE = /^video:\s*([A-Z][A-Z0-9_]+)\s*$/

/** Parses a `video: ORG_CREATE` reference token, the inside of a guide's `<!-- video: ORG_CREATE -->` line (#645, src/lib/doc-video-references.ts). */
export function parseVideoReference(token: string): string | null {
  const match = token.trim().match(DOC_VIDEO_REFERENCE_RE)
  return match ? match[1] : null
}

/** Resolves a parsed reference against the loaded catalogue; `null` when the id doesn't exist (dead reference). */
export function resolveVideoReference(id: string, catalog: Video[]): Video | null {
  return catalog.find((v) => v.id === id) ?? null
}
