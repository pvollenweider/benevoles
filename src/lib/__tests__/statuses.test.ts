import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "fs"
import { join } from "path"
import { ADMIN_ROLES, CHECKED_COLUMNS } from "../statuses"
import { ORG_ROLES } from "../permissions"

// The CHECK constraints (#321) and src/lib/statuses.ts must list the same values: a value only
// in the code would be rejected by the database, one only in the database is dead.
// Every migration in order: a later one may drop and re-add a constraint to widen it (#484).
const dir = join(process.cwd(), "prisma/migrations")
const sql = readdirSync(dir).filter((d) => /^\d{14}_/.test(d)).sort()
  .map((d) => { try { return readFileSync(join(dir, d, "migration.sql"), "utf8") } catch { return "" } }).join("\n")

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

// Regression: #469 added the organiser role in permissions.ts only, so both lists above stayed in
// sync and every organiser invitation hit the constraint in production.
describe("organisation roles can be stored", () => {
  it.each([...ORG_ROLES])("%s is an allowed AdminUser.role", (role) => {
    expect(ADMIN_ROLES).toContain(role)
  })
})
