// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * API responses that carry personal data or access tokens are never stored by the browser's disk
 * cache or by an intermediary: a volunteer's personal link API returns their email, phone and
 * every registration's link, a leader's link returns the volunteers of their scope, the admin APIs
 * return members, and next-auth's endpoints return the CSRF token and the session.
 *
 * Applied by next.config.ts to every path under these prefixes, success and error alike, so a new
 * route in one of these families is covered without having to remember it. A route outside them
 * is listed in NOT_PERSONAL_API_ROUTES; src/lib/__tests__/personal-api-headers.test.ts fails for
 * a route that is in neither.
 */
export const PERSONAL_API_PREFIXES = [
  "/api/admin",
  "/api/super-admin",
  "/api/auth",
  "/api/cron",
  // Volunteers' personal links and everything reached with them.
  "/api/public/registrations",
  "/api/public/leader",
  "/api/public/member-invite",
  "/api/public/availability",
  "/api/public/waitlist",
  "/api/public/push",
  // Account and organisation links sent by email.
  "/api/public/forgot-password",
  "/api/public/reset-password",
  "/api/public/signup",
  "/api/public/org-keep",
  "/api/public/org-reactivation",
  "/api/public/product-updates",
] as const

/**
 * API routes with nothing personal in their answers: public event pages' data, the logo, the
 * anonymous « utile ? » answer, the health checks. As src/app/api paths, dynamic segments kept.
 */
export const NOT_PERSONAL_API_ROUTES = [
  "/api/health",
  "/api/health/ready",
  "/api/public/events",
  "/api/public/[eventSlug]",
  "/api/public/organizations/[id]/logo",
  "/api/public/video-feedback",
] as const

export const NO_STORE_HEADERS = [
  { key: "Cache-Control", value: "private, no-store" },
  // For HTTP/1.0 caches, which ignore Cache-Control.
  { key: "Pragma", value: "no-cache" },
  { key: "X-Robots-Tag", value: "noindex" },
] as const

/** Whether `path` (an API path, or a route's path with its dynamic segments) is in a personal family. */
export function isPersonalApiPath(path: string): boolean {
  return PERSONAL_API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}

/** The next.config.ts header rules: each prefix itself and everything below it. */
export const PERSONAL_API_HEADER_RULES = PERSONAL_API_PREFIXES.map((prefix) => ({
  source: `${prefix}/:path*`,
  headers: [...NO_STORE_HEADERS],
}))
