import type { Breadcrumb, Event } from "@sentry/nextjs"

/**
 * Removes secret access tokens from what is sent to Sentry. Some URLs of the
 * app carry a token that gives access to a volunteer's registration:
 *   /my/<token>, /waitlist/<token>/confirm, /api/public/registrations/<token>,
 *   /api/public/member-invite/<token> and ?token=<token> (invitations, password
 *   reset, account activation).
 * An error on one of these pages would otherwise attach the full URL, and the
 * token with it, to the event, its breadcrumbs and its spans.
 */

const TOKEN_PATH = /(\/(?:my|waitlist|member-invite|registrations)\/)[^/?#\s"']+/g
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
