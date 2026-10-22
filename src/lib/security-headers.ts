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
export const REFERRER_POLICY_HEADER = { key: "Referrer-Policy", value: "strict-origin" } as const

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
 * Script policy, in report-only mode (#1052). A second line of defence behind the sanitised
 * Markdown, and a first step towards an enforced policy. The browser only reports, in the
 * developer console of the page (« [Report Only] … »), what the policy would have refused;
 * nothing is blocked, and no report is sent anywhere (no report-uri / report-to: no endpoint, no
 * third party). How to read the violations: SECURITY.md, « Politique de scripts ».
 *
 * What it reports: a script loaded from another site, a plugin (<object>, <embed>), a <base> tag
 * pointing elsewhere, and in production any eval. What it does not: an injected inline script.
 * `'unsafe-inline'` stays because the policy carries no nonce: Next.js puts the nonce on its own
 * inline scripts only when it finds one in a `script-src` of the request's CSP, and it reads the
 * enforced `Content-Security-Policy` first. The proxy's framing header (frame-ancestors, below)
 * is that header for every page, and Next.js copies the proxy's response headers onto the request
 * before rendering, so a report-only nonce never reaches its scripts (verified on a production
 * build of Next.js 16.4). Without a nonce, every Next.js inline script would be reported on every
 * page. Nonces come with enforcement: the proxy will emit frame-ancestors and a nonce-bearing
 * script-src in one enforced policy, which Next.js then reads.
 *
 * - `worker-src 'self' blob:`: the error-tracking SDK's session-replay worker.
 * - In development only, `'unsafe-eval'`, which React needs there for its error overlay.
 *
 * Kept apart from the enforced `Content-Security-Policy` (frame-ancestors, below): a report-only
 * header never blocks, and the framing decision is unchanged.
 */
export function scriptPolicyReportOnly(options: { dev: boolean }): string {
  const scriptSrc = ["'self'", "'unsafe-inline'", ...(options.dev ? ["'unsafe-eval'"] : [])]
  return [`script-src ${scriptSrc.join(" ")}`, "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'"].join("; ")
}

/** The headers of every response (next.config.ts), in production or in development. */
export function securityHeaders(options: { dev: boolean }): readonly { key: string; value: string }[] {
  return [
    REFERRER_POLICY_HEADER,
    NOSNIFF_HEADER,
    PERMISSIONS_POLICY_HEADER,
    { key: "Content-Security-Policy-Report-Only", value: scriptPolicyReportOnly(options) },
  ]
}

/** The production headers of every response. */
export const SECURITY_HEADERS = securityHeaders({ dev: false })

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
 *   directive: the app enforces no other CSP anywhere (the script policy above is report-only),
 *   so nothing else changes for the embed.
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
  "benevoles-festival",
  "benevoles-fete-de-village",
  "benevoles-manifestation-sportive",
  "blog",
  "doc",
  "fonctionnalites",
  "inscription",
  "leader",
  "legal",
  "logiciel-planning-benevoles",
  "modele-planning-benevoles",
  "monitoring",
  "my",
  "nouveautes",
  "planning-permanences-benevoles",
  "product-updates",
  "pour-qui",
  "super-admin",
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

/** The framing headers of a response, for its path and query. */
export function frameHeaders(pathname: string, searchParams: URLSearchParams): readonly { key: string; value: string }[] {
  return isFramable(pathname, searchParams) ? FRAME_EMBED_HEADERS : FRAME_DENY_HEADERS
}
