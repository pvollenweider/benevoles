// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Re-derives the #600 inventory from prisma/schema.prisma itself: every model with a field
 * typed `Volunteer` (a relation) or named `volunteerId` must be one the merge plan explicitly
 * handles (src/lib/member-merge.ts, src/lib/member-merge-transaction.ts), or be deliberately out
 * of scope and listed in OUT_OF_SCOPE with a reason. A new relation to Volunteer added later
 * fails this test until it's classified one way or the other.
 *
 * The Prisma 7 TS client generator (`prisma-client`) doesn't export a DMMF JSON the way the
 * classic client did, so this reads the schema text directly — same inputs, same guarantee.
 */

const HANDLED_BY_MERGE_PLAN = new Set(["Registration", "MemberInvite", "QuestionAnswer", "PushSubscription", "DeliveryOutcome"])

/** Models that reference a member without a `volunteerId` foreign key, so they're never
 * reassigned — only reported in the preview, or left untouched entirely (see the issue's
 * "References without a foreign key" table). */
const OUT_OF_SCOPE: Record<string, string> = {
  SectorLeader: "matched by email (case-insensitive), not volunteerId — reported in the preview, not moved",
}

describe("member merge — schema guard (#600)", () => {
  const schema = fs.readFileSync(path.join(__dirname, "..", "..", "..", "prisma", "schema.prisma"), "utf-8")
  const modelBlocks = [...schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)].map(([, name, body]) => ({ name, body }))

  it("found model blocks to check (schema isn't being misread)", () => {
    expect(modelBlocks.length).toBeGreaterThan(10)
  })

  it("every model referencing Volunteer is handled by the merge plan or explicitly out of scope", () => {
    const unhandled: string[] = []
    for (const { name, body } of modelBlocks) {
      if (name === "Volunteer") continue // the self-relation (mergedInto/mergedFrom) isn't an external reference
      const referencesVolunteer = /\bVolunteer[?\s]/.test(body) || /\bvolunteerId\b/.test(body)
      if (!referencesVolunteer) continue
      if (HANDLED_BY_MERGE_PLAN.has(name) || name in OUT_OF_SCOPE) continue
      unhandled.push(name)
    }
    expect(unhandled, `model(s) referencing Volunteer not handled by the member merge plan: ${unhandled.join(", ")}`).toEqual([])
  })

  it("the handled-models list isn't stale (every entry still exists and still references Volunteer)", () => {
    const byName = new Map(modelBlocks.map((m) => [m.name, m.body]))
    for (const name of HANDLED_BY_MERGE_PLAN) {
      const body = byName.get(name)
      expect(body, `model ${name} no longer exists in the schema`).toBeDefined()
      expect(/\bVolunteer[?\s]/.test(body!) || /\bvolunteerId\b/.test(body!), `model ${name} no longer references Volunteer`).toBe(true)
    }
    for (const name of Object.keys(OUT_OF_SCOPE)) {
      expect(byName.has(name), `model ${name} (OUT_OF_SCOPE) no longer exists in the schema`).toBe(true)
    }
  })
})
