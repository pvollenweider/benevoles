// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Web Push services a browser subscription may point to (#1041). The server POSTs to the stored
 * endpoint, so only the real push services of the browsers are accepted:
 * - Chrome, Opera, Brave, Samsung Internet: Firebase Cloud Messaging (fcm.googleapis.com);
 * - Firefox: Mozilla autopush (updates.push.services.mozilla.com);
 * - Edge: Windows Push Notification Services (*.notify.windows.com);
 * - Safari (macOS 13+, iOS 16.4+): Apple, which documents *.push.apple.com (web.push.apple.com
 *   in practice) as the range to allow.
 * The legacy GCM host (android.googleapis.com) is shut down and not accepted.
 */
const EXACT_HOSTS = new Set(["fcm.googleapis.com"])
const SUFFIX_HOSTS = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"]

/**
 * Whether a push subscription endpoint may be stored and sent to: https on the default port, no
 * credentials, and a host of a known Web Push service. Anything unparsable is refused.
 */
export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== "https:") return false
  if (url.username || url.password) return false
  // URL normalises ":443" to "" for https, so any port left is a non-default one.
  if (url.port !== "") return false
  const host = url.hostname.toLowerCase()
  if (EXACT_HOSTS.has(host)) return true
  return SUFFIX_HOSTS.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)
}
