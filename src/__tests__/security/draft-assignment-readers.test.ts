// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * Draft assignments (#1146, lot C) never hold a public place, never trigger a reminder, an email,
 * an export or a statistic, and never count as a registration: they live in their own table, and
 * only the files below may read or write it. A count, an export, a reminder or a public page that
 * started reading drafts would have to be added here, on purpose, and fails until then.
 */

const ROOT = join(__dirname, "..", "..", "..")
const SRC = join(ROOT, "src")

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "__integration__" || name === "generated" ? [] : sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** Who may touch the drafts, and why. */
const ALLOWED = [
  // The drafts themselves: writing, reviewing, publishing, and the organisers' review screen.
  "src/lib/draft-assignments-server.ts",
  "src/lib/draft-board-data.ts",
  // The per-shift panel shows a person's draft hours, apart from their committed ones (lot B).
  "src/lib/availability-assist-data.ts",
  // A member merge moves them (#600), then checks none is left on the absorbed record.
  "src/lib/draft-assignments-lifecycle.ts",
  "src/lib/member-merge-transaction.ts",
  // The event log names a publication (entity type only).
  "src/lib/event-log.ts",
  // Erasure and the past-event anonymisation delete them (#516, #813).
  "src/lib/member-erasure-transaction.ts",
  "src/lib/past-event-anonymisation.ts",
  // Generated proposals (#1172): read the kept drafts into a run's input, write a run's result as drafts.
  "src/lib/proposal-runs-data.ts",
  "src/lib/proposal-runs-server.ts",
  // The tenant scoping of every model (#268).
  "src/lib/prisma-org.ts",
].sort()

describe("draft assignments stay apart from registrations (#1146, lot C)", () => {
  it("only the draft, lifecycle and scoping modules read or write the drafts", () => {
    const readers = sources(SRC)
      .filter((path) => /\b(draftAssignment|draftPublication)\b|"(DraftAssignment|DraftPublication)"/.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path))
      .sort()
    expect(readers).toEqual(ALLOWED)
  })
})
