// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash, randomBytes } from "node:crypto"
import { EMBED_PARAM, isEmbedMode } from "./embed"
import { INLINE_SCRIPTS } from "./inline-scripts"

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
export const REFERRER_POLICY_HEADER = { key: "Referrer-Policy", value: "strict-origin" } as const

/**
 * The calendar subscription (#961) is a secret address fetched by calendar apps: no Referer at
 * all, not even the origin. A rule of next.config.ts placed after the global headers (the last
 * rule for a key wins: a header set by the route itself would be overwritten by the global one).
 */
export const CALENDAR_FEED_HEADER_RULES = [
  { source: "/api/public/registrations/:token/calendar.ics", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
] as const

/**
 * X-Content-Type-Options: nosniff (#1052). The browser takes every response for the type it
 * declares instead of guessing from its bytes, so an uploaded or generated file can never be run as
 * a script or a style sheet. Every route of the app declares its type (pages, JSON, CSV, ICS, PNG,
 * SVG, the print pages, sw.js, the manifest, robots, sitemaps, llms.txt, feed.xml).
 */
export const NOSNIFF_HEADER = { key: "X-Content-Type-Options", value: "nosniff" } as const

/**
 * Permissions-Policy (#1052): turns off, for the app's pages and anything they frame, the device
 * features the app never asks for. Kept to features no page uses: copying a link (clipboard),
 * the share sheet, the video player's full screen and picture-in-picture, autoplay and push
 * notifications are left as the browser's default. The embeddable sign-up uses none of these
 * either, and the policy only constrains the app's own document inside the association's frame.
 */
export const PERMISSIONS_POLICY_HEADER = {
  key: "Permissions-Policy",
  value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
} as const

/**
 * The headers of every response (next.config.ts). The script and framing policy is per request
 * (a nonce), so the proxy sets it: `pageSecurityHeaders` below.
 */
export const SECURITY_HEADERS: readonly { key: string; value: string }[] = [REFERRER_POLICY_HEADER, NOSNIFF_HEADER, PERMISSIONS_POLICY_HEADER]

/**
 * The sha256 hashes of the app's own inline scripts (src/lib/inline-scripts.ts), as CSP sources.
 * Computed from the strings themselves, so they always match what the pages emit.
 */
export const INLINE_SCRIPT_HASHES: readonly string[] = INLINE_SCRIPTS.map(
  (script) => `'sha256-${createHash("sha256").update(script, "utf8").digest("base64")}'`,
)

/** A fresh nonce for one response: 128 random bits, base64. */
export function createNonce(): string {
  return randomBytes(16).toString("base64")
}

/**
 * The enforced Content-Security-Policy of every response the proxy lets through (src/proxy.ts),
 * one header for framing and scripts:
 *
 * - `frame-ancestors`: `'none'`, or `*` for the embeddable sign-up (#948, below).
 * - `script-src 'self' 'nonce-…' 'strict-dynamic'` and the hashes of the app's inline scripts. The
 *   proxy draws a new nonce per request; Next.js reads it from this header and puts it on its own
 *   scripts (framework, page chunks, inline data), which then load the rest of the app
 *   (`'strict-dynamic'`). Every page renders per request (the root layout awaits `connection()`),
 *   so every page gets its nonce. Any other inline script, inline event handler (`onclick=…`),
 *   `javascript:` link or script from another site is refused. `'self'` only matters to browsers
 *   without `'strict-dynamic'`. In development only, `'unsafe-eval'`, which React needs there.
 * - `worker-src 'self' blob:`: the service worker and the error-tracking SDK's replay worker.
 * - `object-src 'none'`, `base-uri 'self'`: no plugin, no `<base>` pointing elsewhere.
 * - `form-action 'self'`: a form only submits to this site.
 *
 * Styles, images, media, fonts and connections are not restricted. Responses the proxy does not
 * see (static files, the image optimiser, the error-report relay) are no pages and carry no policy.
 */
export function contentSecurityPolicy(options: { nonce: string; framable: boolean; dev: boolean }): string {
  const scriptSrc = ["'self'", `'nonce-${options.nonce}'`, "'strict-dynamic'", ...INLINE_SCRIPT_HASHES, ...(options.dev ? ["'unsafe-eval'"] : [])]
  return [
    `frame-ancestors ${options.framable ? "*" : "'none'"}`,
    `script-src ${scriptSrc.join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ")
}

/**
 * Framing (#948). No page may be shown inside another site's frame (clickjacking: a hidden
 * frame over a decoy button), except the embeddable sign-up, `/<event>?embed=1` and its
 * confirmation `/<event>/success?embed=1`, which an association puts on its own site, whatever
 * that site's address. Decided by the proxy per request (src/proxy.ts), so the decision can read
 * the query: next.config.ts headers cannot drop one per request.
 *
 * - Everything else: `frame-ancestors 'none'` and its older equivalent `X-Frame-Options: DENY`
 *   (browsers without CSP level 2). Admin, super admin, personal and leader pages, sign-in,
 *   waitlist confirmation, API, the site's own pages.
 * - The embeddable sign-up: `frame-ancestors *` (any http/https site) and no X-Frame-Options,
 *   which would forbid it again in the browsers that read it. Its script policy is the same as
 *   everywhere else.
 */
export function pageSecurityHeaders(
  pathname: string,
  searchParams: URLSearchParams,
  options: { nonce: string; dev: boolean },
): readonly { key: string; value: string }[] {
  const framable = isFramable(pathname, searchParams)
  const csp = { key: "Content-Security-Policy", value: contentSecurityPolicy({ ...options, framable }) }
  return framable ? [csp] : [csp, { key: "X-Frame-Options", value: "DENY" }]
}

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
  "benevoles-festival",
  "benevoles-fete-de-village",
  "benevoles-manifestation-sportive",
  "blog",
  "disponibilites",
  "doc",
  "fonctionnalites",
  "inscription",
  "leader",
  "legal",
  "logiciel-planning-benevoles",
  "monitoring",
  "my",
  "nouveautes",
  "planning-permanences-benevoles",
  "product-updates",
  "pour-qui",
  "super-admin",
  "tableur-ou-outil-dedie",
  "tarifs",
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
