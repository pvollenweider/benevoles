// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  REGISTRATION_FIELDS_ON_ERASURE,
  VOLUNTEER_FIELDS_ON_ERASURE,
  VOLUNTEER_REFERENCES_WITHOUT_FK,
  VOLUNTEER_RELATIONS,
} from "../member-inventory"
import { erasedVolunteerData, ERASED_REGISTRATION_DATA } from "../member-erasure"

/**
 * Re-derives the #516 erasure inventory from prisma/schema.prisma, the same technique as the merge
 * (#600) and deletion (#667) guards, which share src/lib/member-inventory.ts with it: every model
 * referencing Volunteer must say what an erasure does with it, and every column of Volunteer and
 * Registration must be classified — a new personal field added later fails here until the erasure
 * clears it (or says why it keeps it).
 */

const schema = fs.readFileSync(path.join(__dirname, "..", "..", "..", "prisma", "schema.prisma"), "utf-8")
const modelBlocks = [...schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)].map(([, name, body]) => ({ name, body }))
const byName = new Map(modelBlocks.map((m) => [m.name, m.body]))

/** Scalar columns of a model block (relation fields, typed by another model, are left out). */
function scalarColumns(model: string): string[] {
  const body = byName.get(model)!
  const models = new Set(modelBlocks.map((m) => m.name))
  const cols: string[] = []
  for (const raw of body.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue
    const m = line.match(/^(\w+)\s+(\w+)(\[\])?\??/)
    if (!m) continue
    if (models.has(m[2])) continue // relation field
    cols.push(m[1])
  }
  return cols
}

describe("member erasure — schema guard (#516)", () => {
  it("found model blocks to check (schema isn't being misread)", () => {
    expect(modelBlocks.length).toBeGreaterThan(10)
    expect(scalarColumns("Volunteer")).toContain("email")
    expect(scalarColumns("Registration")).toContain("comment")
  })

  it("every model referencing Volunteer says what an erasure does with it", () => {
    const unhandled: string[] = []
    for (const { name, body } of modelBlocks) {
      if (name === "Volunteer") continue
      const referencesVolunteer = /\bVolunteer[?\s]/.test(body) || /\bvolunteerId\b/.test(body)
      if (!referencesVolunteer) continue
      if (!VOLUNTEER_RELATIONS[name]?.erasure) unhandled.push(name)
    }
    expect(unhandled, `model(s) referencing Volunteer not classified for erasure in member-inventory.ts: ${unhandled.join(", ")}`).toEqual([])
  })

  it("the references without a foreign key still exist", () => {
    for (const name of Object.keys(VOLUNTEER_REFERENCES_WITHOUT_FK)) {
      expect(byName.has(name), `model ${name} no longer exists in the schema`).toBe(true)
    }
  })

  it("every Volunteer column is classified, and the classification matches what the erasure writes", () => {
    const cols = scalarColumns("Volunteer")
    const unclassified = cols.filter((c) => !(c in VOLUNTEER_FIELDS_ON_ERASURE))
    expect(unclassified, `Volunteer column(s) not classified for erasure: ${unclassified.join(", ")}`).toEqual([])
    const stale = Object.keys(VOLUNTEER_FIELDS_ON_ERASURE).filter((c) => !cols.includes(c))
    expect(stale, `classified column(s) no longer on Volunteer: ${stale.join(", ")}`).toEqual([])
    const cleared = Object.entries(VOLUNTEER_FIELDS_ON_ERASURE).filter(([, v]) => v === "clear").map(([k]) => k).sort()
    expect(Object.keys(erasedVolunteerData(new Date())).sort()).toEqual(cleared)
  })

  it("every Registration column is classified, and the cleared ones match what the erasure writes", () => {
    const cols = scalarColumns("Registration")
    const unclassified = cols.filter((c) => !(c in REGISTRATION_FIELDS_ON_ERASURE))
    expect(unclassified, `Registration column(s) not classified for erasure: ${unclassified.join(", ")}`).toEqual([])
    const stale = Object.keys(REGISTRATION_FIELDS_ON_ERASURE).filter((c) => !cols.includes(c))
    expect(stale, `classified column(s) no longer on Registration: ${stale.join(", ")}`).toEqual([])
    const cleared = Object.entries(REGISTRATION_FIELDS_ON_ERASURE).filter(([, v]) => v === "clear").map(([k]) => k).sort()
    expect(Object.keys(ERASED_REGISTRATION_DATA).sort()).toEqual(cleared)
  })
})
