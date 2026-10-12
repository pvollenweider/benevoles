// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Pure, Prisma-free: read by the email templates (src/lib/notifications/digest.ts writes the rows).

/** The items of a digest payload, or the payload's own data as the only item (rows queued before #869). */
export function digestItems<Item>(data: Record<string, unknown>): Item[] {
  const items = data.items as { value: Item }[] | undefined
  return items && items.length > 0 ? items.map((i) => i.value) : [data as Item]
}
