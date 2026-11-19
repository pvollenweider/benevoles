// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Recovery logic of the root error page (#1442). The page is rendered without the root layout,
 * so its decisions live here, in a pure module that can be tested without a browser.
 */

import { NETWORK_FAILURE } from "./sentry-scrub"

/** Session key holding the time of the last automatic reload. */
export const AUTO_RELOAD_STORAGE_KEY = "benevoles:global-error:last-reload"

/** Two failures closer than this show the page instead of reloading again. */
export const AUTO_RELOAD_WINDOW_MS = 30_000

/** The part of sessionStorage this module needs (private mode may throw on either call). */
export type RecoveryStorage = Pick<Storage, "getItem" | "setItem">

/**
 * A fetch that never reached the server: Safari « Load failed », Chrome « Failed to fetch »,
 * Firefox « NetworkError when attempting to fetch resource. ». Exactly the messages that
 * Sentry already treats as stackless network failures (NETWORK_FAILURE in sentry-scrub.ts).
 */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError && NETWORK_FAILURE.test(error.message)
}

/**
 * Whether the page may reload itself now, and if so records the moment. At most one automatic
 * reload per 30 s: a second failure inside the window returns false so the visitor sees the
 * French page (and the « Recharger la page » button) instead of an endless reload loop.
 *
 * Returns false when storage is unavailable or throws (private mode), never reloading blindly.
 */
export function shouldAutoReload(storage: RecoveryStorage, now: number): boolean {
  try {
    const stored = storage.getItem(AUTO_RELOAD_STORAGE_KEY)
    const last = stored === null ? Number.NaN : Number(stored)
    // A valid moment in the past, inside the window: already reloaded, show the page. An
    // unreadable or future value (clock change) is treated as stale rather than blocking forever.
    const elapsed = now - last
    if (Number.isFinite(last) && elapsed >= 0 && elapsed < AUTO_RELOAD_WINDOW_MS) return false
    storage.setItem(AUTO_RELOAD_STORAGE_KEY, String(now))
    return true
  } catch {
    return false
  }
}
