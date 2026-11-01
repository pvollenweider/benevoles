// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The browser's error reports reach Sentry through this site (`/monitoring`, so ad blockers let
 * them through: src/app/monitoring/route.ts). The relay only forwards to this project: an envelope
 * whose header names another DSN (another Sentry organisation or project) is refused, so the
 * server never relays traffic for someone else's project.
 */

/** The browser SDK's `tunnel` option and the route that answers it. */
export const SENTRY_TUNNEL_PATH = "/monitoring"

/** Far above a real envelope (an error with its breadcrumbs, a compressed replay segment). */
export const SENTRY_TUNNEL_MAX_BYTES = 2 * 1024 * 1024

type Dsn = { host: string; projectId: string; publicKey: string }

function parseDsn(value: unknown): Dsn | null {
  if (typeof value !== "string" || !value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || !url.username || url.password || url.port) return null
  const projectId = url.pathname.replace(/^\/+|\/+$/g, "")
  if (!/^\d+$/.test(projectId)) return null
  return { host: url.hostname.toLowerCase(), projectId, publicKey: url.username }
}

/** The DSNs this deployment reports to (browser and server); empty when Sentry is off. */
export function ownSentryDsns(env: { NEXT_PUBLIC_SENTRY_DSN?: string; SENTRY_DSN?: string }): string[] {
  return [env.NEXT_PUBLIC_SENTRY_DSN, env.SENTRY_DSN].filter((d): d is string => !!d)
}

/**
 * Where an envelope may be forwarded: the ingest URL of its DSN when that DSN is one of this
 * deployment's own (same host, project and key), otherwise null. Only the envelope's first line,
 * its header, is read.
 */
export function sentryTunnelTarget(envelope: Uint8Array, ownDsns: readonly string[]): string | null {
  const newline = envelope.indexOf(0x0a)
  const headerBytes = newline === -1 ? envelope : envelope.subarray(0, newline)
  if (headerBytes.length > 4096) return null
  let header: unknown
  try {
    header = JSON.parse(new TextDecoder().decode(headerBytes))
  } catch {
    return null
  }
  const dsn = parseDsn((header as { dsn?: unknown } | null)?.dsn)
  if (!dsn) return null
  const own = ownDsns.map(parseDsn).find((d) => d && d.host === dsn.host && d.projectId === dsn.projectId && d.publicKey === dsn.publicKey)
  return own ? `https://${own.host}/api/${own.projectId}/envelope/` : null
}
