// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What a member import will do, line by line, before anything is written (#464). The preview and
 * the confirmed import both call `planImport` on the same parsed file, so the import applies exactly
 * the rules the preview showed. Pure: the existing members are passed in.
 */
import type { ImportError, ParsedMemberRow } from "./csv-import"
import { normalizeEmail } from "./email-address"

export type OnDuplicate = "skip" | "update"
export type ExistingMember = { id: string; email: string | null; tags: string[] }

export type PlannedLine = {
  line: number
  action: "create" | "update" | "skip"
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  tags: string[]
  /** The member updated or left as is, for "update" and "skip". */
  existingId: string | null
}

export type ImportPlan = {
  lines: PlannedLine[]
  errors: ImportError[]
  counts: { create: number; update: number; skip: number; error: number }
  /** Tags the import adds to the organisation, and tags it reuses (already on a member). */
  newTags: string[]
  reusedTags: string[]
}

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
export const MAX_IMPORT_LINES = 5000

export function parseOnDuplicate(value: unknown): OnDuplicate {
  return value === "update" ? "update" : "skip"
}

export function planImport(
  parsed: { rows: ParsedMemberRow[]; errors: ImportError[] },
  existing: ExistingMember[],
  onDuplicate: OnDuplicate,
): ImportPlan {
  const byEmail = new Map<string, ExistingMember>()
  for (const m of existing) if (m.email) byEmail.set(normalizeEmail(m.email), m)
  const knownTags = new Map<string, string>()
  for (const m of existing) for (const t of m.tags) if (!knownTags.has(t.toLowerCase())) knownTags.set(t.toLowerCase(), t)

  const lines: PlannedLine[] = []
  const errors: ImportError[] = [...parsed.errors]
  const seenInFile = new Map<string, number>()

  parsed.rows.forEach((row, i) => {
    const line = row.line ?? i + 2
    const email = row.email ? normalizeEmail(row.email) : null
    if (email) {
      const first = seenInFile.get(email)
      if (first !== undefined) {
        errors.push({ line, reason: `Même email que la ligne ${first}` })
        return
      }
      seenInFile.set(email, line)
    }
    const match = email ? byEmail.get(email) : undefined
    const action = !match ? "create" : onDuplicate === "update" ? "update" : "skip"
    lines.push({
      line,
      action,
      firstName: row.firstName,
      lastName: row.lastName,
      email,
      phone: row.phone ?? null,
      tags: row.tags ?? [],
      existingId: match?.id ?? null,
    })
  })

  errors.sort((a, b) => a.line - b.line)
  const newTags = new Map<string, string>()
  const reusedTags = new Map<string, string>()
  for (const l of lines) {
    if (l.action === "skip") continue
    for (const t of l.tags) {
      const key = t.toLowerCase()
      if (knownTags.has(key)) reusedTags.set(key, knownTags.get(key)!)
      else if (!newTags.has(key)) newTags.set(key, t)
    }
  }
  const count = (a: PlannedLine["action"]) => lines.filter((l) => l.action === a).length
  const sorted = (m: Map<string, string>) => [...m.values()].sort((a, b) => a.localeCompare(b, "fr"))
  return {
    lines,
    errors,
    counts: { create: count("create"), update: count("update"), skip: count("skip"), error: errors.length },
    newTags: sorted(newTags),
    reusedTags: sorted(reusedTags),
  }
}

/**
 * A stable text of what the plan will write, hashed by the server: the confirm is refused when
 * it no longer matches the preview (a member created or changed meanwhile).
 */
export function planDigest(plan: ImportPlan, onDuplicate: OnDuplicate): string {
  return [
    onDuplicate,
    ...plan.lines.map((l) => [l.line, l.action, l.existingId ?? "", l.email ?? "", l.firstName, l.lastName, l.phone ?? "", l.tags.join(",")].join("\u001f")),
    ...plan.errors.map((e) => `!${e.line}\u001f${e.reason}`),
  ].join("\u001e")
}

/** « 180 à créer, 52 à mettre à jour, 8 déjà présents ignorés, 3 lignes en erreur. » */
export function planSummary(counts: ImportPlan["counts"]): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
  const parts = [
    `${counts.create} à créer`,
    `${counts.update} à mettre à jour`,
    plural(counts.skip, "déjà présent ignoré", "déjà présents ignorés"),
    plural(counts.error, "ligne en erreur", "lignes en erreur"),
  ]
  return `${parts.join(", ")}.`
}
