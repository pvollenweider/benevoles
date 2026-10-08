// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Readiness of a freshly started pod: it takes traffic only once its warm-up is over
 * (scripts/warmup.mjs, started by docker-entrypoint.sh), so the first visit of each page after a
 * deploy is not the one paying for the cold start. The entrypoint writes this file when the
 * warm-up returns, gives up or is disabled; the Kubernetes readiness probe asks
 * /api/health/ready, which answers 503 until then. Liveness stays on /api/health, independent of
 * it: a slow warm-up never gets the pod restarted.
 *
 * The same default as `WARMUP_READY_FILE` in docker-entrypoint.sh (checked by a test).
 */
export const DEFAULT_READY_FILE = "/tmp/benevoles-ready"

export function readyFilePath(env: Record<string, string | undefined>): string {
  return env.WARMUP_READY_FILE || DEFAULT_READY_FILE
}

export type Readiness = { status: 200 | 503; body: { ok: boolean; warming?: true; error?: string } }

/** The readiness answer: warming up first, then the database check that /api/health does too. */
export function readiness(warmedUp: boolean, databaseOk: boolean): Readiness {
  if (!warmedUp) return { status: 503, body: { ok: false, warming: true } }
  if (!databaseOk) return { status: 503, body: { ok: false, error: "database unreachable" } }
  return { status: 200, body: { ok: true } }
}
