// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Checks on a PR's migrations (#346), run in CI by scripts/check-migrations.mjs. Migrations run in
 * a Job before the new pods roll out, so the previous code runs on the new schema for a while
 * (CONTRIBUTING, expand/contract). Two rules:
 *
 * - an applied migration is never edited, removed or renamed: Prisma records a checksum of it, and
 *   production would no longer match the repository;
 * - a new migration with a statement that can break the previous code (removing or renaming a
 *   column/table, changing a type, NOT NULL without default) needs an explicit acknowledgement:
 *   a `-- migration-safety: <why it's safe>` line in the file, reviewed like the rest of the PR.
 *
 * Plain TypeScript without path aliases: the CI script imports it directly (Node type stripping).
 */

export type FileChange = { status: string; path: string }

const MIGRATION_SQL = /^prisma\/migrations\/[^/]+\/migration\.sql$/

/** Migration files a PR modifies, removes or renames (git --name-status: anything but A). */
export function editedMigrations(changes: FileChange[]): string[] {
  return changes.filter((c) => MIGRATION_SQL.test(c.path) && !c.status.startsWith("A")).map((c) => c.path)
}

/** Migration files a PR adds. */
export function addedMigrations(changes: FileChange[]): string[] {
  return changes.filter((c) => MIGRATION_SQL.test(c.path) && c.status.startsWith("A")).map((c) => c.path)
}

/** Parses `git diff --name-status` output ("M\tpath", "R100\told\tnew"): a rename counts for both paths. */
export function parseNameStatus(output: string): FileChange[] {
  return output
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => {
      const [status, ...paths] = line.split("\t")
      return paths.map((path) => ({ status, path }))
    })
}

const RISKY: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bDROP\s+(TABLE|COLUMN)\b/i, reason: "removes a table or column the previous code may still read" },
  { pattern: /\bRENAME\s+(TO|COLUMN)\b/i, reason: "renames a table or column the previous code still uses" },
  { pattern: /\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i, reason: "changes a column type" },
  { pattern: /\bALTER\s+COLUMN\s+"?\w+"?\s+SET\s+NOT\s+NULL\b/i, reason: "makes a column mandatory: the previous code may insert rows without it" },
  { pattern: /\bADD\s+COLUMN\s+(?:(?!\bDEFAULT\b)[^,;])*\bNOT\s+NULL\b(?:(?!\bDEFAULT\b)[^,;])*(?=[,;]|$)/i, reason: "adds a mandatory column without a default: the previous code's inserts would fail" },
]

export const ACK = /^\s*--\s*migration-safety:\s*\S/m

function withoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
}

/** Statements of a migration that can break the previous code, with why. */
export function riskyStatements(sql: string): { statement: string; reason: string }[] {
  return withoutComments(sql)
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((statement) => RISKY.filter((r) => r.pattern.test(statement)).map((r) => ({ statement, reason: r.reason })))
}

export type Report = { errors: string[]; acknowledged: string[] }

/** Everything the CI check reports for a PR: `errors` fail it, `acknowledged` are only shown. */
export function checkMigrations(changes: FileChange[], readFile: (path: string) => string): Report {
  const errors = editedMigrations(changes).map(
    (path) => `${path}: applied migrations must not be edited, removed or renamed; add a new migration instead.`,
  )
  const acknowledged: string[] = []
  for (const path of addedMigrations(changes)) {
    const sql = readFile(path)
    const risky = riskyStatements(sql)
    if (risky.length === 0) continue
    const lines = risky.map((r) => `${path}: ${r.reason}\n    ${r.statement}`)
    if (ACK.test(sql)) acknowledged.push(...lines)
    else errors.push(...lines.map((l) => `${l}\n    Make it compatible with the previous release (CONTRIBUTING, expand/contract), or add a "-- migration-safety: <why it's safe>" line.`))
  }
  return { errors, acknowledged }
}
