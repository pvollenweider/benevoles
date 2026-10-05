// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"

/**
 * Stable anchors for the headings of the public content pages (#568): the slug of the heading's
 * text, so a link such as /doc/admin#configurer-les-creneaux keeps working as long as the heading
 * keeps its wording. Plain ASCII (accents dropped, « œ » spelled out) so the URL reads the same
 * everywhere it is pasted. Pure, shared by the renderer and the tests.
 */
/** Removes markup until none is left, so a nested or split tag can't survive one pass. */
function stripTags(text: string): string {
  let previous: string
  let current = text
  do {
    previous = current
    current = current.replace(/<[^>]*>/g, "")
  } while (current !== previous)
  return current.replace(/[<>]/g, "")
}

export function slugifyHeading(text: string): string {
  return stripTags(text)
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/œ/g, "oe").replace(/Œ/g, "oe").replace(/æ/g, "ae").replace(/Æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Ids the page frame already uses around the rendered Markdown (ContentShell's `<main>`, target
 * of the skip link): a heading never takes one, it gets the « -2 » suffix instead.
 */
export const RESERVED_HEADING_IDS: readonly string[] = [MAIN_CONTENT_ID]

/**
 * One slugger per rendered page: a second heading with the same text gets « -2 », then « -3 »,
 * so anchors stay unique within the page, and a reserved id is skipped the same way. A heading
 * without any letter or digit gets « section ».
 */
export function createHeadingSlugger(reserved: readonly string[] = RESERVED_HEADING_IDS): (text: string) => string {
  const used = new Set<string>(reserved)
  return (text) => {
    const base = slugifyHeading(text) || "section"
    let slug = base
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`
    used.add(slug)
    return slug
  }
}
