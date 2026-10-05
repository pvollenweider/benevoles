// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Re-derives the #667 deletion inventory from prisma/schema.prisma itself, the same technique as
 * member-merge-schema-guard.test.ts (#600): every model with a field typed `Volunteer` or named
 * `volunteerId` must be classified as either CASCADES (the database removes it with the Volunteer
 * row, nothing for member-deletion-transaction.ts to do) or BLOCKS (no onDelete clause — the
 * database refuses the delete unless member-deletion.ts's eligibility rule already guarantees zero
 * rows, as it does for Registration's `registrationCount`). A new relation to Volunteer added
 * later fails this test until it's classified one way or the other, so the deletion code can never
 * silently find out about it only from a failed delete in production.
 */

const CASCADES = new Set(["MemberInvite", "QuestionAnswer", "PushSubscription", "DeliveryOutcome", "DuplicateDismissal"])
/** No onDelete clause on their Volunteer relation: the database refuses to delete a Volunteer row
 * that still has one. member-deletion.ts's eligibility rule is what guarantees there are none left
 * by the time member-deletion-transaction.ts calls volunteer.delete(). */
const BLOCKS = new Set(["Registration"])

describe("member deletion — schema guard (#667)", () => {
  const schema = fs.readFileSync(path.join(__dirname, "..", "..", "..", "prisma", "schema.prisma"), "utf-8")
  const modelBlocks = [...schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)].map(([, name, body]) => ({ name, body }))

  it("found model blocks to check (schema isn't being misread)", () => {
    expect(modelBlocks.length).toBeGreaterThan(10)
  })

  it("every model referencing Volunteer is classified CASCADES or BLOCKS", () => {
    const unhandled: string[] = []
    for (const { name, body } of modelBlocks) {
      if (name === "Volunteer") continue // the self-relation (mergedInto/mergedFrom) isn't an external reference
      const referencesVolunteer = /\bVolunteer[?\s]/.test(body) || /\bvolunteerId\b/.test(body)
      if (!referencesVolunteer) continue
      if (CASCADES.has(name) || BLOCKS.has(name)) continue
      unhandled.push(name)
    }
    expect(unhandled, `model(s) referencing Volunteer not classified for member deletion: ${unhandled.join(", ")}`).toEqual([])
  })

  it("every CASCADES model really does declare onDelete: Cascade on its Volunteer relation", () => {
    const byName = new Map(modelBlocks.map((m) => [m.name, m.body]))
    for (const name of CASCADES) {
      const body = byName.get(name)
      expect(body, `model ${name} (CASCADES) no longer exists in the schema`).toBeDefined()
      // The Volunteer relation line itself, wherever it is in the block.
      const relationLine = body!.split("\n").find((l) => /\bVolunteer[?\s]/.test(l))
      expect(relationLine, `model ${name} (CASCADES) no longer has a Volunteer relation line`).toBeDefined()
      expect(relationLine, `model ${name} is listed as CASCADES but its Volunteer relation has no onDelete: Cascade`).toMatch(/onDelete:\s*Cascade/)
    }
  })

  it("every BLOCKS model still exists and still references Volunteer without a Cascade", () => {
    const byName = new Map(modelBlocks.map((m) => [m.name, m.body]))
    for (const name of BLOCKS) {
      const body = byName.get(name)
      expect(body, `model ${name} (BLOCKS) no longer exists in the schema`).toBeDefined()
      expect(/\bVolunteer[?\s]/.test(body!) || /\bvolunteerId\b/.test(body!), `model ${name} (BLOCKS) no longer references Volunteer`).toBe(true)
      const relationLine = body!.split("\n").find((l) => /\bVolunteer[?\s]/.test(l)) ?? ""
      expect(relationLine, `model ${name} is listed as BLOCKS but now cascades — member-deletion.ts's eligibility rule is stale`).not.toMatch(/onDelete:\s*Cascade/)
    }
  })
})
