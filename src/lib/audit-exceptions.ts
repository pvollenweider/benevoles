// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The CI check on production dependencies (scripts/check-prod-audit.mjs): any advisory rated high
 * or critical fails it, except the ones listed here, each for a stated reason and until a date.
 * Pure: the script feeds it the JSON of `npm audit --omit=dev --json` and today's date.
 *
 * An exception is for an advisory that has no fixed version yet and whose vulnerable code the
 * application does not reach. It names one advisory and one package, never a whole package or a
 * severity, and it ends: past `until`, the advisory fails the check again, so it is looked at
 * again rather than forgotten. Remove the entry as soon as a fixed version can be installed.
 */

export type AuditException = {
  /** The advisory, as in its address: https://github.com/advisories/<id>. */
  id: string
  /** The package the advisory is about. */
  package: string
  /** Why the application is not exposed, in one or two sentences. */
  reason: string
  /** The day the exception was written, "YYYY-MM-DD". */
  added: string
  /** The last day it applies, "YYYY-MM-DD", at most MAX_EXCEPTION_DAYS after `added`. */
  until: string
}

/** An exception lasts a month at most; it can be renewed by a new decision, with a new date. */
export const MAX_EXCEPTION_DAYS = 31

export const AUDIT_EXCEPTIONS: readonly AuditException[] = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    package: "picomatch",
    reason:
      "No fixed version exists (every release up to 4.0.7 is affected). picomatch comes only from the build tooling of @sentry/nextjs (@rollup/plugin-commonjs, vite), where it matches file names against patterns written in configuration; the slow matching needs a pattern chosen by an attacker, and no visitor supplies one.",
    added: "2026-11-17",
    until: "2026-12-17",
  },
]

const BLOCKING_SEVERITIES = new Set(["high", "critical"])

export type AuditAdvisory = { id: string; package: string; severity: string; title: string; url: string }

type Via = string | { name?: string; title?: string; url?: string; severity?: string }
type AuditReport = { vulnerabilities?: Record<string, { via?: Via[] }> }

/** "GHSA-xxxx-xxxx-xxxx" from an advisory address, or the address itself when it has another form. */
export function advisoryId(url: string): string {
  return url.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i)?.[0] ?? url
}

/**
 * Every advisory of the report, once each. A package flagged only because it depends on a flagged
 * one carries package names in `via`, not an advisory: the advisory itself is on the package it is
 * about, so judging the advisories covers the whole tree.
 */
export function auditAdvisories(report: AuditReport): AuditAdvisory[] {
  const seen = new Map<string, AuditAdvisory>()
  for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of entry.via ?? []) {
      if (typeof via === "string" || !via.url) continue
      const id = advisoryId(via.url)
      const key = `${id}\u0000${via.name ?? name}`
      if (!seen.has(key)) seen.set(key, { id, package: via.name ?? name, severity: via.severity ?? "", title: via.title ?? "", url: via.url })
    }
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id) || a.package.localeCompare(b.package))
}

export type AuditVerdict = {
  /** High or critical advisories with no exception: the check fails. */
  blocking: AuditAdvisory[]
  /** High or critical advisories whose exception is over: the check fails, and says so. */
  expired: { advisory: AuditAdvisory; exception: AuditException }[]
  /** High or critical advisories covered today: reported, the check passes. */
  excused: { advisory: AuditAdvisory; exception: AuditException }[]
  /** Exceptions whose advisory is no longer reported: to remove from the list. */
  unused: AuditException[]
}

/** `today` is "YYYY-MM-DD"; an exception applies up to and including its `until` day. */
export function auditVerdict(report: AuditReport, exceptions: readonly AuditException[], today: string): AuditVerdict {
  const verdict: AuditVerdict = { blocking: [], expired: [], excused: [], unused: [] }
  const used = new Set<AuditException>()
  for (const advisory of auditAdvisories(report)) {
    if (!BLOCKING_SEVERITIES.has(advisory.severity)) continue
    const exception = exceptions.find((e) => e.id.toLowerCase() === advisory.id.toLowerCase() && e.package === advisory.package)
    if (!exception) verdict.blocking.push(advisory)
    else {
      used.add(exception)
      if (today > exception.until) verdict.expired.push({ advisory, exception })
      else verdict.excused.push({ advisory, exception })
    }
  }
  verdict.unused = exceptions.filter((e) => !used.has(e))
  return verdict
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** What is wrong with the list itself, whatever the report says: an exception must be dated and bounded. */
export function auditExceptionProblems(exceptions: readonly AuditException[]): string[] {
  const problems: string[] = []
  for (const e of exceptions) {
    const label = `${e.id} (${e.package})`
    if (!/^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/i.test(e.id)) problems.push(`${label}: the id is not an advisory id`)
    if (!e.package.trim()) problems.push(`${label}: no package`)
    if (e.reason.trim().length < 40) problems.push(`${label}: the reason must say why the application is not exposed`)
    if (!DAY.test(e.added) || !DAY.test(e.until) || Number.isNaN(Date.parse(e.added)) || Number.isNaN(Date.parse(e.until))) {
      problems.push(`${label}: added and until must be dates, YYYY-MM-DD`)
      continue
    }
    const days = (Date.parse(e.until) - Date.parse(e.added)) / 86_400_000
    if (days < 0) problems.push(`${label}: until is before added`)
    if (days > MAX_EXCEPTION_DAYS) problems.push(`${label}: an exception lasts ${MAX_EXCEPTION_DAYS} days at most (${days} here)`)
  }
  const keys = exceptions.map((e) => `${e.id.toLowerCase()} ${e.package}`)
  for (const k of new Set(keys.filter((key, i) => keys.indexOf(key) !== i))) problems.push(`${k}: listed twice`)
  return problems
}
