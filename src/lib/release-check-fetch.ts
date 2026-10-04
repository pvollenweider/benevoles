// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * GitHub call for the release check (#612), isolated so the cron route can mock it in tests.
 * No token: the public releases API. `/releases/latest` already excludes drafts and
 * prereleases, but the `prerelease`/`draft` flags are checked again defensively.
 */

const RELEASES_URL = "https://api.github.com/repos/pvollenweider/benevoles/releases/latest"
const TIMEOUT_MS = 5000

export type LatestRelease = { version: string; url: string }

/**
 * Null on any failure (network, non-200, malformed body, timeout) or when the latest release
 * turns out to be a draft/prerelease. Never throws — the caller logs and moves on.
 */
export async function fetchLatestRelease(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(RELEASES_URL, {
      headers: { "User-Agent": "benevoles-release-check", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (!data || typeof data !== "object") return null
    const { tag_name, html_url, draft, prerelease } = data as Record<string, unknown>
    if (draft || prerelease) return null
    if (typeof tag_name !== "string" || typeof html_url !== "string") return null
    return { version: tag_name, url: html_url }
  } catch (e) {
    console.warn("release-check: GitHub request failed:", e instanceof Error ? e.message : e)
    return null
  }
}
