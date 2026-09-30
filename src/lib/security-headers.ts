// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Response headers set on every page and route (next.config.ts).
 *
 * Referrer-Policy: strict-origin. A personal link (/my/<token>, an invitation's token query) is
 * an authentication secret (#485). With the browsers' default policy, every request made from
 * such a page (its scripts, styles, API calls, a link followed to another site) would carry the
 * full URL in the Referer header, and so the token, into access logs and third parties.
 * strict-origin sends the origin only (https://org.benevol.app), never the path or the query,
 * and nothing over plain HTTP. The app itself never reads the Referer.
 */
export const SECURITY_HEADERS = [{ key: "Referrer-Policy", value: "strict-origin" }] as const
