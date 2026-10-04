// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure logic of the self-hosted release check (#612): does the instance's version lag the
 * latest published GitHub release, should the super admin be emailed about it, and should the
 * banner still show. No fetch, no Prisma, no `env` (so this module stays safe to import from a
 * client component without pulling in server-only env validation) — see
 * `src/lib/release-check-fetch.ts` for the GitHub call, `releaseCheckEnabled()` in `src/lib/env.ts`
 * for the on/off flag, and `src/app/api/cron/release-check/route.ts` for the cron route that
 * wires it all together.
 */

export type ParsedVersion = { major: number; minor: number; patch: number }

/** Tolerant of a leading "v" ("v2.1.0"); null on anything that isn't `major.minor.patch`. */
export function parseVersion(raw: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim())
  if (!match) return null
  const [, major, minor, patch] = match
  return { major: Number(major), minor: Number(minor), patch: Number(patch) }
}

/** -1 if a < b, 0 if equal, 1 if a > b. */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return 0
}

/** True only when `candidate` parses, `current` parses, and candidate is strictly newer. */
export function isNewerVersion(candidate: string | null | undefined, current: string): boolean {
  if (!candidate) return false
  const c = parseVersion(candidate)
  const cur = parseVersion(current)
  if (!c || !cur) return false
  return compareVersions(c, cur) > 0
}

export type ShouldNotifyInput = {
  currentVersion: string
  latestVersion: string | null
  /** A prerelease or draft is never notified, even if it slipped through. */
  prerelease?: boolean
  lastNotifiedVersion: string | null
}

/** Once per new version: not for a prerelease, a malformed tag, an older/equal version, or a version already notified. */
export function shouldNotify(input: ShouldNotifyInput): boolean {
  if (input.prerelease) return false
  if (!isNewerVersion(input.latestVersion, input.currentVersion)) return false
  if (input.latestVersion === input.lastNotifiedVersion) return false
  return true
}

export type ShouldShowBannerInput = {
  currentVersion: string
  latestVersion: string | null
  /** The version this super admin last dismissed, if any. */
  dismissedVersion: string | null
}

/** Shown only for a newer, well-formed version, and not the one this super admin already dismissed. */
export function shouldShowBanner(input: ShouldShowBannerInput): boolean {
  if (!isNewerVersion(input.latestVersion, input.currentVersion)) return false
  if (input.latestVersion === input.dismissedVersion) return false
  return true
}
