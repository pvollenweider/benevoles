// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Keyboard reorder of the pages in « Pages personnalisées » (#605, the #554 pattern): the move and
// its announcements. `moveRole` is generic over strings, so page ids reorder with it unchanged.

export { moveRole as movePageId } from "@/lib/role-order"
export type { MoveDirection } from "@/lib/role-order"
import type { MoveDirection } from "@/lib/role-order"

/** « Page « FAQ » déplacée en position 2 sur 4. »; `index` is 0-based. Feminine agreement (« page »). */
export function pageMoveMessage(title: string, index: number, total: number): string {
  if (index === 0) return `Page « ${title} » déplacée en première position.`
  if (index === total - 1) return `Page « ${title} » déplacée en dernière position.`
  return `Page « ${title} » déplacée en position ${index + 1} sur ${total}.`
}

/** Said when a move would go past an end: nothing changes. */
export function pageMoveBoundaryMessage(title: string, dir: MoveDirection): string {
  return `La page « ${title} » est déjà en ${dir === "up" ? "première" : "dernière"} position.`
}

/** Shown in the outcome alert when a reorder save fails; the order shown is reverted to match. */
export const PAGE_ORDER_FAILED = "L'ordre des pages n'a pas pu être enregistré. L'ordre enregistré est rétabli."
