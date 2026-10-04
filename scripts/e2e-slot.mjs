// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Ports and names of an isolated e2e stack (#581). Slot 0 is the historical stack (3100, 5433,
 * 1026, 8026, project `benevoles-e2e`), which CI and an unset E2E_SLOT keep using. Slot N shifts
 * every port by 10 × N and suffixes the compose project and the container names, so several
 * worktrees can run Playwright at once without sharing a server, a database or a mailbox.
 *
 *   node scripts/e2e-slot.mjs 2   →  prints KEY=VALUE lines for that slot (read by the Makefile)
 */

export const MAX_SLOT = 9

/** @param {number} slot */
export function e2eSlot(slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT) {
    throw new Error(`E2E_SLOT must be an integer from 0 to ${MAX_SLOT}, got ${slot}`)
  }
  const shift = slot * 10
  const suffix = slot === 0 ? "" : `-${slot}`
  return {
    E2E_SLOT: String(slot),
    E2E_SUFFIX: suffix,
    E2E_PROJECT: `benevoles-e2e${suffix}`,
    E2E_PG_CONTAINER: `benevoles_postgres_e2e${suffix}`,
    E2E_PORT: String(3100 + shift),
    E2E_PG_PORT: String(5433 + shift),
    E2E_SMTP_PORT: String(1026 + shift),
    E2E_MAILPIT_PORT: String(8026 + shift),
  }
}

/** The `.env.e2e` lines that point a stack's app at its own ports. */
export function e2eEnvOverrides(slot) {
  const s = e2eSlot(slot)
  return {
    DATABASE_URL: `postgresql://benevoles:benevoles@localhost:${s.E2E_PG_PORT}/benevoles_e2e`,
    SMTP_PORT: s.E2E_SMTP_PORT,
    NEXT_PUBLIC_APP_URL: `http://localhost:${s.E2E_PORT}`,
    AUTH_URL: `http://localhost:${s.E2E_PORT}`,
    E2E_PORT: s.E2E_PORT,
    MAILPIT_URL: `http://localhost:${s.E2E_MAILPIT_PORT}`,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const slot = Number(process.argv[2] ?? process.env.E2E_SLOT ?? 0)
  const values = process.argv[3] === "--env" ? e2eEnvOverrides(slot) : e2eSlot(slot)
  for (const [k, v] of Object.entries(values)) console.log(`${k}=${v}`)
}
