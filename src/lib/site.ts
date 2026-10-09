// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The instance's own values (#760): its name, contact address and support link. A self-hosted
 * instance sets them by environment variables; unset, they come from the instance's address
 * (NEXT_PUBLIC_APP_URL). The upstream defaults (benevol.app, its contact address) apply only to
 * the instance at benevol.app or with no address at all (development, tests). Pure, Prisma-free,
 * read at call time so a server reads its own environment.
 */

type Env = Record<string, string | undefined>

/** The upstream project's own instance: what the defaults describe. */
export const UPSTREAM_DOMAIN = "benevol.app"
const UPSTREAM_CONTACT = `contact@${UPSTREAM_DOMAIN}`
const UPSTREAM_SUPPORT = `https://buymeacoffee.com/${UPSTREAM_DOMAIN}`

const runtimeEnv = (): Env => (typeof process !== "undefined" ? process.env : {})

/** The instance's domain, from its address, without « www. »; the upstream one when there is none. */
export function siteDomain(env: Env = runtimeEnv()): string {
  try {
    const host = new URL(env.NEXT_PUBLIC_APP_URL ?? "").hostname.replace(/^www\./, "")
    if (host && host !== "localhost" && !/^\d+(\.\d+){3}$/.test(host)) return host
  } catch {
    // No address: development or tests.
  }
  return UPSTREAM_DOMAIN
}

/** The name shown in titles, emails and the header: `SITE_NAME`, else the instance's domain. */
export function siteName(env: Env = runtimeEnv()): string {
  return env.SITE_NAME?.trim() || siteDomain(env)
}

/**
 * The public contact address: `CONTACT_EMAIL`; for the upstream instance its contact address;
 * else the reply-to address of the emails; else none (the pages then name no address).
 */
export function contactEmail(env: Env = runtimeEnv()): string | null {
  const explicit = env.CONTACT_EMAIL?.trim()
  if (explicit) return explicit
  if (siteDomain(env) === UPSTREAM_DOMAIN) return UPSTREAM_CONTACT
  return env.EMAIL_REPLY_TO?.trim() || null
}

/**
 * The « Soutenir le projet » link: `SUPPORT_URL` (https only); for the upstream instance its own
 * page; else none, which hides the link.
 */
export function supportUrl(env: Env = runtimeEnv()): string | null {
  const raw = env.SUPPORT_URL?.trim()
  if (!raw) return siteDomain(env) === UPSTREAM_DOMAIN ? UPSTREAM_SUPPORT : null
  try {
    return new URL(raw).protocol === "https:" ? raw : null
  } catch {
    return null
  }
}
