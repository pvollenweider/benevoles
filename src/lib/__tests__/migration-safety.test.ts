import { describe, it, expect } from "vitest"
import { checkMigrations, editedMigrations, parseNameStatus, riskyStatements } from "../migration-safety"

const M = (dir: string) => `prisma/migrations/${dir}/migration.sql`

describe("parseNameStatus", () => {
  it("reads statuses and paths, a rename counting for both paths", () => {
    expect(parseNameStatus(`A\t${M("b")}\nM\t${M("a")}\nR100\t${M("c")}\t${M("d")}\n`)).toEqual([
      { status: "A", path: M("b") },
      { status: "M", path: M("a") },
      { status: "R100", path: M("c") },
      { status: "R100", path: M("d") },
    ])
  })
})

describe("applied migrations (#346)", () => {
  it("flags any modified, removed or renamed migration, not added ones or other files", () => {
    const changes = [
      { status: "A", path: M("new") },
      { status: "M", path: M("old") },
      { status: "D", path: M("gone") },
      { status: "R100", path: M("moved") },
      { status: "M", path: "prisma/migrations/migration_lock.toml" },
      { status: "M", path: "prisma/schema.prisma" },
    ]
    expect(editedMigrations(changes)).toEqual([M("old"), M("gone"), M("moved")])
  })
})

describe("riskyStatements", () => {
  it("flags removals, renames, type changes and new mandatory columns", () => {
    const sql = [
      `ALTER TABLE "Shift" ${"DROP"} COLUMN "label";`,
      `${"DROP"} TABLE "Old";`,
      `ALTER TABLE "Shift" RENAME COLUMN "a" TO "b";`,
      `ALTER TABLE "Old" RENAME TO "New";`,
      `ALTER TABLE "Shift" ALTER COLUMN "capacity" SET DATA TYPE BIGINT;`,
      `ALTER TABLE "Shift" ALTER COLUMN "note" SET NOT NULL;`,
      `ALTER TABLE "Shift" ADD COLUMN "x" TEXT NOT NULL;`,
    ].join("\n")
    expect(riskyStatements(sql)).toHaveLength(7)
  })

  it("lets expand-only changes through", () => {
    const sql = `
      CREATE TABLE "RateLimit" ("key" TEXT NOT NULL, "count" INTEGER NOT NULL, CONSTRAINT "pk" PRIMARY KEY ("key"));
      ALTER TABLE "Event" ADD COLUMN "requirePhone" BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE "Registration" ADD COLUMN "phone" TEXT;
      CREATE UNIQUE INDEX "i" ON "AdminUser" (lower(trim("email")));
      ALTER TABLE "Shift" VALIDATE CONSTRAINT "Shift_status_check";
      UPDATE "Volunteer" SET "email" = lower(trim("email"));
    `
    expect(riskyStatements(sql)).toEqual([])
  })

  it("ignores comments", () => {
    expect(riskyStatements(`-- we could ${"DROP"} COLUMN "x" later\n/* or RENAME TO y */\nSELECT 1;`)).toEqual([])
  })
})

describe("checkMigrations", () => {
  const files: Record<string, string> = {
    [M("risky")]: `ALTER TABLE "Shift" ${"DROP"} COLUMN "label";`,
    [M("acked")]: `-- migration-safety: column unused since 1.12, no deployed version reads it\nALTER TABLE "Shift" ${"DROP"} COLUMN "label";`,
    [M("safe")]: `ALTER TABLE "Registration" ADD COLUMN "phone" TEXT;`,
  }
  const read = (p: string) => files[p]

  it("fails on an edited migration and on an unacknowledged risky statement", () => {
    const report = checkMigrations([{ status: "M", path: M("old") }, { status: "A", path: M("risky") }], read)
    expect(report.errors).toHaveLength(2)
    expect(report.errors[0]).toContain("must not be edited")
    expect(report.errors[1]).toContain("migration-safety")
  })

  it("only reports an acknowledged risky statement", () => {
    expect(checkMigrations([{ status: "A", path: M("acked") }], read)).toEqual({
      errors: [],
      acknowledged: [expect.stringContaining("removes a table or column")],
    })
  })

  it("passes expand-only migrations", () => {
    expect(checkMigrations([{ status: "A", path: M("safe") }], read)).toEqual({ errors: [], acknowledged: [] })
  })
})
