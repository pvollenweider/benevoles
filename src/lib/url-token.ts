// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The emailed one-time links of the back office (password reset, invitation, keep or reactivate a
 * space) carry their token in the query string. Once the page has read it, it is removed from the
 * address bar (#1042): it no longer shows in the browser history, a screen share, or what a
 * telemetry script reads from `location`. Reloading the page then needs the emailed link again.
 */

/** The same address without its `token` parameter (path, rest of the query, hash), or null if it has none. */
export function addressWithoutToken(href: string): string | null {
  let url: URL
  try {
    url = new URL(href, "http://localhost")
  } catch {
    return null
  }
  if (!url.searchParams.has("token")) return null
  url.searchParams.delete("token")
  return `${url.pathname}${url.search}${url.hash}`
}

type HistoryWindow = { location: Pick<Location, "href">; history: Pick<History, "replaceState"> }

/** Replaces the current history entry with the address minus its token (the Next router follows). */
export function stripTokenFromAddressBar(win: HistoryWindow): void {
  const next = addressWithoutToken(win.location.href)
  if (next !== null) win.history.replaceState(null, "", next)
}
