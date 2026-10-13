// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { EMBED_PARAM, isEmbedMode } from "./embed"

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

/**
 * Framing (#948). No page may be shown inside another site's frame (clickjacking: a hidden
 * frame over a decoy button), except the embeddable sign-up, `/<event>?embed=1` and its
 * confirmation `/<event>/success?embed=1`, which an association puts on its own site, whatever
 * that site's address. Set by the proxy (src/proxy.ts) on every response it lets through, so the
 * decision can read the query: next.config.ts headers cannot drop one per request.
 *
 * - Everything else: `frame-ancestors 'none'` and its older equivalent `X-Frame-Options: DENY`
 *   (browsers without CSP level 2). Admin, super admin, personal and leader pages, sign-in,
 *   waitlist confirmation, API, the site's own pages.
 * - The embeddable sign-up: `frame-ancestors *` (any http/https site) and no X-Frame-Options,
 *   which would forbid it again in the browsers that read it. The policy carries no other
 *   directive: the app sets no other CSP anywhere, so nothing else changes for the embed.
 */
export const FRAME_DENY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
] as const

export const FRAME_EMBED_HEADERS = [{ key: "Content-Security-Policy", value: "frame-ancestors *" }] as const

/**
 * The first path segments the app answers itself (src/app and the Sentry tunnel): an event slug
 * can never take them, so `/admin?embed=1` is the admin and stays unframable. Kept in step with
 * src/app by src/lib/__tests__/security-headers.test.ts. Names with a dot (robots.txt, llms.txt…)
 * are not event slugs anyway.
 */
export const APP_TOP_LEVEL_SEGMENTS: readonly string[] = [
  "accessibilite",
  "admin",
  "api",
  "blog",
  "doc",
  "fonctionnalites",
  "inscription",
  "leader",
  "legal",
  "logiciel-planning-benevoles",
  "monitoring",
  "my",
  "nouveautes",
  "product-updates",
  "super-admin",
  "videos",
  "waitlist",
]

/** `/<event>` or `/<event>/success`: the public event page or its confirmation, nothing deeper. */
const EVENT_SIGNUP_PATH = /^\/([^/.]+)(?:\/success)?\/?$/

/** Whether a path is the public sign-up of an event (never one of the app's own pages). */
export function isEventSignupPath(pathname: string): boolean {
  const match = EVENT_SIGNUP_PATH.exec(pathname)
  if (!match) return false
  const segment = match[1]
  return !segment.startsWith("_") && !APP_TOP_LEVEL_SEGMENTS.includes(segment)
}

/** Whether a request may be framed: the embeddable sign-up only. */
export function isFramable(pathname: string, searchParams: URLSearchParams): boolean {
  return isEmbedMode(searchParams.getAll(EMBED_PARAM)) && isEventSignupPath(pathname)
}

/** The framing headers of a response, for its path and query. */
export function frameHeaders(pathname: string, searchParams: URLSearchParams): readonly { key: string; value: string }[] {
  return isFramable(pathname, searchParams) ? FRAME_EMBED_HEADERS : FRAME_DENY_HEADERS
}
