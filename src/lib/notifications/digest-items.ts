// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Pure, Prisma-free: read by the email templates (src/lib/notifications/digest.ts writes the rows).

/** The items of a digest payload, or the payload's own data as the only item (rows queued before #869). */
export function digestItems<Item>(data: Record<string, unknown>): Item[] {
  const items = data.items as { value: Item }[] | undefined
  return items && items.length > 0 ? items.map((i) => i.value) : [data as Item]
}

/**
 * The grouping delay, or `DIGEST_DELAY_SECONDS` when set (0 in the E2E job: the email then leaves
 * at once, as before grouping, so tests need not wait for the cron).
 */
export function digestDelayMs(defaultMs: number, env: Record<string, string | undefined> = process.env): number {
  const raw = env.DIGEST_DELAY_SECONDS?.trim()
  if (!raw) return defaultMs
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : defaultMs
}
