// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Keyboard reorder of the roles in « Gérer les postes » (#554): the move and its announcement.
// The announcement names the role as its row shows it (`roleName`), never a shift's label.

export type MoveDirection = "up" | "down"

/** Moves `role` one step; null when it is absent or already at that end. Never mutates `roles`. */
export function moveRole(roles: readonly string[], role: string, dir: MoveDirection): { roles: string[]; index: number } | null {
  const from = roles.indexOf(role)
  if (from === -1) return null
  const to = dir === "up" ? from - 1 : from + 1
  if (to < 0 || to >= roles.length) return null
  const next = [...roles]
  next[from] = next[to]
  next[to] = role
  return { roles: next, index: to }
}

/** « Bar déplacé en position 2 sur 5. »; `index` is 0-based. */
export function roleMoveMessage(role: string, index: number, total: number): string {
  if (index === 0) return `${role} déplacé en première position.`
  if (index === total - 1) return `${role} déplacé en dernière position.`
  return `${role} déplacé en position ${index + 1} sur ${total}.`
}

/** Said when a move would go past an end: nothing changes. */
export function roleMoveBoundaryMessage(role: string, dir: MoveDirection): string {
  return `${role} est déjà en ${dir === "up" ? "première" : "dernière"} position.`
}
