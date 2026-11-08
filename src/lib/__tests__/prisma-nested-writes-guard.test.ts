// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

/**
 * F-08: the org-scoped Prisma client constrains the root operation only. A nested write under a
 * relation field (`registrations: { connect: { id } }`, `shifts: { create: [...] }`…) reaches the
 * child model without going through the extension, so an id from the request could attach a row
 * of another organization. This guard lists every such write in the API routes and in src/lib;
 * each one needs a one-line justification, and an entry that no longer matches fails the test.
 */

const ROOT = process.cwd()

const NESTED_OPERATIONS = new Set([
  "connect", "connectOrCreate", "create", "createMany", "set", "disconnect",
  "update", "updateMany", "upsert", "delete", "deleteMany",
])

/** Clauses never followed by writes: skipping them also avoids flagging `where: { event: { connect } }`. */
const NON_WRITE_CLAUSES = new Set(["where", "select", "include", "orderBy", "cursor", "distinct", "omit"])

export type NestedWrite = { file: string; line: number; field: string; operation: string }

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return null
}

/** The relation fields of prisma/schema.prisma: a field whose type is another model. */
export function relationFieldsFromSchema(schema: string): Set<string> {
  const models = new Set([...schema.matchAll(/^\s*model\s+(\w+)\s*\{/gm)].map((m) => m[1]))
  const fields = new Set<string>()
  for (const block of schema.matchAll(/^\s*model\s+\w+\s*\{([\s\S]*?)^\}/gm)) {
    for (const line of block[1].split(/\r?\n/)) {
      const field = line.match(/^\s*(\w+)\s+(\w+)(?:\[\])?\??(?:\s|$)/)
      if (field && models.has(field[2])) fields.add(field[1])
    }
  }
  return fields
}

/** Nested Prisma writes in one source: a relation field whose object starts with a write operation. */
export function findNestedWrites(source: string, file: string, relationFields: ReadonlySet<string>): NestedWrite[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const found: NestedWrite[] = []

  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)) {
      const field = propertyName(node.name)
      if (field && NON_WRITE_CLAUSES.has(field)) return
      if (field && relationFields.has(field) && ts.isObjectLiteralExpression(node.initializer)) {
        const first = node.initializer.properties[0]
        if (first && ts.isPropertyAssignment(first)) {
          const operation = propertyName(first.name)
          if (operation && NESTED_OPERATIONS.has(operation)) {
            found.push({ file, line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1, field, operation })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
}

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8")
}

/** .ts sources under src/app/api and src/lib, without tests, integration tests and declarations. */
function scannedFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (["__tests__", "__integration__", "node_modules"].includes(entry.name)) continue
      out.push(...scannedFiles(relative))
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      out.push(relative)
    }
  }
  return out
}

type AllowedWrite = { file: string; field: string; why: string }

/**
 * Every nested write that exists today, with why it cannot attach a row of another organization:
 * the parent is created in the same call, or its organization was checked before, and no id comes
 * from the request. A file and relation field can cover several writes (create and update).
 */
const ALLOWED: readonly AllowedWrite[] = [
  {
    file: "src/app/api/admin/events/[id]/duplicate/route.ts", field: "sectors",
    why: "Copies of the source's sectors, with ids made by duplicatePlan's newId; no request id and no connect.",
  },
  {
    file: "src/app/api/admin/events/[id]/duplicate/route.ts", field: "places",
    why: "Copies of the source's active places, with new ids; shifts point only to those copies, never to a source or request id.",
  },
  {
    file: "src/app/api/admin/events/[id]/duplicate/route.ts", field: "shifts",
    why: "Copied shifts of the new event; sectorId and placeId are remapped to the copies made in the same plan, or null.",
  },
  {
    file: "src/app/api/admin/events/[id]/duplicate/route.ts", field: "pages",
    why: "Custom pages copied under the new event; slug, title, content and order only, no id or connect.",
  },
  {
    file: "src/app/api/admin/events/[id]/duplicate/route.ts", field: "questions",
    why: "Copied questions of the new event, with ids made by newId; a parentId points to the copy of its parent, never to a source id.",
  },
  {
    file: "src/app/api/admin/events/from-template/route.ts", field: "shifts",
    why: "Shifts built from the static template list; dates, labels and capacity only, no id or connect.",
  },
  {
    file: "src/app/api/super-admin/organizations/route.ts", field: "admins",
    why: "First administrator of the organization just created by the operator; email and name from the validated request, no id.",
  },
  {
    file: "src/lib/event-availability-data.ts", field: "ranges",
    why: "Ranges of an availability day just created, on the event whose organization was checked; times only, no id.",
  },
  {
    file: "src/lib/signup-server.ts", field: "admins",
    why: "Owner account of the organization just created by the sign-up; email and name from the validated request, no id.",
  },
]

const RELATION_FIELDS = relationFieldsFromSchema(read("prisma/schema.prisma"))
const FILES = [...scannedFiles("src/app/api"), ...scannedFiles("src/lib")].sort()
const FOUND = FILES.flatMap((file) => findNestedWrites(read(file), file, RELATION_FIELDS))

const label = (write: NestedWrite) => `${write.file}:${write.line} ${write.field}.${write.operation}`
const key = (write: Pick<NestedWrite, "file" | "field">) => `${write.file}\u0000${write.field}`

describe("Prisma nested writes guard (F-08)", () => {
  it("scans the API routes and src/lib with the schema's relation fields", () => {
    expect(RELATION_FIELDS.size).toBeGreaterThan(50)
    expect(FILES).toContain("src/lib/signup-server.ts")
    expect(FILES).toContain("src/app/api/admin/events/[id]/duplicate/route.ts")
    expect(FOUND.length).toBeGreaterThan(0)
  })

  it("declares every nested write with its justification", () => {
    const allowed = new Set(ALLOWED.map(key))
    const undeclared = FOUND.filter((write) => !allowed.has(key(write)))
    expect(undeclared.map(label), "declare these nested writes in ALLOWED with a justification").toEqual([])
  })

  it("fails on a stale entry, so the allowed list cannot grow without code", () => {
    const present = new Set(FOUND.map(key))
    const stale = ALLOWED.filter((entry) => !present.has(key(entry)))
    expect(stale.map((entry) => `${entry.file} ${entry.field}`), "remove these stale ALLOWED entries").toEqual([])
  })

  it("keeps a non-empty justification for every entry", () => {
    for (const entry of ALLOWED) expect(entry.why.trim().length, `${entry.file} ${entry.field}`).toBeGreaterThan(20)
  })
})

describe("findNestedWrites", () => {
  const relations = new Set(["registrations", "event", "shifts", "questions"])

  it("detects a nested connect", () => {
    const found = findNestedWrites(
      `const data = { registrations: { connect: { id: otherId } } }`,
      "inline.ts", relations,
    )
    expect(found.map(({ field, operation }) => ({ field, operation }))).toEqual([{ field: "registrations", operation: "connect" }])
  })

  it("detects a multi-line nested createMany with an array", () => {
    const found = findNestedWrites(`db.event.create({
      data: {
        questions: {
          createMany: {
            data: [
              { label: "Un lien ?" },
            ],
          },
        },
      },
    })`, "inline.ts", relations)
    expect(found.map(({ field, operation }) => ({ field, operation }))).toEqual([{ field: "questions", operation: "createMany" }])
  })

  it("detects a nested deleteMany in an update", () => {
    const found = findNestedWrites(
      `db.event.update({ where: { id }, data: { shifts: { deleteMany: {} } } })`,
      "inline.ts", relations,
    )
    expect(found.map(({ field, operation }) => ({ field, operation }))).toEqual([{ field: "shifts", operation: "deleteMany" }])
  })

  it("does not flag a top-level upsert's create and update arguments", () => {
    const found = findNestedWrites(`prisma.event.upsert({
      where: { id: "e1" },
      create: { title: "x", organizationId: "o1" },
      update: { title: "y" },
    })`, "inline.ts", relations)
    expect(found).toEqual([])
  })

  it("still flags a nested write inside the create of a top-level upsert", () => {
    const found = findNestedWrites(`prisma.event.upsert({
      where: { id: "e1" },
      create: { shifts: { create: [{ label: "x" }] } },
      update: { title: "y" },
    })`, "inline.ts", relations)
    expect(found.map(({ field, operation }) => ({ field, operation }))).toEqual([{ field: "shifts", operation: "create" }])
  })

  it("does not flag a TypeScript type", () => {
    const found = findNestedWrites(
      `type Counts = { counts: { create: number; update: number }; shifts: { create: number } }`,
      "inline.ts", relations,
    )
    expect(found).toEqual([])
  })

  it("does not flag where, select and include clauses", () => {
    const found = findNestedWrites(`prisma.event.findFirst({
      where: { event: { connect: { id: "e1" } } },
      select: { shifts: { select: { id: true } } },
      include: { questions: { where: { id: "q1" } } },
    })`, "inline.ts", relations)
    expect(found).toEqual([])
  })

  it("does not flag an object key that is not a relation field", () => {
    const found = findNestedWrites(`const plan = { counts: { create: count("create"), update: count("update") } }`, "inline.ts", relations)
    expect(found).toEqual([])
  })
})
