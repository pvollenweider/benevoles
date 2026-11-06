// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "node:fs"
import path from "node:path"
import type { Metadata } from "next"
import { z } from "zod"
import { parseFrontMatter } from "@/lib/doc-units"
import { OG_IMAGE_ALT } from "@/lib/landing-seo"
import { seoMetadata } from "@/lib/seo-metadata"
import { parseCalendarDate } from "@/lib/freshness"
import { META_DESCRIPTION_MAX, META_DESCRIPTION_MIN, auditedLength } from "@/lib/meta-length"

/**
 * The practical guides (#1258): methods for organisers that also work without software, at
 * /ressources, one Markdown file per guide in `content/ressources/`, named `<slug>.md` and rendered at
 * `/ressources/<slug>`. Each file opens with a small flat front matter (the parser of the
 * documentation units, src/lib/doc-units.ts):
 *
 *     ---
 *     title: Un bénévole se désiste la veille : que faire
 *     summary: One or two sentences of 70 to 160 characters, also the meta description.
 *     updated: 2026-11-06
 *     order: 1
 *     ---
 *
 * `updated` is the day the guide was last checked (the editorial charter on /ressources promises a
 * visible date); `order` ranks the guides on the index, most useful first. The body follows,
 * without a « # » title. The parser and the checks are pure; only `readRessources` and
 * `loadRessources` touch the disk (server side).
 */

/** The folder of the guides, at the repo root. */
export const RESSOURCES_DIR = "content/ressources"

/** The index of the guides, declared in src/lib/doc-pages.ts. */
export const RESSOURCES_PATH = "/ressources"

const FILE_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/

/** Separators the copy never uses (read aloud as noise, or not at all), as in the documentation. */
const FORBIDDEN_SEPARATORS = /[·—]/

export const ressourceFrontMatterSchema = z.strictObject({
  title: z.string().min(1, "title: required").refine((s) => !FORBIDDEN_SEPARATORS.test(s), "title: no « · » or em dash"),
  summary: z
    .string()
    .min(META_DESCRIPTION_MIN, `summary: at least ${META_DESCRIPTION_MIN} characters`)
    .max(META_DESCRIPTION_MAX, `summary: at most ${META_DESCRIPTION_MAX} characters`)
    // As SEO audit tools count it (src/lib/meta-length.ts): an apostrophe or an accent costs more than one.
    .refine((s) => auditedLength(s) <= META_DESCRIPTION_MAX, `summary: at most ${META_DESCRIPTION_MAX} as audited (an apostrophe counts 6, an accent 2)`)
    .refine((s) => !FORBIDDEN_SEPARATORS.test(s), "summary: no « · » or em dash"),
  updated: z.string().refine((v) => parseCalendarDate(v) !== null, "updated: a real date, YYYY-MM-DD"),
  order: z.string().regex(/^[1-9]\d{0,2}$/, "order: a whole number from 1 to 999"),
})

export type Ressource = {
  slug: string
  title: string
  summary: string
  /** YYYY-MM-DD, the day the guide was last checked. */
  updated: string
  /** Rank on the index, most useful first. */
  order: number
  /** The Markdown after the front matter. */
  body: string
  /** Path of the source from the repo root, e.g. `content/ressources/x.md`. */
  source: string
}

/** One guide from its file name and content; throws with the file name on any error. */
export function parseRessource(fileName: string, source: string): Ressource {
  const fail = (message: string): never => {
    throw new Error(`${RESSOURCES_DIR}/${fileName}: ${message}`)
  }
  const name = FILE_RE.exec(fileName)
  if (!name) return fail("file name: slug.md, in lower case letters, digits and hyphens")
  let parsed: ReturnType<typeof parseFrontMatter>
  try {
    parsed = parseFrontMatter(source)
  } catch (error) {
    return fail((error as Error).message)
  }
  const result = ressourceFrontMatterSchema.safeParse(parsed.data)
  if (!result.success) return fail(result.error.issues.map((i) => `${i.path.join(".") || "front matter"}: ${i.message}`).join("; "))
  const data = result.data
  const body = parsed.body.replace(/^\n+/, "")
  if (/^# /m.test(body)) fail("no « # » title in the body: the page renders the title as its <h1>")
  if (body.trim() === "") fail("the guide has no text")
  return { slug: name[1], title: data.title, summary: data.summary, updated: data.updated, order: Number(data.order), body, source: `${RESSOURCES_DIR}/${fileName}` }
}

/** The problems of a set of guides (empty when all is well): a slug, a title, a summary or an order used twice. */
export function ressourcesProblems(guides: readonly Ressource[]): string[] {
  const problems: string[] = []
  const seen = { slug: new Map<string, string>(), title: new Map<string, string>(), summary: new Map<string, string>(), order: new Map<string, string>() }
  for (const guide of guides) {
    for (const key of ["slug", "title", "summary", "order"] as const) {
      const value = String(guide[key])
      const owner = seen[key].get(value)
      if (owner) problems.push(`${guide.source}: same ${key} as ${owner}`)
      seen[key].set(value, guide.source)
    }
  }
  return problems
}

/** Most useful first (`order`), so the index never depends on the disk. */
export function sortRessources(guides: readonly Ressource[]): Ressource[] {
  return [...guides].sort((a, b) => a.order - b.order)
}

/** Reads, parses and checks every guide of `content/ressources/` (server only); throws on the first broken file or any problem. */
export function readRessources(dir: string = path.join(/*turbopackIgnore: true*/ process.cwd(), RESSOURCES_DIR)): Ressource[] {
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"))
  const guides = files.map((f) => parseRessource(f, fs.readFileSync(path.join(dir, f), "utf-8")))
  const problems = ressourcesProblems(guides)
  if (problems.length > 0) throw new Error(`guides:\n${problems.join("\n")}`)
  return sortRessources(guides)
}

// The guides don't change while the server runs (they're in the image): production reads them
// once; development reads them again on each request, so editing a guide shows up.
let cached: Ressource[] | null = null
export function loadRessources(): Ressource[] {
  if (process.env.NODE_ENV !== "production") return readRessources()
  cached ??= readRessources()
  return cached
}

/** The guide at `/ressources/<slug>`, or null. */
export function findRessource(slug: string, guides: readonly Ressource[]): Ressource | null {
  return guides.find((g) => g.slug === slug) ?? null
}

/** Encoded although slugs are already [a-z0-9-]: the href never carries raw file-name text. */
export function ressourcePath(guide: Pick<Ressource, "slug">): string {
  return `${RESSOURCES_PATH}/${encodeURIComponent(guide.slug)}`
}

/** The date of the most recently checked guide, for the index's last change in the sitemap. */
export function latestUpdate(guides: readonly Pick<Ressource, "updated">[]): string | null {
  return guides.reduce<string | null>((latest, g) => (latest === null || g.updated > latest ? g.updated : latest), null)
}

/** A guide's metadata: an article modified the day it was last checked, on the apex host. */
export function ressourceMetadata(guide: Ressource, base: string): Metadata {
  return seoMetadata({
    base,
    path: ressourcePath(guide),
    title: guide.title,
    description: guide.summary,
    type: "article",
    section: "Ressources",
    modifiedTime: parseCalendarDate(guide.updated),
    imagePath: "/og-image.png",
    imageAlt: OG_IMAGE_ALT,
  })
}
