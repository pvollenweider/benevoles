import { describe, it, expect } from "vitest"
import { parseCsv } from "../csv-import"
import { parseOnDuplicate, planDigest, planImport, planSummary } from "../member-import-plan"

const existing = [
  { id: "m-alice", email: "Alice@Example.com", tags: ["Bar", "parents"] },
  { id: "m-nomail", email: null, tags: ["Cuisine"] },
]

const csv = `prenom,nom,email,tags
Alice,Martin,alice@example.com,bar
Bob,Dupont,bob@example.com,"Accueil,parents"
,Sans,x@example.com,
Carla,Rossi,,
Bobby,Dupont,BOB@example.com ,
Dan,Invalide,pas-un-email,`

// Import preview (#464): one planner decides every line for the preview and the import.
describe("planImport", () => {
  it("sorts every line into create, update/skip, or error, with its line number", () => {
    const plan = planImport(parseCsv(csv), existing, "skip")
    expect(plan.lines.map((l) => [l.line, l.action, l.existingId])).toEqual([
      [2, "skip", "m-alice"],
      [3, "create", null],
      [5, "create", null],
    ])
    expect(plan.errors).toEqual([
      { line: 4, reason: "Prénom manquant" },
      { line: 6, reason: "Même email que la ligne 3" },
      { line: 7, reason: "Email invalide : pas-un-email" },
    ])
    expect(plan.counts).toEqual({ create: 2, update: 0, skip: 1, error: 3 })
  })

  it("applies the « update » choice, matching emails whatever their case", () => {
    const plan = planImport(parseCsv(csv), existing, "update")
    expect(plan.lines[0]).toMatchObject({ line: 2, action: "update", existingId: "m-alice", email: "alice@example.com", tags: ["bar"] })
    expect(plan.counts).toEqual({ create: 2, update: 1, skip: 0, error: 3 })
  })

  it("tells new tags from reused ones, case-insensitively, ignoring skipped lines", () => {
    expect(planImport(parseCsv(csv), existing, "skip")).toMatchObject({ newTags: ["Accueil"], reusedTags: ["parents"] })
    expect(planImport(parseCsv(csv), existing, "update")).toMatchObject({ newTags: ["Accueil"], reusedTags: ["Bar", "parents"] })
  })

  it("does not match members without an email", () => {
    const plan = planImport(parseCsv("prenom,nom\nCarla,Rossi\nCarla,Rossi"), existing, "update")
    expect(plan.counts).toMatchObject({ create: 2, update: 0 })
  })
})

describe("planDigest", () => {
  it("changes when a member appears meanwhile or the duplicate choice changes, not otherwise", () => {
    const parsed = parseCsv(csv)
    const base = planDigest(planImport(parsed, existing, "skip"), "skip")
    expect(planDigest(planImport(parseCsv(csv), existing, "skip"), "skip")).toBe(base)
    const withBob = [...existing, { id: "m-bob", email: "bob@example.com", tags: [] }]
    expect(planDigest(planImport(parsed, withBob, "skip"), "skip")).not.toBe(base)
    expect(planDigest(planImport(parsed, existing, "update"), "update")).not.toBe(base)
  })
})

describe("planSummary and parseOnDuplicate", () => {
  it("says the counts in one sentence, with plurals", () => {
    expect(planSummary({ create: 180, update: 52, skip: 8, error: 1 })).toBe("180 à créer, 52 à mettre à jour, 8 déjà présents ignorés, 1 ligne en erreur.")
    expect(planSummary({ create: 0, update: 0, skip: 1, error: 0 })).toBe("0 à créer, 0 à mettre à jour, 1 déjà présent ignoré, 0 ligne en erreur.")
  })

  it("defaults to skip for anything but « update »", () => {
    expect(parseOnDuplicate("update")).toBe("update")
    expect(parseOnDuplicate(null)).toBe("skip")
    expect(parseOnDuplicate("delete")).toBe("skip")
  })
})
