// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { sessionCookieOverride } from "./session-lifetime"

/**
 * The cookie holding the organisation a super admin picked: its name and Secure flag, the same for
 * every writer and reader. Over https (the condition the session cookie follows,
 * `sessionCookieOverride`), a `__Host-` cookie: Secure, Path=/, no Domain, so no subdomain can set
 * or replace it. Over plain http (local, tests) the plain name, which a browser accepts there.
 * A production build served over http keeps the Secure flag it always had.
 */
export function superAdminOrgCookie(env: Record<string, string | undefined> = process.env): { name: string; secure: boolean } {
  const hostPrefixed = sessionCookieOverride(env) !== undefined
  return { name: hostPrefixed ? "__Host-sa-org-id" : "sa-org-id", secure: hostPrefixed || env.NODE_ENV === "production" }
}
