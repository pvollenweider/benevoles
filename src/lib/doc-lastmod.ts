// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The apex sitemap's lastmod per source file, from doc-lastmod.json (written at deploy by
 * scripts/doc-lastmod.mjs from `git log`; the files' mtime in the image is only the build time).
 * Turns the parsed JSON into the `modifiedAt` lookup of apexSitemap (src/lib/doc-pages.ts): a
 * missing file, a malformed content, an unknown source or an invalid date gives null, so the
 * entry has no lastmod rather than a wrong one.
 */
export function docLastmodLookup(json: unknown): (source: string) => Date | null {
  const map = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {}
  return (source) => {
    if (!Object.hasOwn(map, source)) return null
    const value = map[source]
    if (typeof value !== "string") return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
}
