// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Cache lifetimes of the files of `public/` (next.config.ts, #773, #759 F3). Next.js serves them
 * with `public, max-age=0` by default: every visit revalidates every screenshot.
 *
 * - `/doc-img/*` with a `?v=` fingerprint (the documentation renders its screenshots that way,
 *   src/lib/doc-images.ts): the URL changes with the content, so the response never goes stale and
 *   is cached for a year, `immutable`.
 * - `/doc-img/*` without one (a link from the README, an old page): a day, then up to a week served
 *   from cache while the browser revalidates, so a new capture shows up within a day or so.
 *
 * `public/sw.js` keeps the default on purpose: a service worker must be revalidated on each visit.
 * HTML pages are not concerned here.
 */
type HeaderRule = {
  source: string
  has?: { type: "query"; key: string }[]
  missing?: { type: "query"; key: string }[]
  headers: { key: string; value: string }[]
}

export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
export const REVALIDATED_CACHE = "public, max-age=86400, stale-while-revalidate=604800"

export const STATIC_CACHE_HEADERS: HeaderRule[] = [
  {
    source: "/doc-img/:file*",
    has: [{ type: "query", key: "v" }],
    headers: [{ key: "Cache-Control", value: IMMUTABLE_CACHE }],
  },
  {
    source: "/doc-img/:file*",
    missing: [{ type: "query", key: "v" }],
    headers: [{ key: "Cache-Control", value: REVALIDATED_CACHE }],
  },
]
