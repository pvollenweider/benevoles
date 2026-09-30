// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A path with repeated slashes (`//events`, `/admin//events`) is redirected to its clean form.
 * The client router reads `//events` as a URL on the host « events » and crashes the page with a
 * SecurityError from history.replaceState (seen in production). Pure.
 *
 * Returns the clean path, or null when the path is already clean.
 */
export function cleanPath(pathname: string): string | null {
  if (!pathname.includes("//")) return null
  const clean = pathname.replace(/\/{2,}/g, "/")
  return clean === pathname ? null : clean
}
