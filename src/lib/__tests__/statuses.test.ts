import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { CHECKED_COLUMNS } from "../statuses"

// The CHECK constraints (#321) and src/lib/statuses.ts must list the same values: a value only
// in the code would be rejected by the database, one only in the database is dead.
const sql = readFileSync(join(process.cwd(), "prisma/migrations/20260929200000_status_check_constraints/migration.sql"), "utf8")

describe("status value sets match the database CHECK constraints", () => {
  const constraints = new Map(
    [...sql.matchAll(/ALTER TABLE "(\w+)" ADD CONSTRAINT "\w+" CHECK \("(\w+)" IN \(([^)]*)\)\)/g)]
      .map(([, table, column, values]) => [`${table}.${column}`, values.split(",").map((v) => v.trim().replace(/^'|'$/g, ""))]),
  )

  it("same columns", () => {
    expect([...constraints.keys()].sort()).toEqual(Object.keys(CHECKED_COLUMNS).sort())
  })

  for (const [column, values] of Object.entries(CHECKED_COLUMNS)) {
    it(`${column}: same values`, () => {
      expect(constraints.get(column)).toEqual([...values])
    })
  }
})
