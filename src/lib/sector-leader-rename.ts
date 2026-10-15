// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Renaming a poste (#1001): its leader rows take the new name, in the same transaction as its
 * shifts. Leaders may already be recorded under the new name (designated before the poste existed,
 * or left behind by a rename made before this fix): they now lead the renamed poste too. A person
 * on both sides keeps a single row, the renamed poste's, whose link is the one their recent emails
 * carry; their row under the new name is the one dropped. Emails compare trimmed and
 * case-insensitively, like the database's unique index (#342).
 */
export function leaderRenamePlan(
  moving: { id: string; email: string }[],
  atTarget: { id: string; email: string }[],
): { dropIds: string[] } {
  const norm = (e: string) => e.trim().toLowerCase()
  const movingEmails = new Set(moving.map((l) => norm(l.email)))
  return { dropIds: atTarget.filter((l) => movingEmails.has(norm(l.email))).map((l) => l.id) }
}
