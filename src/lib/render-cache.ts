// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A per-process memo of what the public content pages render from the repository's own files
 * (#773): the guides, the documentation units, FEATURES.md, CHANGELOG.md. Those files are in the
 * image and never change while the server runs, but the pages are rendered per request (their URLs
 * and video links come from the running container's environment): parsing and sanitising the same
 * Markdown on every visit cost up to 2 to 3 s of server time on /doc/admin, which renders every unit
 * to find its heading ids, and over 1 s on /nouveautes (the whole CHANGELOG).
 *
 * Active in production only: development renders again on each request, so an edited file shows up
 * (the same rule as loadDocUnits and the video catalogue). The key must hold every input of the
 * computation besides the files themselves, such as VIDEO_MEDIA_BASE_URL; the keys come from the
 * repository (file names, unit slugs) and that one setting, never from the request, so the memo
 * stays small.
 */
export function createRenderCache<V>(enabled: () => boolean = () => process.env.NODE_ENV === "production") {
  const entries = new Map<string, V>()
  return function cached(key: string, compute: () => V): V {
    if (!enabled()) return compute()
    if (entries.has(key)) return entries.get(key) as V
    const value = compute()
    entries.set(key, value)
    return value
  }
}
