// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Where a super admin lands after switching organization, and how an admin page knows its own
 * address. Pure, no Prisma: also imported by src/proxy.ts.
 */

/** The page path and query of the request, set by src/proxy.ts on admin pages (a client value is dropped). */
export const REQUEST_PATH_HEADER = "x-benevoles-path"

export const DEFAULT_ADMIN_NEXT = "/admin/events"

const MAX_NEXT_LENGTH = 2048

/**
 * `next` of the super admin's organization switch when it is a same-origin admin page, the events list
 * otherwise: never an absolute or protocol-relative URL (open redirect), never outside /admin/.
 * Anything ambiguous (backslashes, control characters or spaces, encoded slashes, backslashes or
 * dots, dot segments) is refused rather than normalised. The fragment is dropped.
 */
export function safeAdminNext(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return DEFAULT_ADMIN_NEXT
  if (!raw.startsWith("/admin/")) return DEFAULT_ADMIN_NEXT
  // Backslashes (read as slashes by browsers), whitespace and control characters.
  if (/[\\\s\x00-\x1f\x7f]/.test(raw)) return DEFAULT_ADMIN_NEXT
  // Encoded slash, backslash or dot, and percent-encoded percent (double encoding).
  if (/%(2f|5c|2e|25)/i.test(raw)) return DEFAULT_ADMIN_NEXT
  const path = raw.split(/[?#]/, 1)[0]
  if (path.split("/").some((segment) => segment === "." || segment === "..")) return DEFAULT_ADMIN_NEXT

  let url: URL
  try {
    url = new URL(raw, "https://same-origin.invalid")
  } catch {
    return DEFAULT_ADMIN_NEXT
  }
  if (url.origin !== "https://same-origin.invalid" || !url.pathname.startsWith("/admin/")) return DEFAULT_ADMIN_NEXT
  return `${url.pathname}${url.search}`
}

/** The event id of an admin event page (/admin/events/<id> and its sub-pages), null otherwise. */
export function adminEventIdFromPath(path: string | null | undefined): string | null {
  if (!path) return null
  const match = /^\/admin\/events\/([^/?#]+)(?:[/?#]|$)/.exec(path)
  if (!match) return null
  const id = match[1]
  if (id === "new" || !/^[A-Za-z0-9_-]+$/.test(id)) return null
  return id
}

/**
 * The confirmation page of the organization switch that opens `path` in the organization `orgId`
 * (#1048): opening it changes nothing, its button posts the switch (orgSwitchAction).
 */
export function orgSwitchUrl(orgId: string, path: string): string {
  return `/super-admin/use-org/${encodeURIComponent(orgId)}?next=${encodeURIComponent(safeAdminNext(path))}`
}

/** Where the confirmation page and the organization's « Gérer » button post the switch. */
export function orgSwitchAction(orgId: string): string {
  return `/api/super-admin/use-org/${encodeURIComponent(orgId)}`
}

/**
 * The absolute address the switch redirects to (#1048), never built from the forwarded host
 * headers a client can choose. It stays on the host the browser used (the `Host` header) when that
 * host is the configured site address (NEXT_PUBLIC_APP_URL) or one of its organizations'
 * subdomains, with the configured scheme: the session and `sa-org-id` cookies belong to that host.
 * Any other host goes to the configured address; the request's own origin only when nothing is
 * configured (development).
 */
export function canonicalRedirect(path: string, configuredAppUrl: string | undefined, requestUrl: string, requestHost: string | null): string {
  let configured: URL | null = null
  try {
    configured = configuredAppUrl ? new URL(configuredAppUrl) : null
  } catch {
    configured = null
  }
  if (!configured) return new URL(path, new URL(requestUrl).origin).toString()
  const host = (requestHost ?? "").trim().toLowerCase()
  const hostname = host.replace(/:\d+$/, "")
  const baseDomain = configured.hostname.replace(/^www\./, "")
  const ownHost = /^[a-z0-9.-]+(:\d+)?$/.test(host)
    && (hostname === configured.hostname || hostname === baseDomain || hostname.endsWith(`.${baseDomain}`))
  const base = ownHost ? `${configured.protocol}//${host}` : configured.origin
  return new URL(path, base).toString()
}
