// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A path with repeated slashes (`//events`, `/admin//events`) is redirected to its clean form
 * (#474). The client router reads `//events` as a URL on the host « events » and crashes the page
 * with a SecurityError from history.replaceState (seen in production).
 *
 * The server can't do it: Next.js normalizes the path before the proxy sees it, and still serves
 * the page at the original address. So the redirect runs in the browser, first thing in <head>,
 * before the router starts: CLEAN_PATH_SCRIPT, inlined by the root layout.
 */

/** The clean path, or null when the path is already clean. */
export function cleanPath(pathname: string): string | null {
  if (!pathname.includes("//")) return null
  const clean = pathname.replace(/\/{2,}/g, "/")
  return clean === pathname ? null : clean
}

/** Same rule as cleanPath, as a standalone script: replaces the address, query and hash kept. */
export const CLEAN_PATH_SCRIPT =
  "(function(){var l=window.location,p=l.pathname;if(p.indexOf('//')!==-1){l.replace(p.replace(/\\/{2,}/g,'/')+l.search+l.hash)}})()"
