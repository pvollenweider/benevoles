// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Breadcrumb, Event, init } from "@sentry/nextjs"

// Derived from init()'s options: @sentry/nextjs doesn't re-export these types itself.
type InitOptions = NonNullable<Parameters<typeof init>[0]>
type StreamedSpan = Parameters<NonNullable<InitOptions["beforeSendSpan"]>>[0]

/**
 * Removes secret access tokens from what is sent to Sentry. Some URLs of the
 * app carry a token that gives access to a volunteer's registration:
 *   /my/<token>, /waitlist/<token>/confirm, /api/public/registrations/<token>,
 *   /api/public/member-invite/<token>, a sector leader's /leader/<token> (page and
 *   API) and ?token=<token> (invitations, password reset, account activation).
 * An error on one of these pages would otherwise attach the full URL, and the
 * token with it, to the event, its breadcrumbs and its spans. The same families are
 * kept out of the proxy's access log (k8s/ingressroute-tokens.yaml).
 */

const TOKEN_PATH = /(\/(?:my|waitlist|member-invite|registrations|leader)\/)[^/?#\s"']+/g
// Also matches a bare query string, as stored in request.query_string.
const TOKEN_QUERY = /((?:^|[?&])(?:token|t)=)[^&#\s"']*/gi

export function scrubUrl(value: string): string {
  return value.replace(TOKEN_PATH, "$1[token]").replace(TOKEN_QUERY, "$1[token]")
}

function scrubDeep<T>(value: T, depth = 0): T {
  if (typeof value === "string") return scrubUrl(value) as T
  if (value === null || typeof value !== "object" || depth > 6) return value
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1)) as T
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) out[key] = scrubDeep(v, depth + 1)
  return out as T
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return {
    ...breadcrumb,
    ...(breadcrumb.message ? { message: scrubUrl(breadcrumb.message) } : {}),
    ...(breadcrumb.data ? { data: scrubDeep(breadcrumb.data) } : {}),
  }
}

export function scrubEvent<T extends Event>(event: T): T {
  if (event.request) {
    event.request = scrubDeep(event.request)
    delete event.request.cookies
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction)
  if (event.tags) event.tags = scrubDeep(event.tags)
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb)
  if (event.contexts?.trace?.data) event.contexts.trace.data = scrubDeep(event.contexts.trace.data)
  // Transaction events also carry spans (fetch and http calls with their URLs).
  const withSpans = event as { spans?: { description?: string; data?: Record<string, unknown> }[] }
  if (withSpans.spans) {
    withSpans.spans = withSpans.spans.map((span) => ({
      ...span,
      ...(span.description ? { description: scrubUrl(span.description) } : {}),
      ...(span.data ? { data: scrubDeep(span.data) } : {}),
    }))
  }
  return event
}

// Spans are streamed on their own since @sentry/nextjs 11 (no longer only inside transaction
// events), so they need their own pass: span name (often the URL) and attributes (url.full,
// http.target, ...).
export function scrubSpan(span: StreamedSpan): StreamedSpan {
  return { ...span, name: scrubUrl(span.name), attributes: scrubDeep(span.attributes) }
}

/**
 * What the SDK may collect on its own (@sentry/nextjs 11 replaced `sendDefaultPii: false` with
 * this, and every field defaults to *on*). Nothing personal: no user info, cookies, headers,
 * bodies, query strings (they can carry access tokens), DB query data or local variables.
 */
export const NO_PII_DATA_COLLECTION: NonNullable<InitOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
}

/**
 * Browser errors that are not this app's code, dropped before they reach Sentry (client only).
 * - iOS browsers (Firefox, Brave) inject scripts into WKWebView (app:/// origin) that throw on
 *   missing globals (__firefox__, DarkReader, window.ethereum).
 * - MetaMask and other wallet extensions auto-connect on every page and throw when their own
 *   backend is unreachable; the site has no Web3 code.
 * - Microsoft's link scanners (Outlook Safe Links / Defender) open the personal links of our
 *   emails in an embedded CefSharp browser, which rejects a promise of its own with « Object Not
 *   Found Matching Id:N, MethodName:update, ParamCount:N » (seen on /my/[token], no real user).
 */
export const BROWSER_NOISE_ERRORS: RegExp[] = [
  /__firefox__/,
  /DarkReader/,
  /window\.ethereum/,
  /MetaMask/,
  /Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/,
]
