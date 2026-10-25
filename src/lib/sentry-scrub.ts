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
// Defensive scrub (#598): an email address is personal data and must never reach Sentry, whatever
// string it ends up in — an SMTP error message that slipped past a classifier, a log line, a
// stack frame. Cheap (one regex pass over every string already going through scrubUrl).
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

export function scrubUrl(value: string): string {
  return value.replace(TOKEN_PATH, "$1[token]").replace(TOKEN_QUERY, "$1[token]").replace(EMAIL_RE, "[email]")
}

export function scrubDeep<T>(value: T, depth = 0): T {
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
  // The error itself: an exception's message (a failed query can quote its arguments), a captured
  // message, and the extra data and contexts attached to the event, with the same rules.
  if (event.message) event.message = scrubUrl(event.message)
  if (event.logentry) event.logentry = scrubDeep(event.logentry)
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((ex) => (ex.value ? { ...ex, value: scrubUrl(ex.value) } : ex))
  }
  if (event.extra) event.extra = scrubDeep(event.extra)
  if (event.contexts) event.contexts = scrubDeep(event.contexts)
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
 * Session replay travels in its own envelope, past `beforeSend` (#1042). Two hooks cover what it
 * sends besides the DOM recording: `scrubReplayFrame` (the replay integration's
 * `beforeAddRecordingEvent`) for its custom frames (breadcrumbs, navigation and fetch spans with
 * their URLs), and `scrubReplayEvent` (a `preprocessEvent` client hook) for the `urls` list of the
 * replay event. The recorder's own page address is out of their reach: replay is never started on
 * an address that carries a token (sentry-client-policy.ts).
 */
export function scrubReplayFrame<T>(frame: T): T {
  return scrubDeep(frame, 0)
}

export function scrubReplayEvent(event: Event): void {
  if (event.type !== "replay_event") return
  const replay = event as Event & { urls?: unknown }
  if (Array.isArray(replay.urls)) replay.urls = replay.urls.map((url) => (typeof url === "string" ? scrubUrl(url) : url))
  if (event.request) event.request = scrubDeep(event.request)
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

// « Event `Event` (type=error) captured as promise rejection »: what the SDK reports when a promise
// is rejected with a DOM Event instead of an Error (BENEVOLAPP-P). Seen from headless clients
// probing unknown subdomains, where a resource load failed; it has no stack and no app frame, so
// there is nothing to fix or even locate.
const DOM_EVENT_REJECTION = /^Event `\w*Event` \(type=[\w-]+\) captured as promise rejection$/

/** An unhandled rejection whose reason is a DOM Event without any stack (client only). */
export function isStacklessDomEventRejection(event: Event): boolean {
  const exceptions = event.exception?.values ?? []
  if (exceptions.length === 0) return false
  return exceptions.every(
    (ex) =>
      DOM_EVENT_REJECTION.test(ex.value ?? "") &&
      (ex.mechanism?.type ?? "").includes("onunhandledrejection") &&
      !ex.stacktrace?.frames?.length,
  )
}

// What browsers say when a fetch never got an answer: Safari « Load failed », Chrome « Failed to
// fetch », Firefox « NetworkError when attempting to fetch resource. ». Seen when a tab opened
// before a deploy asks for a file of the previous build, or the network drops; Next reloads the
// page itself. With no stack there is no code of ours to point at.
const NETWORK_FAILURE = /^(?:Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.?)$/

/** An unhandled rejection that is only a browser network failure, without any stack (client only). */
export function isStacklessNetworkRejection(event: Event): boolean {
  const exceptions = event.exception?.values ?? []
  if (exceptions.length === 0) return false
  return exceptions.every(
    (ex) =>
      ex.type === "TypeError" &&
      NETWORK_FAILURE.test(ex.value ?? "") &&
      (ex.mechanism?.type ?? "").includes("onunhandledrejection") &&
      !ex.stacktrace?.frames?.length,
  )
}

/** Client `beforeSend`: drops browser noise that `ignoreErrors` cannot express, then scrubs. */
export function beforeSendClient<T extends Event>(event: T): T | null {
  if (isStacklessDomEventRejection(event) || isStacklessNetworkRejection(event)) return null
  return scrubEvent(event)
}
