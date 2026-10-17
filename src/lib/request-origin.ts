// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Cross-site request forgery check of the admin APIs (#1048), applied by src/proxy.ts to every
 * state-changing request (POST, PUT, PATCH, DELETE) under /api/admin/ and /api/super-admin/.
 * Pure, no Prisma: imported by the proxy.
 *
 * Why: the session cookie is SameSite=Lax, which stops other sites, but every
 * `<slug>.benevol.app` is the same *site* as `www.benevol.app`: a page on one organization's
 * address could post to another's admin API with the visitor's cookie. The browser's `Origin`
 * header tells which page sent the request, and a page cannot forge it.
 *
 * Policy:
 * - `Origin` present: accepted only when it is the request's own origin (the `Host` the browser
 *   addressed, with the deployment's scheme) or the configured site address
 *   (NEXT_PUBLIC_APP_URL). `null` (sandboxed frame, cross-origin redirect) and anything malformed
 *   are refused.
 * - `Origin` missing: every browser in use sends `Origin` on these methods, so a request without
 *   it comes from a script or a tool (curl, the end-to-end tests, the video tools), which only
 *   holds a session cookie it was given. It is accepted unless a browser signal says otherwise:
 *   Fetch Metadata (`Sec-Fetch-Site`) other than `same-origin`, or a `Referer` from another
 *   origin, refuses it. Fetch Metadata only ever adds a refusal, it never admits a request on its
 *   own. Residual risk accepted: a browser old enough to send neither `Origin` nor
 *   `Sec-Fetch-Site` on a POST (none still supported).
 * - Body type: a request that carries a body must declare `application/json`, the only type the
 *   JSON routes read; a form or `text/plain` body (what a plain HTML form can send) is refused.
 *   The few routes that read another type are listed by exact method and path below.
 *
 * Public, embed, cron and sign-in endpoints (/api/public, /api/cron, /api/auth) are outside these
 * paths and keep their own rules.
 */

export type OriginCheckInput = {
  method: string
  pathname: string
  headers: Headers
  /** NEXT_PUBLIC_APP_URL as configured, undefined when not set. */
  configuredAppUrl: string | undefined
  nodeEnv: string | undefined
}

export type OriginCheckFailure = { status: 403 | 415; error: string }

export const ORIGIN_REFUSED = "Requête refusée : elle ne vient pas d'une page de ce site."
export const CONTENT_TYPE_REFUSED = "Type de contenu non pris en charge : envoyez du JSON."

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

/** The admin and super-admin APIs, the only paths this check covers. */
export function isProtectedApiPath(pathname: string): boolean {
  return pathname === "/api/admin" || pathname.startsWith("/api/admin/")
    || pathname === "/api/super-admin" || pathname.startsWith("/api/super-admin/")
}

/** Routes that read a body other than JSON, by exact method and path. */
const NON_JSON_ROUTES: { method: string; path: RegExp; accepts: (mediaType: string) => boolean }[] = [
  // Members import and its preview: the file in a multipart form.
  { method: "POST", path: /^\/api\/admin\/members\/import(\/preview)?$/, accepts: (t) => t === "multipart/form-data" },
  // Organization logo: the image bytes as the body.
  { method: "PUT", path: /^\/api\/admin\/settings\/organization\/logo$/, accepts: (t) => t.startsWith("image/") || t === "application/octet-stream" },
  // A super admin's switch of organization, an HTML form on the confirmation page.
  { method: "POST", path: /^\/api\/super-admin\/use-org\/[^/]+$/, accepts: (t) => t === "application/x-www-form-urlencoded" },
]

function mediaType(contentType: string | null): string | null {
  if (contentType === null) return null
  return contentType.split(";", 1)[0].trim().toLowerCase()
}

function hasBody(headers: Headers): boolean {
  if (headers.has("transfer-encoding")) return true
  const length = Number(headers.get("content-length") ?? "0")
  return Number.isFinite(length) && length > 0
}

function parseOrigin(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    // An Origin is a scheme, a host and a port, nothing else.
    if (url.origin !== value.replace(/\/$/, "")) return null
    return url
  } catch {
    return null
  }
}

/** Schemes a page of this deployment is served on: the configured one, either one in development. */
function trustedSchemes(configuredAppUrl: string | undefined, nodeEnv: string | undefined): string[] {
  const configured = configuredAppUrl ? parseConfigured(configuredAppUrl) : null
  if (configured) return [configured.protocol]
  return nodeEnv === "production" ? [] : ["http:", "https:"]
}

function parseConfigured(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Whether `origin` (a parsed Origin or Referer) is one of this deployment's own pages for this request. */
function isTrustedOrigin(origin: URL, input: OriginCheckInput): boolean {
  const configured = input.configuredAppUrl ? parseConfigured(input.configuredAppUrl) : null
  if (configured && origin.origin === configured.origin) return true
  const host = input.headers.get("host")
  if (!host) return false
  return origin.host === host.toLowerCase() && trustedSchemes(input.configuredAppUrl, input.nodeEnv).includes(origin.protocol)
}

/** Null when the request may go on, otherwise the refusal to send. */
export function checkAdminMutation(input: OriginCheckInput): OriginCheckFailure | null {
  const method = input.method.toUpperCase()
  if (!UNSAFE_METHODS.has(method) || !isProtectedApiPath(input.pathname)) return null
  const { headers } = input

  const originHeader = headers.get("origin")
  if (originHeader !== null) {
    const origin = parseOrigin(originHeader)
    if (!origin || !isTrustedOrigin(origin, input)) return { status: 403, error: ORIGIN_REFUSED }
  } else {
    const site = headers.get("sec-fetch-site")
    if (site !== null && site !== "same-origin") return { status: 403, error: ORIGIN_REFUSED }
    const referer = headers.get("referer")
    if (referer) {
      const from = parseConfigured(referer)
      if (!from || !isTrustedOrigin(from, input)) return { status: 403, error: ORIGIN_REFUSED }
    }
  }

  const type = mediaType(headers.get("content-type"))
  if (type === null) {
    // A body without a declared type: the JSON routes expect one, the others declare theirs.
    return hasBody(headers) ? { status: 415, error: CONTENT_TYPE_REFUSED } : null
  }
  if (type === "application/json") return null
  const exception = NON_JSON_ROUTES.find((r) => r.method === method && r.path.test(input.pathname))
  if (exception?.accepts(type)) return null
  return { status: 415, error: CONTENT_TYPE_REFUSED }
}
